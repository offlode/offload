import { createHash, randomBytes, scryptSync } from "crypto";

// ════════════════════════════════════════════════════════════════
//  PASSWORD HASHING
// ════════════════════════════════════════════════════════════════

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  // Support legacy SHA-256 hashes during migration
  if (!stored.startsWith("scrypt:")) {
    return createHash("sha256").update(pw).digest("hex") === stored;
  }
  const [, salt, hash] = stored.split(":");
  const computed = scryptSync(pw, salt, 64).toString("hex");
  return computed === hash;
}

// ════════════════════════════════════════════════════════════════
//  LOGIN RATE LIMITING
// ════════════════════════════════════════════════════════════════

const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

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
    record.count++;
  }
}

// Clean up rate limit records every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of Array.from(loginAttempts.entries())) {
    if (now - record.firstAttempt > LOGIN_WINDOW_MS) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000);
