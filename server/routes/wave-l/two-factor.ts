import type { Express, Request, Response } from "express";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import rateLimit from "express-rate-limit";
import { db } from "../../storage";
import { storage } from "../../storage";
import { requireAuth, createSession, setSessionCookie } from "../../session";
import { hashPassword, verifyPassword } from "../../lib/auth";
import { now } from "../../engines";
import { preAuthTokenStore } from "../../lib/pre-auth-tokens";
import { user2fa } from "@shared/schema";
import { eq } from "drizzle-orm";

// ══════════════════════════════════════════════════════════════
//  2FA TOTP Utilities
// ══════════════════════════════════════════════════════════════

function getEncryptionKey(): Buffer {
  const key = process.env.TOTP_ENCRYPTION_KEY;
  if (!key) throw new Error("TOTP_ENCRYPTION_KEY environment variable is required for 2FA");
  return scryptSync(key, "offload-2fa-salt", 32);
}

function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decryptSecret(encryptedStr: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = encryptedStr.split(":");
  if (!ivHex || !authTagHex || !encrypted) throw new Error("Invalid encrypted secret format");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function generateBackupCodes(count = 10): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = randomBytes(4).toString("hex");
    plain.push(code);
    hashed.push(hashPassword(code));
  }
  return { plain, hashed };
}

// TOTP helpers using otplib's low-level API
async function totpGenerateSecret(): Promise<string> {
  const { generateSecret } = await import("otplib");
  return generateSecret();
}

async function totpGenerateURI(account: string, issuer: string, secret: string): Promise<string> {
  const { generateURI } = await import("otplib");
  return generateURI({ strategy: "totp", label: account, issuer, secret });
}

async function totpVerify(token: string, secret: string): Promise<boolean> {
  const { verifySync } = await import("otplib");
  try {
    const result = verifySync({ token, secret });
    return result.valid;
  } catch {
    return false;
  }
}

