/**
 * Bootstrap: ensure critical accounts exist on every server start.
 *
 * The production database is Postgres on Render. This script makes sure the
 * Apple reviewer demo account and the admin account always exist after a deploy.
 *
 * Read from env so credentials can be rotated without code changes.
 * Existing sandbox passwords stay valid: accounts with a password hash are never
 * force-reset here. New bootstrap accounts use BOOTSTRAP_*_PASSWORD when set;
 * otherwise a one-time random password is generated and logged for the operator.
 */
import { storage } from "./storage";
import { scryptSync, randomBytes } from "crypto";

// Must match the format used by routes.ts hashPassword(): "scrypt:<salt>:<hash>"
function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

interface BootstrapAccount {
  email: string;
  password?: string;
  name: string;
  phone: string;
  role: "customer" | "admin" | "manager" | "laundromat" | "driver";
  vendorId?: number;
}

function resolveBootstrapPassword(envName: string, role: string, email: string): string {
  const configured = process.env[envName];
  if (configured) return configured;
  const generated = randomBytes(18).toString("base64url").slice(0, 24);
  // P2-002: never log generated passwords
  console.warn(`[Bootstrap] ${envName} not set; generated one-time ${role} password — set ${envName} env var to use a persistent password`);
  return generated;
}

async function ensureAccount(account: BootstrapAccount, passwordEnvName: string) {
  try {
    const existing = await storage.getUserByEmail(account.email);
    if (existing) {
      // Do not force-reset passwords on deploy. Existing sandbox passwords stay valid;
      // only missing hashes are initialized from env/generated one-time credentials.
      const updates: any = {};
      if (!existing.password) {
        updates.password = hashPassword(account.password || resolveBootstrapPassword(passwordEnvName, account.role, account.email));
      }
      if (existing.role !== account.role) {
        updates.role = account.role;
      }
      if (Object.keys(updates).length > 0) {
        try {
          await storage.updateUser(existing.id, updates);
          const what = Object.keys(updates).join(", ");
          console.log(`[Bootstrap] Refreshed ${account.role} account (${what})`);
        } catch (e: any) {
          console.warn(`[Bootstrap] Could not refresh ${account.role} account:`, e?.message || e);
        }
      }
      return;
    }
    const password = account.password || resolveBootstrapPassword(passwordEnvName, account.role, account.email);
    const passwordHash = hashPassword(password);
    const username = account.email.split("@")[0] + "_bootstrap_" + Date.now();
    const payload: any = {
      username,
      name: account.name,
      email: account.email,
      phone: account.phone,
      password: passwordHash,
      role: account.role,
    };
    if (typeof account.vendorId === "number") payload.vendorId = account.vendorId;
    await storage.createUser(payload);
    console.log(`[Bootstrap] Created ${account.role} account`);
  } catch (err: any) {
    console.error(`[Bootstrap] Failed to ensure ${account.role} account:`, err?.message || err);
  }
}

function checkStripeMode() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) {
    console.warn("[Bootstrap] STRIPE_SECRET_KEY not set — payment features will be disabled.");
    return;
  }
  const isLive = key.startsWith("sk_live_");
  const isTest = key.startsWith("sk_test_");
  const env = process.env.NODE_ENV || "development";
  if (env === "production" && isTest) {
    console.warn(
      "[Bootstrap] ⚠️  STRIPE_SECRET_KEY is a TEST key (sk_test_*) but NODE_ENV=production. " +
        "Real money payments will NOT work. Set live keys in Render env to charge customers.",
    );
  } else if (env !== "production" && isLive) {
    console.warn(
      "[Bootstrap] ⚠️  STRIPE_SECRET_KEY is a LIVE key (sk_live_*) but NODE_ENV=" + env +
        ". Live keys should only be used in production.",
    );
  } else if (isLive) {
    console.log("[Bootstrap] Stripe is in LIVE mode — real payments enabled.");
  } else if (isTest) {
    console.log("[Bootstrap] Stripe is in TEST mode (sandbox).");
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn("[Bootstrap] STRIPE_WEBHOOK_SECRET not set — webhook signature verification will fail.");
  }
}

// ─────────────────────────────────────────────────────────
//  OPERATIONAL DATA: vendors, service types, add-ons, pricing
// ─────────────────────────────────────────────────────────

