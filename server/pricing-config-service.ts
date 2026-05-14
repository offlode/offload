/**
 * PricingConfigService — DB-backed pricing configuration with in-memory cache.
 *
 * Reads from the `pricing_config` table via storage methods. Falls back to the
 * canonical constants from `@shared/schema` when a DB row is missing or on error.
 * Cache TTL: 60 seconds (configurable via TTL_MS).
 */
import { storage } from "./storage";
import {
  PRICING_TIERS,
  DELIVERY_FEES,
  TAX_RATE,
  SERVICE_TYPE_MULTIPLIERS,
  LOYALTY_TIERS,
} from "@shared/schema";
// ─── Cache entry ───
interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
}

class PricingConfigService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly TTL_MS = 60_000;

  // ─── Generic accessors ───

  async getString(key: string, fallback: string): Promise<string> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as string;
    try {
      const row = await storage.getPricingConfig(key);
      if (row) {
        this.cache.set(key, { value: row.value, expiresAt: Date.now() + this.TTL_MS });
        return row.value;
      }
    } catch (err: any) {
      console.warn(`[PricingConfig] DB error for key "${key}":`, err?.message);
    }
    console.warn(`[PricingConfig] fallback for key "${key}"`);
    this.cache.set(key, { value: fallback, expiresAt: Date.now() + this.TTL_MS });
    return fallback;
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const str = await this.getString(key, String(fallback));
    const num = Number(str);
    return Number.isFinite(num) ? num : fallback;
  }

  async getJSON<T>(key: string, fallback: T): Promise<T> {
    const str = await this.getString(key, JSON.stringify(fallback));
    try {
      return JSON.parse(str) as T;
    } catch {
      return fallback;
    }
  }

  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  // ─── Typed accessors ───

  async getTaxRate(_state?: string): Promise<number> {
    return this.getNumber("tax_rate_default", TAX_RATE);
  }

  async getDeliveryFee(speed: "48h" | "24h" | "same_day"): Promise<number> {
    const key = `delivery_fee_${speed}`;
    const fallback = DELIVERY_FEES[speed]?.fee ?? 0;
    return this.getNumber(key, fallback);
  }

  async getBagPrice(tierKey: string): Promise<{ flatPrice: number; overageRate: number; maxWeight: number }> {
    const fallback = PRICING_TIERS[tierKey as keyof typeof PRICING_TIERS];
    if (!fallback) {
      return { flatPrice: 24.99, overageRate: 2.50, maxWeight: 10 };
    }
    return this.getJSON(`bag_${tierKey}`, {
      flatPrice: fallback.flatPrice,
      overageRate: fallback.overageRate,
      maxWeight: fallback.maxWeight,
    });
  }

  async getPlatformFeeRate(): Promise<number> {
    return this.getNumber("platform_fee_default", 0.18);
  }

  async getDefaultVendorPayoutRate(): Promise<number> {
    return this.getNumber("vendor_payout_default", 0.65);
  }

  async getDefaultDriverPayoutPerTrip(): Promise<number> {
    return this.getNumber("driver_payout_per_trip", 8.50);
  }

  async getServiceMultiplier(serviceType: string): Promise<number> {
    const key = `multiplier_${serviceType}`;
    const fallback = SERVICE_TYPE_MULTIPLIERS[serviceType] ?? 1.0;
    return this.getNumber(key, fallback);
  }

  async getLoyaltyConfig(): Promise<{
    pointsPerDollarEarned: number;
    pointsPerDollarRedeemed: number;
    tiers: typeof LOYALTY_TIERS;
  }> {
    const [ptsEarned, ptsRedeemed, tiers] = await Promise.all([
      this.getNumber("loyalty_points_per_dollar", 10),
      this.getNumber("loyalty_points_per_dollar_redeemed", 100),
      this.getJSON("loyalty_tiers", LOYALTY_TIERS as any),
    ]);
    return {
      pointsPerDollarEarned: ptsEarned,
      pointsPerDollarRedeemed: ptsRedeemed,
      tiers,
    };
  }

  async getDynamicLogistics<T>(fallback: T): Promise<T> {
    return this.getJSON("dynamic_logistics", fallback);
  }

  // B3: Signature Wash per-bag premium (in cents, default 500 = $5.00)
  async getSignaturePremiumCents(bagSize: "small_bag" | "medium_bag" | "large_bag" | "xl_bag"): Promise<number> {
    return this.getNumber(`signature_premium_cents_${bagSize}`, 500);
  }

  // OD-8: Wait-fee configuration sourced from DB so the owner can tune the
  // grace period, per-minute rate, and cap without a code deploy. Falls back
  // to the canonical constants if any row is missing.
  async getWaitFeeConfig(): Promise<{ freeMinutes: number; perMinute: number; cap: number }> {
    const [freeMinutes, perMinute, cap] = await Promise.all([
      this.getNumber("wait_fee_free_minutes", 5),
      this.getNumber("wait_fee_per_minute", 1.0),
      this.getNumber("wait_fee_cap", 15.0),
    ]);
    return { freeMinutes, perMinute, cap };
  }
}

export const pricingConfig = new PricingConfigService();