export function registerTwoFactorRoutes(app: Express): void {
  // ── Rate limiters for 2FA endpoints ──
  const twoFaChallengeLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many 2FA attempts. Please try again later." },
    keyGenerator: (req) => {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const userId = req.body?.user_id || "anon";
      return `${ip}:${userId}`;
    },
  });

  const twoFaSetupLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many 2FA setup attempts. Please try again later." },
    keyGenerator: (req) => {
      const user = (req as any).currentUser;
      return `2fa-setup:${user?.id || req.ip || "unknown"}`;
    },
  });

  const twoFaVerifyLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many 2FA verification attempts. Please try again later." },
    keyGenerator: (req) => {
      const user = (req as any).currentUser;
      return `2fa-verify:${user?.id || req.ip || "unknown"}`;
    },
  });

  // ══════════════════════════════════════════════════════════
  //  2FA TOTP
  // ══════════════════════════════════════════════════════════

  app.post("/api/2fa/setup", requireAuth(), twoFaSetupLimit, async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;

      const [existing] = await db.select().from(user2fa).where(eq(user2fa.userId, user.id));
      if (existing?.enabled) {
        return res.status(409).json({ error: "2FA is already enabled. Disable first to reconfigure." });
      }

      const secret = await totpGenerateSecret();
      const encryptedSecret = encryptSecret(secret);
      const { plain: backupCodes, hashed: backupCodesHashed } = generateBackupCodes(10);
      const otpauth = await totpGenerateURI(user.email || user.username, "Offload", secret);

      if (existing) {
        await db
          .update(user2fa)
          .set({
            totpSecretEnc: encryptedSecret,
            backupCodesHash: JSON.stringify(backupCodesHashed),
            enabled: false,
            verifiedAt: null,
          })
          .where(eq(user2fa.userId, user.id));
      } else {
        await db.insert(user2fa).values({
          userId: user.id,
          method: "totp",
          totpSecretEnc: encryptedSecret,
          backupCodesHash: JSON.stringify(backupCodesHashed),
          enabled: false,
        });
      }

      res.json({
        otpauth,
        secret,
        backupCodes,
        message: "Scan the QR code, then verify with POST /api/2fa/verify",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/2fa/verify", requireAuth(), twoFaVerifyLimit, async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const { token } = req.body;

      if (!token) return res.status(400).json({ error: "token is required" });

      const [record] = await db.select().from(user2fa).where(eq(user2fa.userId, user.id));
      if (!record) return res.status(404).json({ error: "2FA not set up. Call POST /api/2fa/setup first." });
      if (!record.totpSecretEnc) return res.status(400).json({ error: "No TOTP secret configured" });

      const secret = decryptSecret(record.totpSecretEnc);
      const valid = await totpVerify(token, secret);
      if (!valid) return res.status(401).json({ error: "Invalid TOTP token" });

      await db
        .update(user2fa)
        .set({ enabled: true, verifiedAt: now() })
        .where(eq(user2fa.userId, user.id));

      res.json({ success: true, message: "2FA is now enabled" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/2fa", requireAuth(), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const { token } = req.body;

      if (!token) return res.status(400).json({ error: "Current TOTP token required to disable 2FA" });

      const [record] = await db.select().from(user2fa).where(eq(user2fa.userId, user.id));
      if (!record || !record.enabled) return res.status(404).json({ error: "2FA is not enabled" });
      if (!record.totpSecretEnc) return res.status(400).json({ error: "No TOTP secret configured" });

      const secret = decryptSecret(record.totpSecretEnc);
      const valid = await totpVerify(token, secret);
      if (!valid) return res.status(401).json({ error: "Invalid TOTP token" });

      await db.delete(user2fa).where(eq(user2fa.userId, user.id));
      res.json({ success: true, message: "2FA has been disabled" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/2fa-challenge", twoFaChallengeLimit, async (req: Request, res: Response) => {
    try {
      const { user_id, token, backup_code, pre_auth_token } = req.body;

      if (!user_id) return res.status(400).json({ error: "user_id is required" });
      if (!token && !backup_code) return res.status(400).json({ error: "token or backup_code is required" });

      // Require valid pre-auth token (issued by login endpoint when 2FA is needed)
      if (!pre_auth_token || !preAuthTokenStore.validate(pre_auth_token, user_id)) {
        return res.status(403).json({ error: "Invalid or expired pre-auth token. Please log in again." });
      }

      const [record] = await db.select().from(user2fa).where(eq(user2fa.userId, user_id));
      if (!record || !record.enabled) {
        return res.status(400).json({ error: "2FA is not enabled for this user" });
      }

      let verified = false;
      let message = "";
      let extra: Record<string, any> = {};

      if (token) {
        if (!record.totpSecretEnc) return res.status(400).json({ error: "No TOTP secret configured" });
        const secret = decryptSecret(record.totpSecretEnc);
        const valid = await totpVerify(token, secret);
        if (!valid) return res.status(401).json({ error: "Invalid TOTP token" });
        verified = true;
        message = "2FA verified";
      } else if (backup_code && record.backupCodesHash) {
        let hashes: string[];
        try {
          hashes = JSON.parse(record.backupCodesHash);
        } catch {
          return res.status(500).json({ error: "Backup codes corrupted" });
        }

        let found = -1;
        for (let i = 0; i < hashes.length; i++) {
          if (verifyPassword(backup_code, hashes[i])) {
            found = i;
            break;
          }
        }

        if (found === -1) return res.status(401).json({ error: "Invalid backup code" });

        hashes.splice(found, 1);
        await db
          .update(user2fa)
          .set({ backupCodesHash: JSON.stringify(hashes) })
          .where(eq(user2fa.userId, user_id));

        verified = true;
        message = "2FA verified via backup code";
        extra = { remainingBackupCodes: hashes.length };
      }

      if (!verified) {
        return res.status(400).json({ error: "No valid verification provided" });
      }

      // Consume the pre-auth token and issue a real session
      preAuthTokenStore.consume(pre_auth_token, user_id);
      const user = await storage.getUser(user_id);
      if (!user) return res.status(404).json({ error: "User not found" });
      const sessionToken = await createSession(user.id, user.role);
      setSessionCookie(res, sessionToken);

      return res.json({ success: true, message, ...extra, user: { ...user, password: undefined }, token: sessionToken });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