async function ensureServiceTypes() {
  try {
    const existing = await storage.getServiceTypes();
    if (existing.length > 0) {
      console.log(`[Bootstrap] Service types already seeded (${existing.length})`);
      return;
    }
    const seeds = [
      { name: "wash_fold",     displayName: "Wash & Fold",   description: "Standard laundry — washed, dried, folded.",       basePrice: 1.99, unit: "lb",   icon: "Shirt",       isActive: true, sortOrder: 1 },
      { name: "dry_cleaning",  displayName: "Dry Cleaning",  description: "Professional dry cleaning for delicate garments.", basePrice: 6.99, unit: "item", icon: "Sparkles",    isActive: true, sortOrder: 2 },
      { name: "comforters",    displayName: "Comforters & Bedding", description: "Large items — comforters, duvets, blankets.", basePrice: 24.99, unit: "item", icon: "BedDouble", isActive: true, sortOrder: 3 },
      { name: "alterations",   displayName: "Alterations",   description: "Hemming, repairs, and tailoring.",                  basePrice: 12.99, unit: "item", icon: "Scissors", isActive: true, sortOrder: 4 },
      { name: "commercial",    displayName: "Commercial",    description: "Bulk laundry for restaurants, gyms, and offices.", basePrice: 1.49, unit: "lb", icon: "Building2", isActive: true, sortOrder: 5 },
    ];
    for (const st of seeds) {
      await storage.createServiceType(st as any);
    }
    console.log(`[Bootstrap] Created ${seeds.length} service types`);
  } catch (err: any) {
    console.error("[Bootstrap] ensureServiceTypes failed:", err?.message || err);
  }
}

async function ensureAddOns() {
  try {
    const existing = await storage.getAddOns();
    if (existing && existing.length > 0) {
      // One-time cleanup: deactivate legacy same_day add-on to prevent double-charging
      // alongside DELIVERY_FEES.same_day ($12.99). Idempotent.
      const legacy = existing.find((a: any) => a.name === "same_day" && a.isActive === true);
      if (legacy) {
        try {
          await storage.updateAddOn(legacy.id, { isActive: false } as any);
          console.log(`[Bootstrap] Deactivated legacy same_day add-on (id=${legacy.id})`);
        } catch (e: any) {
          console.warn(`[Bootstrap] could not deactivate legacy same_day add-on:`, e?.message || e);
        }
      }
      console.log(`[Bootstrap] Add-ons already seeded (${existing.length})`);
      return;
    }
    const seeds = [
      // D10: priceMode set per business rules
      // per_order: detergents + folded + hangered — charged once regardless of item count
      // per_item:  stain_treatment — charged per garment treated
      { name: "hypoallergenic_detergent", displayName: "Hypoallergenic Detergent", price: 2.50, description: "Free of dyes and fragrances — safe for sensitive skin.", category: "detergent", isActive: true, priceMode: "per_order" },
      { name: "eco_detergent",            displayName: "Eco-Friendly Detergent",   price: 2.00, description: "Plant-based, biodegradable formula.",               category: "detergent", isActive: true, priceMode: "per_order" },
      { name: "fragrance_free_detergent", displayName: "Fragrance-Free Detergent", price: 2.00, description: "No added fragrances.",                              category: "detergent", isActive: true, priceMode: "per_order" },
      { name: "stain_treatment",          displayName: "Stain Pre-Treatment",       price: 4.99, description: "Professional pre-treatment for tough stains.",     category: "treatment", isActive: true, priceMode: "per_item" },
      { name: "folded_separately",        displayName: "Folded Separately",         price: 3.00, description: "Items folded by family member.",                   category: "service",   isActive: true, priceMode: "per_order" },
      { name: "hangered_delivery",        displayName: "Hangered Delivery",          price: 5.99, description: "Delivered on hangers instead of folded.",          category: "service",   isActive: true, priceMode: "per_order" },
      // Legacy same_day add-on REMOVED 2026-05-12: would double-charge alongside DELIVERY_FEES.same_day ($12.99).
      // Same-day is now a delivery-speed concept only, priced via pricing_config / DELIVERY_FEES.
      // { name: "same_day", ... } // DO NOT RESTORE without removing the delivery-fee path.
    ];
    for (const ad of seeds) {
      await storage.createAddOn(ad as any);
    }
    console.log(`[Bootstrap] Created ${seeds.length} add-ons`);
  } catch (err: any) {
    console.error("[Bootstrap] ensureAddOns failed:", err?.message || err);
  }
}

