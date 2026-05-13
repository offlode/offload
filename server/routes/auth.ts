import type { Express } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import rateLimit from "express-rate-limit";
import { Resend } from "resend";
import { jwtVerify } from "jose";
import { storage } from "../storage";
import { hashPassword, verifyPassword, isLegacyPasswordHash, checkLoginRateLimit, recordLoginAttempt } from "../lib/auth";
import { now, notifyUser } from "../engines";
import {
  requireAuth,
  getSessionTokenFromRequest,
  setSessionCookie, clearSessionCookie,
  createSession, destroySession,
  APPLE_ISSUER, APPLE_AUDIENCE, appleJWKS,
} from "../session";

const makeRouteLimiter = (max: number) => rateLimit({
  windowMs: 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
});

export function registerAuthRoutes(app: Express) {
  const authLoginLimiter = makeRouteLimiter(5);
  const authRegisterLimiter = makeRouteLimiter(3);
  const forgotPasswordLimiter = makeRouteLimiter(3);

  // ─────────────────────────────────────────────────────────
  //  AUTH
  // ─────────────────────────────────────────────────────────

  app.post("/api/auth/register", authRegisterLimiter, async (req, res) => {
    const RegisterBody = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional().nullable(),
      password: z.string().min(8, "Password must be at least 8 characters"),
      referralCode: z.string().optional(),
    });
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const { name, email, phone, password, referralCode } = parsed.data;
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: "Email already in use" });
    }

    // Generate unique referral code for new user
    const newReferralCode = name.toUpperCase().replace(/\s+/g, "-").substring(0, 8) + "-" + Date.now().toString(36).toUpperCase().substring(0, 4);

    // Check referrer
    let referrerId: number | undefined;
    if (referralCode) {
      // Find user with this referral code by searching all users
      const allUsers = await storage.getUsersByRole("customer");
      const referrer = allUsers.find(u => u.referralCode === referralCode);
      if (referrer) referrerId = referrer.id;
    }

    const user = await storage.createUser({
      username: email.split("@")[0] + "_" + Date.now(),
      password: hashPassword(password),
      name,
      email,
      phone: phone || null,
      role: "customer",
      memberSince: new Date().toISOString().split("T")[0],
      loyaltyPoints: referrerId ? 100 : 0, // 100 bonus points if referred
      loyaltyTier: "bronze",
      referralCode: newReferralCode,
      referredBy: referrerId,
    });

    // If referred, create referral record
    if (referrerId) {
      await storage.createReferral({
        referrerId,
        refereeId: user.id,
        status: "pending",
        referrerReward: 10,
        refereeReward: 10,
        createdAt: now(),
      });
      // Bonus points for referee
      await storage.createLoyaltyTransaction({
        userId: user.id,
        type: "referral",
        points: 100,
        description: "Referral signup bonus — Welcome to Offload!",
        createdAt: now(),
      });
    }

    // Welcome notification
    await notifyUser(user.id, null, "system", "Welcome to Offload!", `Hey ${name}, welcome aboard! Your account is set up and ready to go.`, "/");

    const token = await createSession(user.id, user.role);
    setSessionCookie(res, token);
    res.status(201).json({ user: { ...user, password: undefined }, token });
  });

  app.post("/api/auth/login", authLoginLimiter, async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkLoginRateLimit(ip)) {
      return res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
    }

    const LoginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const { email, password } = parsed.data;
    const user = await storage.getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password)) {
      recordLoginAttempt(ip);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const loginUpdates: any = { lastActiveAt: now() };
    if (isLegacyPasswordHash(user.password)) {
      loginUpdates.password = hashPassword(password);
    }
    // Create server-side session and return token
    const token = await createSession(user.id, user.role);
    await storage.updateUser(user.id, loginUpdates);
    setSessionCookie(res, token);
    res.json({ user: { ...user, password: undefined }, token });
  });

  // Demo login removed — use real auth only
  // (endpoint kept as 404 to avoid silent failures in old clients)
  app.post("/api/auth/demo-login", (_req, res) => {
    res.status(404).json({ error: "Demo login is not available in production" });
  });

  // ── Sign in with Apple ──
  // Accepts identity_token (JWT) from native iOS Sign-in with Apple flow,
  // verifies Apple's RS256 signature/JWKS, then finds or creates a user.
  app.post("/api/auth/apple", async (req, res) => {
    try {
      const AppleBody = z.object({
        identityToken: z.string().min(1),
        fullName: z.any().optional(),
        user: z.string().optional(),
        nonce: z.string().optional(),
      }).strip();
      const parsedApple = AppleBody.safeParse(req.body);
      if (!parsedApple.success) {
        return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedApple.error.issues });
      }
      const { identityToken, fullName, user: appleUserId, nonce } = parsedApple.data;

      let payload: any;
      try {
        const verified = await jwtVerify(String(identityToken), appleJWKS, {
          issuer: APPLE_ISSUER,
          audience: APPLE_AUDIENCE,
          algorithms: ["RS256"],
          requiredClaims: ["iss", "aud", "exp", "sub"],
        });
        payload = verified.payload;
        if (verified.protectedHeader.alg !== "RS256") {
          return res.status(401).json({ error: "Invalid token algorithm" });
        }
        if (!verified.protectedHeader.kid) {
          return res.status(401).json({ error: "Invalid token key id" });
        }
      } catch (err: any) {
        console.warn("[apple-auth] token verification failed:", err?.message || err);
        return res.status(401).json({ error: "Invalid identity token" });
      }

      if (nonce) {
        if (payload.nonce_supported !== true) {
          return res.status(401).json({ error: "Nonce not supported by identity token" });
        }
        if (payload.nonce !== nonce) {
          return res.status(401).json({ error: "Invalid token nonce" });
        }
      }

      const sub: string = payload.sub || appleUserId;
      const email: string | undefined = payload.email;
      if (!sub) {
        return res.status(400).json({ error: "Missing Apple user identifier" });
      }

      // Stable Apple-derived email: Apple may send a private relay email or the real one
      // Use the email from the token; if missing, generate a placeholder using sub.
      const effectiveEmail = email || `apple_${sub.replace(/[^a-zA-Z0-9]/g, "").substring(0, 24)}@privaterelay.appleid.com`;

      // Try finding existing user by email first, then by appleSub if we tracked it
      let user = await storage.getUserByEmail(effectiveEmail);

      if (!user) {
        // Create new account — customer role, no password (Apple-only)
        const displayName = (fullName && (fullName.givenName || fullName.familyName))
          ? `${fullName.givenName || ""} ${fullName.familyName || ""}`.trim()
          : (effectiveEmail.split("@")[0] || "Apple User");
        const username = `apple_${sub.substring(0, 16)}_${Date.now()}`;
        user = await storage.createUser({
          username,
          password: hashPassword(randomBytes(32).toString("hex")), // unguessable random
          name: displayName,
          email: effectiveEmail,
          phone: null,
          role: "customer",
          memberSince: new Date().toISOString().split("T")[0],
          loyaltyPoints: 0,
          loyaltyTier: "bronze",
          referralCode: displayName.toUpperCase().replace(/\s+/g, "-").substring(0, 8) + "-" + Date.now().toString(36).toUpperCase().substring(0, 4),
        });
        await notifyUser(user.id, null, "system", "Welcome to Offload!", `Hey ${displayName}, welcome aboard. Your account is ready.`, "/");
      } else {
        await storage.updateUser(user.id, { lastActiveAt: now() });
      }

      const token = await createSession(user.id, user.role);
      setSessionCookie(res, token);
      res.json({ user: { ...user, password: undefined }, token });
    } catch (err: any) {
      console.error("[apple-auth] error:", err);
      res.status(500).json({ error: "Apple sign-in failed" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = getSessionTokenFromRequest(req);
    if (token) await destroySession(token);
    clearSessionCookie(res);
    res.json({ success: true });
  });

  // ── Forgot Password ──
  app.post("/api/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
    const ForgotBody = z.object({ email: z.string().email() });
    const parsed = ForgotBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const { email } = parsed.data;

    // Always return 200 to avoid leaking whether email exists
    const successMsg = { message: "If an account with that email exists, a password reset link has been sent." };

    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.json(successMsg);
    }

    // Generate secure token
    const resetToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

    await storage.createPasswordResetToken(user.id, resetToken, expiresAt);

    // Send email via Resend
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const resetUrl = `https://offloadusa.com/#/reset-password?token=${resetToken}`;
      try {
        const result = await resend.emails.send({
          from: "Offload <notifications@offloadusa.com>",
          to: user.email,
          subject: "Reset your Offload password",
          html: `<div style="font-family:Inter,Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;">
            <div style="text-align:center;margin-bottom:24px;">
              <h1 style="color:#5B4BC4;font-size:24px;margin:0;">Offload</h1>
            </div>
            <h2 style="color:#1A1A1A;font-size:18px;">Reset your password</h2>
            <p style="color:#555;font-size:14px;line-height:1.6;">Hi ${user.name || "there"},</p>
            <p style="color:#555;font-size:14px;line-height:1.6;">We received a request to reset your password. Click the button below to choose a new password:</p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${resetUrl}" style="background:#5B4BC4;color:#fff;padding:12px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Reset Password</a>
            </div>
            <p style="color:#888;font-size:12px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
            <p style="color:#aaa;font-size:11px;text-align:center;">&copy; ${new Date().getFullYear()} Offload USA &mdash; Fresh clothes, zero hassle.</p>
          </div>`,
        });
        console.log(`[Email] Password reset sent to user#${user.id}: ${(result as any)?.data?.id || (result as any)?.id || "accepted"}`);
      } catch (err: any) {
        console.error(`[Email] Failed to send password reset to user#${user.id}:`, err);
        return res.status(500).json({ error: "Failed to send password reset email" });
      }
    } else {
      console.log(`[Email] Would send password reset to user#${user.id} (no RESEND_API_KEY)`);
    }

    res.json(successMsg);
  });

  // ── Reset Password ──
  app.post("/api/auth/reset-password", async (req, res) => {
    const ResetBody = z.object({ token: z.string().min(1), password: z.string().min(8, "Password must be at least 8 characters") });
    const parsed = ResetBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const { token, password } = parsed.data;

    const resetRecord = await storage.getPasswordResetToken(token);
    if (!resetRecord) {
      return res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
    }
    if (resetRecord.usedAt) {
      return res.status(400).json({ error: "This reset link has already been used. Please request a new one." });
    }
    if (new Date(resetRecord.expiresAt) < new Date()) {
      return res.status(400).json({ error: "This reset link has expired. Please request a new one." });
    }

    // Update password
    const hashedPassword = hashPassword(password);
    await storage.updateUser(resetRecord.userId, { password: hashedPassword });

    // Mark token as used
    await storage.markPasswordResetTokenUsed(token);

    // Invalidate all existing sessions for this user
    await storage.deleteSessionsByUser(resetRecord.userId);

    res.json({ message: "Password has been reset successfully. You can now log in." });
  });

  // Session validation endpoint
  app.get("/api/auth/me", requireAuth(), async (req, res) => {
    const user = (req as any).currentUser;
    // C-A1 support: surface vendorProfile / driverProfile so staff & driver SPAs don't
    // have to fall back to a hardcoded vendorId/driverId. If lookup fails (e.g. the user
    // is a vendor account whose vendor row was deleted) return null and let the client
    // show a real error state rather than silently leaking another vendor's data.
    let vendorProfile: any = null;
    let driverProfile: any = null;
    try {
      if (["vendor", "laundromat", "manager", "staff"].includes(user.role)) {
        vendorProfile = await storage.getVendorByUserId(user.id) ?? null;
      }
      if (user.role === "driver") {
        driverProfile = await storage.getDriverByUserId(user.id) ?? null;
      }
    } catch (_err) {
      // swallow — the client must handle null profile.
    }
    res.json({ user: { ...user, password: undefined, vendorProfile, driverProfile } });
  });
}
