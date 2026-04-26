/**
 * Bootstrap: ensure critical accounts exist on every server start.
 *
 * The production database is Postgres on Render. This script makes sure the
 * Apple reviewer demo account and the admin account always exist after a deploy.
 *
 * Read from env so credentials can be rotated without code changes:
 *   BOOTSTRAP_REVIEWER_EMAIL    (default: reviewer@offloadusa.com)
 *   BOOTSTRAP_REVIEWER_PASSWORD (default: OffloadReview2026!)
 *   BOOTSTRAP_ADMIN_EMAIL       (default: admin@offloadusa.com)
 *   BOOTSTRAP_ADMIN_PASSWORD    (default: OffloadAdmin2026!)
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
  password: string;
  name: string;
  phone: string;
  role: "customer" | "admin" | "manager";
}

async function ensureAccount(account: BootstrapAccount) {
  try {
    const existing = await storage.getUserByEmail(account.email);
    if (existing) {
      // Always re-hash the bootstrap password and force role correctness so
      // these admin/reviewer accounts are guaranteed usable after every deploy.
      const updates: any = {};
      const newHash = hashPassword(account.password);
      if (existing.password !== newHash) {
        // (hashes always differ due to random salt — always reset)
        updates.password = newHash;
      }
      if (existing.role !== account.role) {
        updates.role = account.role;
      }
      if (Object.keys(updates).length > 0) {
        try {
          await storage.updateUser(existing.id, updates);
          const what = Object.keys(updates).join(", ");
          console.log(`[Bootstrap] Refreshed ${account.email} (${what})`);
        } catch (e: any) {
          console.warn(`[Bootstrap] Could not refresh ${account.email}:`, e?.message || e);
        }
      }
      return;
    }
    const passwordHash = hashPassword(account.password);
    const username = account.email.split("@")[0] + "_bootstrap_" + Date.now();
    await storage.createUser({
      username,
      name: account.name,
      email: account.email,
      phone: account.phone,
      password: passwordHash,
      role: account.role,
    } as any);
    console.log(`[Bootstrap] Created ${account.role} account: ${account.email}`);
  } catch (err: any) {
    console.error(`[Bootstrap] Failed to ensure ${account.email}:`, err?.message || err);
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
      { name: "wash_fold",     displayName: "Wash & Fold",   description: "Standard laundry — washed, dried, folded.",       basePrice: 1.99, unit: "lb",   icon: "Shirt",       isActive: 1, sortOrder: 1 },
      { name: "dry_cleaning",  displayName: "Dry Cleaning",  description: "Professional dry cleaning for delicate garments.", basePrice: 6.99, unit: "item", icon: "Sparkles",    isActive: 1, sortOrder: 2 },
      { name: "comforters",    displayName: "Comforters & Bedding", description: "Large items — comforters, duvets, blankets.", basePrice: 24.99, unit: "item", icon: "BedDouble", isActive: 1, sortOrder: 3 },
      { name: "alterations",   displayName: "Alterations",   description: "Hemming, repairs, and tailoring.",                  basePrice: 12.99, unit: "item", icon: "Scissors", isActive: 1, sortOrder: 4 },
      { name: "commercial",    displayName: "Commercial",    description: "Bulk laundry for restaurants, gyms, and offices.", basePrice: 1.49, unit: "lb", icon: "Building2", isActive: 1, sortOrder: 5 },
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
      console.log(`[Bootstrap] Add-ons already seeded (${existing.length})`);
      return;
    }
    const seeds = [
      { name: "hypoallergenic_detergent", displayName: "Hypoallergenic Detergent", price: 2.50, description: "Free of dyes and fragrances — safe for sensitive skin.", category: "detergent", isActive: 1 },
      { name: "eco_detergent",            displayName: "Eco-Friendly Detergent",   price: 2.00, description: "Plant-based, biodegradable formula.",               category: "detergent", isActive: 1 },
      { name: "fragrance_free_detergent", displayName: "Fragrance-Free Detergent", price: 2.00, description: "No added fragrances.",                              category: "detergent", isActive: 1 },
      { name: "stain_treatment",          displayName: "Stain Pre-Treatment",       price: 4.99, description: "Professional pre-treatment for tough stains.",     category: "treatment", isActive: 1 },
      { name: "folded_separately",        displayName: "Folded Separately",         price: 3.00, description: "Items folded by family member.",                   category: "service",   isActive: 1 },
      { name: "hangered_delivery",        displayName: "Hangered Delivery",          price: 5.99, description: "Delivered on hangers instead of folded.",          category: "service",   isActive: 1 },
      { name: "rush_2hr",                 displayName: "Rush 2-Hour Service",        price: 14.99, description: "Wash and return within 2 hours (where available).", category: "service",   isActive: 1 },
      { name: "same_day",                 displayName: "Same-Day Service",            price: 9.99,  description: "Pickup and delivery the same day.",                category: "service",   isActive: 1 },
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
      { name: "small_bag",  displayName: "Small Bag",     maxWeight: 10,  flatPrice: 19.99, overageRate: 1.99, description: "Perfect for 1-2 people, single load.",            icon: "ShoppingBag", isActive: 1, sortOrder: 1 },
      { name: "medium_bag", displayName: "Medium Bag",    maxWeight: 20,  flatPrice: 34.99, overageRate: 1.79, description: "Family load — up to 20 lbs.",                     icon: "ShoppingBag", isActive: 1, sortOrder: 2 },
      { name: "large_bag",  displayName: "Large Bag",     maxWeight: 35,  flatPrice: 54.99, overageRate: 1.59, description: "Big haul — up to 35 lbs.",                        icon: "ShoppingBag", isActive: 1, sortOrder: 3 },
      { name: "xl_bag",     displayName: "Extra Large",   maxWeight: 60,  flatPrice: 89.99, overageRate: 1.39, description: "Comforters, sheets, and more — up to 60 lbs.",     icon: "ShoppingBag", isActive: 1, sortOrder: 4 },
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
      certified: 1,
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
      { key: "delivery_fee_standard",    value: "5.99",  category: "delivery_fees",     description: "Standard delivery fee" },
      { key: "delivery_fee_rush",        value: "12.99", category: "delivery_fees",     description: "Rush delivery fee" },
      { key: "delivery_fee_minimum",     value: "19.99", category: "delivery_fees",     description: "Minimum order for free delivery" },
      { key: "speed_surcharge_2hr",      value: "14.99", category: "speed_surcharges",  description: "2-hour rush surcharge" },
      { key: "speed_surcharge_same_day", value: "9.99",  category: "speed_surcharges",  description: "Same-day service surcharge" },
      { key: "speed_surcharge_next_day", value: "4.99",  category: "speed_surcharges",  description: "Next-day service surcharge" },
      { key: "tax_rate_default",         value: "0.0875",category: "tax",                description: "Default sales tax rate (NYC)" },
      { key: "max_radius_miles",         value: "10",    category: "logistics",          description: "Max pickup radius from vendor" },
      { key: "vendor_payout_default",    value: "0.65",  category: "logistics",          description: "Default vendor payout share" },
      { key: "driver_payout_default",    value: "0.20",  category: "logistics",          description: "Default driver payout share" },
      { key: "platform_fee_default",     value: "0.15",  category: "logistics",          description: "Default Offload platform fee" },
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
    password: process.env.BOOTSTRAP_REVIEWER_PASSWORD || "OffloadReview2026!",
    name: "Apple Reviewer",
    phone: "5551234567",
    role: "customer",
  });
  await ensureAccount({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@offloadusa.com",
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || "OffloadAdmin2026!",
    name: "Offload Admin",
    phone: "5550000000",
    role: "admin",
  });
  // Operational baseline
  await ensureServiceTypes();
  await ensureAddOns();
  await ensurePricingTiers();
  await ensureDemoVendor();
  await ensurePricingConfig();
  console.log("[Bootstrap] Done");
}