async function ensurePricingTiers() {
  try {
    const existing = await storage.getPricingTiers();
    if (existing && existing.length > 0) {
      console.log(`[Bootstrap] Pricing tiers already seeded (${existing.length})`);
      return;
    }
    const seeds = [
      { name: "small_bag",  displayName: "Small Bag",     maxWeight: 10,  flatPrice: 24.99, overageRate: 2.50, description: "Perfect for 1-2 people, single load.",            icon: "ShoppingBag", isActive: true, sortOrder: 1 },
      { name: "medium_bag", displayName: "Medium Bag",    maxWeight: 20,  flatPrice: 44.99, overageRate: 2.50, description: "Family load — up to 20 lbs.",                     icon: "ShoppingBag", isActive: true, sortOrder: 2 },
      { name: "large_bag",  displayName: "Large Bag",     maxWeight: 30,  flatPrice: 59.99, overageRate: 2.50, description: "Large load — perfect for sheets, towels, and a big week's wash.",  icon: "ShoppingBag", isActive: true, sortOrder: 3 },
      { name: "xl_bag",     displayName: "Extra Large",   maxWeight: 50,  flatPrice: 89.99, overageRate: 2.50, description: "Comforters, sheets, and more — up to 50 lbs.",     icon: "ShoppingBag", isActive: true, sortOrder: 4 },
    ];
    for (const pt of seeds) {
      await storage.createPricingTier(pt as any);
    }
    console.log(`[Bootstrap] Created ${seeds.length} pricing tiers`);
  } catch (err: any) {
    console.error("[Bootstrap] ensurePricingTiers failed:", err?.message || err);
  }
}

async function ensureDemoVendor() {
  try {
    const existing = await storage.getActiveVendors();
    if (existing && existing.length > 0) {
      console.log(`[Bootstrap] Vendors already seeded (${existing.length})`);
      return;
    }
    // Demo vendor — Manhattan, NY (so reviewer flow works without geofence issues)
    const v = await storage.createVendor({
      name: "Offload Demo Laundromat",
      address: "100 W 33rd St",
      city: "New York",
      phone: "5550100100",
      email: "vendor@offloadusa.com",
      rating: 4.8,
      reviewCount: 127,
      certified: true,
      capacity: 200,
      currentLoad: 30,
      status: "active",
      capabilities: JSON.stringify(["wash_fold", "dry_cleaning", "comforters"]),
      performanceTier: "premium",
      lat: 40.7484,
      lng: -73.9857,
      payoutRate: 0.65,
      onTimeRate: 0.98,
      qualityScore: 4.8,
      offersDryCleaning: 1,
      offersComforters: 1,
      operatingHours: JSON.stringify({
        mon: { open: "7:00", close: "22:00" },
        tue: { open: "7:00", close: "22:00" },
        wed: { open: "7:00", close: "22:00" },
        thu: { open: "7:00", close: "22:00" },
        fri: { open: "7:00", close: "22:00" },
        sat: { open: "8:00", close: "21:00" },
        sun: { open: "9:00", close: "20:00" },
      }),
    } as any);
    console.log(`[Bootstrap] Created demo vendor (id: ${v?.id})`);
  } catch (err: any) {
    console.error("[Bootstrap] ensureDemoVendor failed:", err?.message || err);
  }
}

