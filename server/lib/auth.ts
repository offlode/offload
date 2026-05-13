import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { LRUCache } from "lru-cache";

// ════════════════════════════════════════════════════════════════
//  PASSWORD HASHING
// ════════════════════════════════════════════════════════════════

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function safeEqualHex(left: string, right: string): boolean {
  try {
    const leftBuf = Buffer.from(left, "hex");
    const rightBuf = Buffer.from(right, "hex");
    if (leftBuf.length === 0 || leftBuf.length !== rightBuf.length) return false;
    return timingSafeEqual(leftBuf, rightBuf);
  } catch {
    return false;
  }
}

export function isLegacyPasswordHash(stored: string): boolean {
  return !!stored && !stored.startsWith("scrypt:");
}

export function verifyPassword(pw: string, stored: string): boolean {
  // Support legacy SHA-256 hashes during migration
  if (isLegacyPasswordHash(stored)) {
    const computed = createHash("sha256").update(pw).digest("hex");
    return safeEqualHex(computed, stored);
  }
  const [, salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = scryptSync(pw, salt, 64).toString("hex");
  return safeEqualHex(computed, hash);
}

// ════════════════════════════════════════════════════════════════
//  LOGIN RATE LIMITING
// ════════════════════════════════════════════════════════════════

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const loginAttempts = new LRUCache<string, { count: number; firstAttempt: number }>({
  max: 10_000,
  ttl: 60 * 60 * 1000,
});
const MAX_LOGIN_ATTEMPTS = 10;

export function checkLoginRateLimit(ip: string): boolean {
  const record = loginAttempts.get(ip);
  if (!record) return true;
  if (Date.now() - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return true;
  }
  return record.count < MAX_LOGIN_ATTEMPTS;
}

export function recordLoginAttempt(ip: string): void {
  const record = loginAttempts.get(ip);
  if (!record || Date.now() - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: Date.now() });
  } else {
    loginAttempts.set(ip, { ...record, count: record.count + 1 });
  }
}
