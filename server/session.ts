import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";
import { createRemoteJWKSet } from "jose";
import { storage } from "./storage";

export interface SessionData {
  userId: number;
  role: string;
}

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_COOKIE = "offload_session";
export const ADMIN_ROLES = ["admin", "manager"];

export const APPLE_ISSUER = "https://appleid.apple.com";
export const APPLE_AUDIENCE = "com.offloadusa.app";
export const appleJWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"), {
  cacheMaxAge: 60 * 60 * 1000,
  cooldownDuration: 30_000,
});

export function isAdminOrManager(user: any): boolean {
  return !!user && ADMIN_ROLES.includes(user.role);
}

export function formatCents(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return `$${(safe / 100).toFixed(2)}`;
}

export function dollarsToCreditCents(dollars: number): number {
  return Math.round((Number.isFinite(dollars) ? dollars : 0) * 100);
}

export function getCookieValue(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie || "";
  const pair = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  if (!pair) return null;
  return decodeURIComponent(pair.slice(name.length + 1));
}

export function getBearerTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

export function getSessionTokenFromRequest(req: Request): string | null {
  return getBearerTokenFromRequest(req) || getCookieValue(req, SESSION_COOKIE);
}

function isStateChangingMethod(method: string): boolean {
  return method === "POST" || method === "PATCH" || method === "DELETE" || method === "PUT";
}

export function requireBearerToken(req: Request, res: Response, next: NextFunction) {
  // CSRF hardening: production cookies are SameSite=None for cross-origin admin SPA
  // support, so state-changing API calls must authenticate with an Authorization:
  // Bearer token. Cookie-only auth remains accepted for GET/read-only requests.
  if (!isStateChangingMethod(req.method)) return next();
  const bearer = getBearerTokenFromRequest(req);
  const cookieToken = getCookieValue(req, SESSION_COOKIE);
  if (!bearer && cookieToken) {
    return res.status(403).json({ error: "Bearer token required for state-changing requests", code: "BEARER_TOKEN_REQUIRED" });
  }
  next();
}

export function setSessionCookie(res: Response, token: string): void {
  // SameSite=None+Secure is REQUIRED for cross-site fetches (admin SPA on a different
  // origin calling this API with credentials:"include"). Lax breaks cross-site.
  // In dev (NODE_ENV !== production) we keep Lax to allow http://localhost.
  const isProd = process.env.NODE_ENV === "production";
  const attrs = isProd ? "; Secure; SameSite=None" : "; SameSite=Lax";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly${attrs}; Path=/; Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}`
  );
}

export function clearSessionCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === "production";
  const attrs = isProd ? "; Secure; SameSite=None" : "; SameSite=Lax";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly${attrs}; Path=/; Max-Age=0`);
}

export async function createSession(userId: number, role: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  await storage.createSession(token, userId, role, expiresAt);
  return token;
}

export async function getSession(token: string): Promise<SessionData | null> {
  const session = await storage.getSession(token);
  if (!session) return null;
  return { userId: session.userId, role: session.role };
}

export async function destroySession(token: string): Promise<void> {
  await storage.deleteSession(token);
}

// Clean up expired sessions, idempotency keys, and reset tokens every hour
setInterval(() => {
  storage.deleteExpiredSessions().catch(console.error);
  storage.deleteExpiredIdempotencyKeys().catch(console.error);
  storage.cleanExpiredResetTokens().catch(console.error);
}, 60 * 60 * 1000);

export function requireAuth(allowedRoles?: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Accept bearer tokens for native clients and HTTP-only cookies for browser sessions
    const token = getSessionTokenFromRequest(req);

    let userId: number | null = null;

    if (token) {
      const session = await getSession(token);
      if (!session) {
        return res.status(401).json({ error: "Session expired or invalid" });
      }
      userId = session.userId;
    }

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ error: "Invalid user" });
    }
    if (allowedRoles) {
      if (allowedRoles.length === 0) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      // Admin is no longer an unconditional bypass. Endpoints that allow admin
      // access must list "admin" explicitly in allowedRoles.
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
    }
    (req as any).currentUser = user;
    next();
  };
}