async function ensurePricingConfig() {
  try {
    // Idempotent: only set keys that don't already exist
    const existing = await storage.getAllPricingConfig();
    const haveKeys = new Set(existing.map((c: any) => c.key));
    const seeds: Array<{ key: string; value: string; category: string; description?: string }> = [
      // Delivery fees per speed tier (matches DELIVERY_FEES constant)
      { key: "delivery_fee_48h",         value: "0.00",  category: "delivery_fees",     description: "Standard 48h delivery fee" },
      { key: "delivery_fee_24h",         value: "5.99",  category: "delivery_fees",     description: "Next Day 24h delivery fee" },
      { key: "delivery_fee_same_day",    value: "12.99", category: "delivery_fees",     description: "Same Day delivery fee" },
      { key: "delivery_fee_minimum",     value: "19.99", category: "delivery_fees",     description: "Minimum order for free delivery" },
      // Tax
      { key: "tax_rate_default",         value: "0.08875", category: "tax",             description: "Default sales tax rate (NYC 8.875%)" },
      // Logistics
      { key: "max_radius_miles",         value: "10",    category: "logistics",          description: "Max pickup radius from vendor" },
      { key: "vendor_payout_default",    value: "0.65",  category: "logistics",          description: "Default vendor payout rate (fraction of subtotal)" },
      { key: "driver_payout_per_trip",   value: "8.50",  category: "logistics",          description: "Default driver payout per trip ($8.50 x 2 trips = $17/order)" },
      { key: "platform_fee_default",     value: "0.18",  category: "logistics",          description: "Default Offload platform fee rate" },
      // Commissions (new category)
      { key: "platform_fee_rate",        value: "0.18",  category: "commissions",        description: "Platform fee rate applied to subtotal" },
      { key: "vendor_share_rate",        value: "0.65",  category: "commissions",        description: "Vendor payout share of subtotal" },
      { key: "driver_payout_per_trip_default", value: "8.50", category: "commissions",   description: "Driver payout per trip (pickup or delivery)" },
      // Bag tier prices (matches PRICING_TIERS constant)
      { key: "bag_small_bag",            value: JSON.stringify({ flatPrice: 24.99, overageRate: 2.50, maxWeight: 10 }), category: "service_tiers", description: "Small Bag pricing" },
      { key: "bag_medium_bag",           value: JSON.stringify({ flatPrice: 44.99, overageRate: 2.50, maxWeight: 20 }), category: "service_tiers", description: "Medium Bag pricing" },
      { key: "bag_large_bag",            value: JSON.stringify({ flatPrice: 59.99, overageRate: 2.50, maxWeight: 30 }), category: "service_tiers", description: "Large Bag pricing" },
      { key: "bag_xl_bag",              value: JSON.stringify({ flatPrice: 89.99, overageRate: 2.50, maxWeight: 50 }), category: "service_tiers", description: "XL Bag pricing" },
      // Service type multipliers
      { key: "multiplier_wash_fold",     value: "1.0",   category: "service_multipliers", description: "Wash & Fold multiplier" },
      { key: "multiplier_dry_cleaning",  value: "1.65",  category: "service_multipliers", description: "Dry Cleaning multiplier" },
      { key: "multiplier_comforters",    value: "1.40",  category: "service_multipliers", description: "Comforters multiplier" },
      { key: "multiplier_mixed",         value: "1.25",  category: "service_multipliers", description: "Mixed service multiplier" },
      { key: "multiplier_alterations",   value: "1.50",  category: "service_multipliers", description: "Alterations multiplier" },
      { key: "multiplier_commercial",    value: "0.85",  category: "service_multipliers", description: "Commercial bulk discount multiplier" },
      // Loyalty config
      { key: "loyalty_points_per_dollar", value: "10",   category: "loyalty",            description: "Base loyalty points earned per dollar spent" },
      { key: "loyalty_points_per_dollar_redeemed", value: "100", category: "loyalty",     description: "Points required per $1 redemption" },
      { key: "loyalty_tiers",            value: JSON.stringify({
        bronze:   { minPoints: 0,    multiplier: 1.0, perks: ["5% off first order"] },
        silver:   { minPoints: 500,  multiplier: 1.25, perks: ["Free delivery", "10% off"] },
        gold:     { minPoints: 2000, multiplier: 1.5, perks: ["Free delivery", "15% off", "Priority matching"] },
        platinum: { minPoints: 5000, multiplier: 2.0, perks: ["Free delivery", "20% off", "Priority matching", "Dedicated support"] },
      }), category: "loyalty", description: "Loyalty tier definitions" },
    ];
    let created = 0;
    for (const s of seeds) {
      if (haveKeys.has(s.key)) continue;
      try {
        await storage.upsertPricingConfig(s.key, s.value, s.category, s.description);
        created++;
      } catch (e: any) {
        // ignore duplicate-key races
      }
    }
    if (created > 0) console.log(`[Bootstrap] Created ${created} pricing config entries`);
    else console.log(`[Bootstrap] Pricing config already populated (${existing.length})`);
  } catch (err: any) {
    console.error("[Bootstrap] ensurePricingConfig failed:", err?.message || err);
  }
}

export async function bootstrapAccounts() {
  console.log("[Bootstrap] Ensuring critical accounts exist...");
  checkStripeMode();
  await ensureAccount({
    email: process.env.BOOTSTRAP_REVIEWER_EMAIL || "reviewer@offloadusa.com",
    password: process.env.BOOTSTRAP_REVIEWER_PASSWORD,
    name: "Apple Reviewer",
    phone: "5551234567",
    role: "customer",
  }, "BOOTSTRAP_REVIEWER_PASSWORD");
  await ensureAccount({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@offloadusa.com",
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    name: "Offload Admin",
    phone: "5550000000",
    role: "admin",
  }, "BOOTSTRAP_ADMIN_PASSWORD");
  // Operational baseline
  await ensureServiceTypes();
  await ensureAddOns();
  await ensurePricingTiers();
  await ensureDemoVendor();
  // Demo vendor (laundromat) login + driver login — must run AFTER ensureDemoVendor so vendorId=1 exists
  await ensureAccount({
    email: process.env.BOOTSTRAP_VENDOR_EMAIL || "vendor@offloadusa.com",
    password: process.env.BOOTSTRAP_VENDOR_PASSWORD,
    name: "Offload Demo Laundromat",
    phone: "5550000001",
    role: "laundromat",
    vendorId: 1,
  }, "BOOTSTRAP_VENDOR_PASSWORD");
  await ensureAccount({
    email: process.env.BOOTSTRAP_DRIVER_EMAIL || "driver@offloadusa.com",
    password: process.env.BOOTSTRAP_DRIVER_PASSWORD,
    name: "Offload Demo Driver",
    phone: "5550000002",
    role: "driver",
  }, "BOOTSTRAP_DRIVER_PASSWORD");
  await ensurePricingConfig();
  console.log("[Bootstrap] Done");
}
