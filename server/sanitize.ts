import type { Request, Response, NextFunction } from "express";
import sanitizeHtml from "sanitize-html";

const PASSWORD_FIELDS = new Set(["password", "currentPassword", "newPassword"]);

function sanitizeValue(key: string, value: any): any {
  if (PASSWORD_FIELDS.has(key)) {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => sanitizeValue(String(i), v));
  }
  if (value && typeof value === "object") {
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      sanitized[k] = sanitizeValue(k, v);
    }
    return sanitized;
  }
  return value;
}

export function sanitizeMiddleware(req: Request, _res: Response, next: NextFunction) {
  // Skip Stripe webhook — it needs the raw body intact
  if (req.path === "/api/webhooks/stripe" || req.path.includes("/webhooks/")) {
    return next();
  }

  if (req.body && typeof req.body === "object") {
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(req.body)) {
      sanitized[k] = sanitizeValue(k, v);
    }
    req.body = sanitized;
  }

  next();
}
