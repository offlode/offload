import { LRUCache } from "lru-cache";

// ════════════════════════════════════════════════════════════════
//  INPUT SANITIZATION
// ════════════════════════════════════════════════════════════════

export function sanitizeInput(input: string, maxLength = 5000): string {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, "") // Strip script tags
    .replace(/on\w+="[^"]*"/gi, "")               // Strip event handlers
    .trim()
    .substring(0, maxLength);
}

// ════════════════════════════════════════════════════════════════
//  ROUTE RATE LIMITING
// ════════════════════════════════════════════════════════════════

const rateLimitBuckets = new LRUCache<string, { count: number; resetAt: number }>({
  max: 10_000,
  ttl: 60 * 60 * 1000,
});

export const RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  "POST:/api/auth/register": { maxRequests: 5, windowMs: 60000 },
  "POST:/api/orders": { maxRequests: 20, windowMs: 60000 },
  "POST:/api/messages": { maxRequests: 30, windowMs: 60000 },
  "POST:/api/pricing/calculate": { maxRequests: 60, windowMs: 60000 },
  "POST:/api/disputes": { maxRequests: 5, windowMs: 60000 },
  "POST:/api/auth/forgot-password": { maxRequests: 3, windowMs: 900000 },
  "POST:/api/auth/reset-password": { maxRequests: 5, windowMs: 900000 },
};

export function checkRateLimit(method: string, path: string, ip: string): boolean {
  const routeKey = `${method}:${path}`;
  const limit = RATE_LIMITS[routeKey];
  if (!limit) return true; // No limit for this route

  const bucketKey = `${routeKey}:${ip}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(bucketKey);

  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }

  if (bucket.count >= limit.maxRequests) return false;
  rateLimitBuckets.set(bucketKey, { ...bucket, count: bucket.count + 1 });
  return true;
}
