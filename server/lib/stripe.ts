import Stripe from "stripe";

// ════════════════════════════════════════════════════════════════
//  STRIPE CLIENT (lazy singleton)
// ════════════════════════════════════════════════════════════════

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" as any });
  return _stripe;
}

export function hasStripe(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// ════════════════════════════════════════════════════════════════
//  MONEY CONVERSIONS
// ════════════════════════════════════════════════════════════════

export function dollarsToCents(amount: number | null | undefined): number {
  return Math.round(Number(amount || 0) * 100);
}

export function centsToDollars(amountCents: number): number {
  return Math.round(amountCents) / 100;
}

// ════════════════════════════════════════════════════════════════
//  IDEMPOTENCY KEY CACHE (DB-backed)
// ════════════════════════════════════════════════════════════════

import { storage } from "../storage";

export async function getIdempotentResponse(key: string): Promise<{ response: any; statusCode: number } | null> {
  const cached = await storage.getIdempotencyKey(key);
  if (!cached) return null;
  return { response: JSON.parse(cached.response), statusCode: cached.statusCode };
}

export async function setIdempotentResponse(key: string, response: any, statusCode: number): Promise<void> {
  const expiresAt = new Date(Date.now() + 86400000).toISOString(); // 24h
  await storage.storeIdempotencyKey(key, JSON.stringify(response), statusCode, expiresAt);
}
