import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import type { IStorage } from "./interface";
import { createUserMethods } from "./users";
import { createOrderMethods } from "./orders";
import { createEntityMethods } from "./entities";

export type { IStorage } from "./interface";
export { addOrderCents, addQuoteCents } from "./helpers";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("oregon-postgres.render.com")
    ? { rejectUnauthorized: false }
    : undefined,
});

const db = drizzle(pool, { schema });

// Ensure any extra integration tables exist (idempotent on Postgres)
async function ensureExtraTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stripe_processed_events (
      event_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      processed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_rules (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      trigger TEXT NOT NULL,
      audience TEXT NOT NULL,
      channels TEXT NOT NULL,
      title_template TEXT NOT NULL,
      body_template TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS partner_applications (
      id SERIAL PRIMARY KEY,
      applicant_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_review',
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      address_line TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      service_zips TEXT,
      vehicle_type TEXT,
      license_plate TEXT,
      drivers_license_number TEXT,
      drivers_license_state TEXT,
      drivers_license_expiry TEXT,
      insurance_carrier TEXT,
      insurance_policy_number TEXT,
      insurance_expiry TEXT,
      has_clean_driving_record INTEGER,
      years_driving INTEGER,
      availability_json TEXT,
      hours_per_week INTEGER,
      owns_smartphone INTEGER,
      consent_background_check INTEGER,
      business_name TEXT,
      business_legal_entity TEXT,
      ein TEXT,
      years_in_business INTEGER,
      number_of_washers INTEGER,
      number_of_dryers INTEGER,
      largest_machine_lbs INTEGER,
      daily_capacity_lbs INTEGER,
      operating_hours_json TEXT,
      services_offered_json TEXT,
      accepts_commercial INTEGER,
      accepts_rush_same_day INTEGER,
      has_dry_cleaning_on_site INTEGER,
      accepts_hypoallergenic INTEGER,
      has_insurance INTEGER,
      insurance_carrier_biz TEXT,
      agrees_to_quality_standards INTEGER NOT NULL DEFAULT 0,
      agrees_to_pricing INTEGER NOT NULL DEFAULT 0,
      agrees_to_terms_of_service INTEGER NOT NULL DEFAULT 0,
      agrees_to_background_check INTEGER NOT NULL DEFAULT 0,
      why_join TEXT,
      "references" TEXT,
      auto_screen_score INTEGER,
      auto_screen_flags TEXT,
      auto_screen_recommendation TEXT,
      reviewed_by_user_id INTEGER,
      reviewed_at TEXT,
      decline_reason TEXT,
      result_user_id INTEGER,
      result_driver_id INTEGER,
      result_vendor_id INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_partner_apps_status ON partner_applications(status);
    CREATE INDEX IF NOT EXISTS idx_partner_apps_type ON partner_applications(applicant_type);

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id SERIAL PRIMARY KEY,
      actor_id INTEGER NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      old_value TEXT,
      new_value TEXT,
      ip TEXT,
      user_agent TEXT,
      notes TEXT,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity ON admin_audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON admin_audit_log(actor_id);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_log_ts ON admin_audit_log(timestamp);

    CREATE TABLE IF NOT EXISTS stripe_reconciliation_log (
      id SERIAL PRIMARY KEY,
      stripe_event_id TEXT,
      stripe_resource_id TEXT,
      action TEXT NOT NULL,
      db_state TEXT NOT NULL,
      error_message TEXT,
      recorded_at TEXT NOT NULL,
      resolved_at TEXT,
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_stripe_recon_action ON stripe_reconciliation_log(action);
    CREATE INDEX IF NOT EXISTS idx_stripe_recon_resolved ON stripe_reconciliation_log(resolved_at);

    CREATE TABLE IF NOT EXISTS service_area_requests (
      id SERIAL PRIMARY KEY,
      name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      requested_service TEXT,
      requested_speed TEXT,
      requested_options TEXT,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sar_status ON service_area_requests(status);
    CREATE INDEX IF NOT EXISTS idx_sar_zip ON service_area_requests(zip);
    CREATE INDEX IF NOT EXISTS idx_sar_created ON service_area_requests(created_at);
  `);

  // Add amount_cents column if missing (idempotent)
  try {
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN amount_cents INTEGER;`);
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (!msg.includes("already exists") && !msg.includes("duplicate column")) throw err;
  }

  // ── Dynamic pricing columns (Uber-style) ──
  // Each is wrapped in IF NOT EXISTS so reruns are safe.
  const dynamicPricingCols: Array<[string, string]> = [
    ["orders", "pickup_floor INTEGER"],
    ["orders", "pickup_has_elevator INTEGER DEFAULT 1"],
    ["orders", "pickup_handoff TEXT DEFAULT 'curbside'"],
    ["orders", "delivery_floor INTEGER"],
    ["orders", "delivery_has_elevator INTEGER DEFAULT 1"],
    ["orders", "delivery_handoff TEXT DEFAULT 'curbside'"],
    ["orders", "pickup_window_minutes INTEGER DEFAULT 30"],
    ["orders", "pickup_distance_miles DOUBLE PRECISION"],
    ["orders", "pickup_distance_fee DOUBLE PRECISION DEFAULT 0"],
    ["orders", "floor_fee DOUBLE PRECISION DEFAULT 0"],
    ["orders", "handoff_fee DOUBLE PRECISION DEFAULT 0"],
    ["orders", "traffic_multiplier DOUBLE PRECISION DEFAULT 1.0"],
    ["orders", "window_discount DOUBLE PRECISION DEFAULT 0"],
    // Pickup waiting fee columns (5-min grace, then $1/min capped $15)
    ["orders", "driver_arrived_at TEXT"],
    ["orders", "customer_handoff_at TEXT"],
    ["orders", "pickup_wait_minutes DOUBLE PRECISION DEFAULT 0"],
    ["orders", "pickup_wait_fee DOUBLE PRECISION DEFAULT 0"],
    // Wave 2: payout idempotency flag
    ["orders", "payout_recorded INTEGER DEFAULT 0"],
    ["quotes", "pickup_floor INTEGER"],
    ["quotes", "pickup_has_elevator INTEGER DEFAULT 1"],
    ["quotes", "pickup_handoff TEXT DEFAULT 'curbside'"],
    ["quotes", "pickup_window_minutes INTEGER DEFAULT 30"],
    ["quotes", "pickup_distance_miles DOUBLE PRECISION"],
    ["quotes", "pickup_distance_fee DOUBLE PRECISION DEFAULT 0"],
    ["quotes", "floor_fee DOUBLE PRECISION DEFAULT 0"],
    ["quotes", "handoff_fee DOUBLE PRECISION DEFAULT 0"],
    ["quotes", "traffic_multiplier DOUBLE PRECISION DEFAULT 1.0"],
    ["quotes", "window_discount DOUBLE PRECISION DEFAULT 0"],
    ["quotes", "vendor_choice_mode TEXT DEFAULT 'auto'"],
    ["quotes", "public_token TEXT"],
    // Vendor service-area + capability + intake controls (master pass)
    ["vendors", "service_zips TEXT"],
    ["vendors", "service_radius_miles DOUBLE PRECISION"],
    ["vendors", "service_area_type TEXT DEFAULT 'zip'"],
    ["vendors", "owns_drivers INTEGER DEFAULT 0"],
    ["vendors", "pause_order_intake INTEGER DEFAULT 0"],
    ["vendors", "acceptance_timeout_sec INTEGER DEFAULT 120"],
    ["vendors", "offers_stain_treatment INTEGER DEFAULT 0"],
    ["vendors", "offers_steam_press INTEGER DEFAULT 0"],
    ["vendors", "offers_hang_dry INTEGER DEFAULT 0"],
    // wave5b: vendor-owned driver linking columns (added to schema but missing from DB migration)
    ["drivers", "vendor_id INTEGER"],
    ["drivers", "driver_ownership TEXT DEFAULT 'platform'"],
    // D7+D8: operating hours JSON + business details
    ["vendors", "operating_hours_json TEXT"],
    ["vendors", "business_name TEXT"],
    ["vendors", "contact_email TEXT"],
    ["vendors", "business_address TEXT"],
    ["vendors", "business_city TEXT"],
    ["vendors", "business_state TEXT"],
    ["vendors", "business_zip TEXT"],
    ["vendors", "business_lat REAL"],
    ["vendors", "business_lng REAL"],
    ["vendors", "admin_override_open INTEGER DEFAULT 0"],
    // Vendor AI scoring + operations columns (added to schema but missing from prod DB migration)
    ["vendors", "ai_health_score DOUBLE PRECISION DEFAULT 85"],
    // offload-admin uses a parallel Drizzle schema that references "health_score" (no ai_ prefix). Keep both for cross-app compat.
    ["vendors", "health_score DOUBLE PRECISION DEFAULT 85"],
    ["vendors", "total_orders INTEGER DEFAULT 0"],
    ["vendors", "total_payout DOUBLE PRECISION DEFAULT 0"],
    ["vendors", "joined_at TEXT"],
    ["vendors", "avg_processing_time DOUBLE PRECISION DEFAULT 180"],
    ["vendors", "on_time_rate DOUBLE PRECISION DEFAULT 0.95"],
    ["vendors", "quality_score DOUBLE PRECISION DEFAULT 4.5"],
    ["vendors", "dispute_rate DOUBLE PRECISION DEFAULT 0.02"],
    ["vendors", "avg_daily_orders DOUBLE PRECISION DEFAULT 10"],
    ["vendors", "peak_day_of_week TEXT DEFAULT 'Monday'"],
    ["vendors", "performance_tier TEXT DEFAULT 'standard'"],
    ["vendors", "operating_hours TEXT"],
    ["vendors", "offers_dry_cleaning INTEGER DEFAULT 0"],
    ["vendors", "offers_alterations INTEGER DEFAULT 0"],
    ["vendors", "offers_comforters INTEGER DEFAULT 0"],
    ["vendors", "offers_commercial INTEGER DEFAULT 0"],
    ["vendors", "payout_rate DOUBLE PRECISION DEFAULT 0.65"],
    ["vendors", "total_earnings DOUBLE PRECISION DEFAULT 0"],
    ["vendors", "pending_payout DOUBLE PRECISION DEFAULT 0"],
    ["vendors", "payout_rate_cents INTEGER"],
    ["vendors", "total_earnings_cents INTEGER"],
    ["vendors", "pending_payout_cents INTEGER"],
    ["vendors", "avatar_url TEXT"],
    ["vendors", "capabilities TEXT"],
    ["vendors", "lat DOUBLE PRECISION"],
    ["vendors", "lng DOUBLE PRECISION"],
    ["vendors", "phone TEXT"],
    ["vendors", "email TEXT"],
  ];
  for (const [table, colDef] of dynamicPricingCols) {
    const colName = colDef.split(/\s+/)[0];
    try {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${colDef};`);
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (!msg.includes("already exists") && !msg.includes("duplicate column")) {
        console.warn(`[storage] could not add ${table}.${colName}:`, msg);
      }
    }
  }
}

ensureExtraTables().catch((err) => {
  console.error("[storage] ensureExtraTables error:", err);
});

// ── Wave 5: FK constraints, indexes, and shadow cents columns ──
async function ensureIntegrityConstraints() {
  // wave5b-part8-fix1: drop fk_messages_sender if it was added in an earlier
  // wave — it is wrong (sender_id=0 is the documented sentinel for AI/system
  // messages and was never meant to reference users.id). This is idempotent.
  try {
    await pool.query("ALTER TABLE messages DROP CONSTRAINT IF EXISTS fk_messages_sender");
  } catch (e: any) {
    console.warn("[integrity] drop fk_messages_sender:", e.message);
  }

  // FK indexes (all idempotent)
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_orders_vendor_id ON orders(vendor_id)",
    "CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders(driver_id)",
    "CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)",
    "CREATE INDEX IF NOT EXISTS idx_disputes_order_id ON disputes(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON payment_transactions(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_order_add_ons_order_id ON order_add_ons(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user_id ON loyalty_transactions(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id)",
    "CREATE INDEX IF NOT EXISTS idx_referrals_referee_id ON referrals(referee_id)",
    "CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_consent_records_order_id ON consent_records(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_promo_usage_promo_id ON promo_usage(promo_id)",
    "CREATE INDEX IF NOT EXISTS idx_promo_usage_user_id ON promo_usage(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_vendor_payouts_vendor_id ON vendor_payouts(vendor_id)",
  ];
  for (const ddl of indexes) {
    try { await pool.query(ddl); } catch (e: any) {
      console.warn("[integrity] index:", e.message);
    }
  }

  // FK constraints (each wrapped individually — skip if already exists)
  const fks: Array<[string, string]> = [
    ["orders", "ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT"],
    ["orders", "ADD CONSTRAINT fk_orders_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL"],
    ["orders", "ADD CONSTRAINT fk_orders_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL"],
    ["addresses", "ADD CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"],
    ["payment_methods", "ADD CONSTRAINT fk_payment_methods_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"],
    ["order_events", "ADD CONSTRAINT fk_order_events_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE"],
    // NOTE: messages.sender_id intentionally has NO FK to users(id) — sender_id=0 is a sentinel for AI/system messages.
    // sender_role discriminates real-user vs AI/system. See wave5b-part8-fix1 for context.
    ["disputes", "ADD CONSTRAINT fk_disputes_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT"],
    ["disputes", "ADD CONSTRAINT fk_disputes_customer FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT"],
    ["reviews", "ADD CONSTRAINT fk_reviews_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE"],
    ["notifications", "ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"],
    ["vendor_payouts", "ADD CONSTRAINT fk_vendor_payouts_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT"],
    ["payment_transactions", "ADD CONSTRAINT fk_payment_txns_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT"],
    ["loyalty_transactions", "ADD CONSTRAINT fk_loyalty_txns_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"],
    ["order_add_ons", "ADD CONSTRAINT fk_order_add_ons_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE"],
    ["order_add_ons", "ADD CONSTRAINT fk_order_add_ons_addon FOREIGN KEY (add_on_id) REFERENCES add_ons(id) ON DELETE RESTRICT"],
    ["chat_sessions", "ADD CONSTRAINT fk_chat_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"],
    ["promo_usage", "ADD CONSTRAINT fk_promo_usage_promo FOREIGN KEY (promo_id) REFERENCES promo_codes(id) ON DELETE CASCADE"],
    ["promo_usage", "ADD CONSTRAINT fk_promo_usage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"],
  ];
  for (const [table, clause] of fks) {
    try {
      await pool.query(`ALTER TABLE ${table} ${clause}`);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (!msg.includes("already exists") && !msg.includes("duplicate key")) {
        console.warn(`[integrity] FK ${table}: ${msg}`);
      }
    }
  }

  // Shadow _cents columns for dual-write migration (Phase 1)
  const centsCols: Array<[string, string]> = [
    ["orders", "subtotal_cents INTEGER"],
    ["orders", "tax_cents INTEGER"],
    ["orders", "delivery_fee_cents INTEGER"],
    ["orders", "discount_cents INTEGER"],
    ["orders", "total_cents INTEGER"],
    ["orders", "final_price_cents INTEGER"],
    ["orders", "vendor_payout_cents INTEGER"],
    ["orders", "driver_payout_cents INTEGER"],
    ["orders", "tier_flat_price_cents INTEGER"],
    ["quotes", "subtotal_cents INTEGER"],
    ["quotes", "tax_amount_cents INTEGER"],
    ["quotes", "delivery_fee_cents INTEGER"],
    ["quotes", "discount_cents INTEGER"],
    ["quotes", "total_cents INTEGER"],
    ["quotes", "tier_flat_price_cents INTEGER"],
    ["vendor_payouts", "amount_cents INTEGER"],
    // Part 6: remaining money fields
    ["vendors", "payout_rate_cents INTEGER"],
    ["vendors", "total_earnings_cents INTEGER"],
    ["vendors", "pending_payout_cents INTEGER"],
    ["drivers", "payout_per_trip_cents INTEGER"],
    ["drivers", "total_earnings_cents INTEGER"],
    ["drivers", "pending_payout_cents INTEGER"],
    ["users", "total_spent_cents INTEGER"],
    ["service_types", "base_price_cents INTEGER"],
    ["consent_records", "additional_charge_cents INTEGER"],
    ["disputes", "credit_amount_cents INTEGER"],
    ["disputes", "refund_amount_cents INTEGER"],
    ["promo_codes", "value_cents INTEGER"],
    ["promo_codes", "min_order_amount_cents INTEGER"],
    ["referrals", "referrer_reward_cents INTEGER"],
    ["referrals", "referee_reward_cents INTEGER"],
    ["pricing_tiers", "flat_price_cents INTEGER"],
    ["pricing_tiers", "overage_rate_cents INTEGER"],
    ["add_ons", "price_cents INTEGER"],
    ["order_add_ons", "unit_price_cents INTEGER"],
    ["order_add_ons", "total_cents INTEGER"],
    ["payment_transactions", "platform_fee_cents INTEGER"],
  ];
  for (const [table, colDef] of centsCols) {
    // D10: idempotent add of price_mode column to add_ons (below this loop, see migration below)
    try {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${colDef}`);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (!msg.includes("already exists") && !msg.includes("duplicate column")) {
        console.warn(`[integrity] shadow column ${table}.${colDef.split(" ")[0]}: ${msg}`);
      }
    }
  }

  // Backfill shadow columns from existing dollar values
  const backfills = [
    "UPDATE orders SET subtotal_cents = ROUND(subtotal * 100)::integer WHERE subtotal IS NOT NULL AND subtotal_cents IS NULL",
    "UPDATE orders SET tax_cents = ROUND(tax * 100)::integer WHERE tax IS NOT NULL AND tax_cents IS NULL",
    "UPDATE orders SET delivery_fee_cents = ROUND(delivery_fee * 100)::integer WHERE delivery_fee IS NOT NULL AND delivery_fee_cents IS NULL",
    "UPDATE orders SET discount_cents = ROUND(discount * 100)::integer WHERE discount IS NOT NULL AND discount_cents IS NULL",
    "UPDATE orders SET total_cents = ROUND(total * 100)::integer WHERE total IS NOT NULL AND total_cents IS NULL",
    "UPDATE orders SET final_price_cents = ROUND(final_price * 100)::integer WHERE final_price IS NOT NULL AND final_price_cents IS NULL",
    "UPDATE orders SET vendor_payout_cents = ROUND(vendor_payout * 100)::integer WHERE vendor_payout IS NOT NULL AND vendor_payout_cents IS NULL",
    "UPDATE orders SET driver_payout_cents = ROUND(driver_payout * 100)::integer WHERE driver_payout IS NOT NULL AND driver_payout_cents IS NULL",
    "UPDATE orders SET tier_flat_price_cents = ROUND(tier_flat_price * 100)::integer WHERE tier_flat_price IS NOT NULL AND tier_flat_price_cents IS NULL",
    "UPDATE quotes SET subtotal_cents = ROUND(subtotal * 100)::integer WHERE subtotal IS NOT NULL AND subtotal_cents IS NULL",
    "UPDATE quotes SET tax_amount_cents = ROUND(tax_amount * 100)::integer WHERE tax_amount IS NOT NULL AND tax_amount_cents IS NULL",
    "UPDATE quotes SET delivery_fee_cents = ROUND(delivery_fee * 100)::integer WHERE delivery_fee IS NOT NULL AND delivery_fee_cents IS NULL",
    "UPDATE quotes SET discount_cents = ROUND(discount * 100)::integer WHERE discount IS NOT NULL AND discount_cents IS NULL",
    "UPDATE quotes SET total_cents = ROUND(total * 100)::integer WHERE total IS NOT NULL AND total_cents IS NULL",
    "UPDATE quotes SET tier_flat_price_cents = ROUND(tier_flat_price * 100)::integer WHERE tier_flat_price IS NOT NULL AND tier_flat_price_cents IS NULL",
    "UPDATE vendor_payouts SET amount_cents = ROUND(amount * 100)::integer WHERE amount IS NOT NULL AND amount_cents IS NULL",
    // Part 6: remaining money fields
    "UPDATE vendors SET payout_rate_cents = ROUND(payout_rate * 100)::integer WHERE payout_rate IS NOT NULL AND payout_rate_cents IS NULL",
    "UPDATE vendors SET total_earnings_cents = ROUND(total_earnings * 100)::integer WHERE total_earnings IS NOT NULL AND total_earnings_cents IS NULL",
    "UPDATE vendors SET pending_payout_cents = ROUND(pending_payout * 100)::integer WHERE pending_payout IS NOT NULL AND pending_payout_cents IS NULL",
    "UPDATE drivers SET payout_per_trip_cents = ROUND(payout_per_trip * 100)::integer WHERE payout_per_trip IS NOT NULL AND payout_per_trip_cents IS NULL",
    "UPDATE drivers SET total_earnings_cents = ROUND(total_earnings * 100)::integer WHERE total_earnings IS NOT NULL AND total_earnings_cents IS NULL",
    "UPDATE drivers SET pending_payout_cents = ROUND(pending_payout * 100)::integer WHERE pending_payout IS NOT NULL AND pending_payout_cents IS NULL",
    "UPDATE users SET total_spent_cents = ROUND(total_spent * 100)::integer WHERE total_spent IS NOT NULL AND total_spent_cents IS NULL",
    "UPDATE service_types SET base_price_cents = ROUND(base_price * 100)::integer WHERE base_price IS NOT NULL AND base_price_cents IS NULL",
    "UPDATE consent_records SET additional_charge_cents = ROUND(additional_charge * 100)::integer WHERE additional_charge IS NOT NULL AND additional_charge_cents IS NULL",
    "UPDATE disputes SET credit_amount_cents = ROUND(credit_amount * 100)::integer WHERE credit_amount IS NOT NULL AND credit_amount_cents IS NULL",
    "UPDATE disputes SET refund_amount_cents = ROUND(refund_amount * 100)::integer WHERE refund_amount IS NOT NULL AND refund_amount_cents IS NULL",
    "UPDATE promo_codes SET value_cents = ROUND(value * 100)::integer WHERE value IS NOT NULL AND value_cents IS NULL",
    "UPDATE promo_codes SET min_order_amount_cents = ROUND(min_order_amount * 100)::integer WHERE min_order_amount IS NOT NULL AND min_order_amount_cents IS NULL",
    "UPDATE referrals SET referrer_reward_cents = ROUND(referrer_reward * 100)::integer WHERE referrer_reward IS NOT NULL AND referrer_reward_cents IS NULL",
    "UPDATE referrals SET referee_reward_cents = ROUND(referee_reward * 100)::integer WHERE referee_reward IS NOT NULL AND referee_reward_cents IS NULL",
    "UPDATE pricing_tiers SET flat_price_cents = ROUND(flat_price * 100)::integer WHERE flat_price IS NOT NULL AND flat_price_cents IS NULL",
    "UPDATE pricing_tiers SET overage_rate_cents = ROUND(overage_rate * 100)::integer WHERE overage_rate IS NOT NULL AND overage_rate_cents IS NULL",
    "UPDATE add_ons SET price_cents = ROUND(price * 100)::integer WHERE price IS NOT NULL AND price_cents IS NULL",
    "UPDATE order_add_ons SET unit_price_cents = ROUND(unit_price * 100)::integer WHERE unit_price IS NOT NULL AND unit_price_cents IS NULL",
    "UPDATE order_add_ons SET total_cents = ROUND(total * 100)::integer WHERE total IS NOT NULL AND total_cents IS NULL",
    "UPDATE payment_transactions SET platform_fee_cents = ROUND(platform_fee * 100)::integer WHERE platform_fee IS NOT NULL AND platform_fee_cents IS NULL",
  ];
  for (const sql of backfills) {
    try { await pool.query(sql); } catch (e: any) {
      console.warn("[integrity] backfill:", e.message);
    }
  }

  // D10: idempotent ALTER TABLE for add_ons.price_mode column
  try {
    await pool.query(`ALTER TABLE add_ons ADD COLUMN IF NOT EXISTS price_mode TEXT DEFAULT 'per_order'`);
    // Backfill: set reasonable defaults for existing add-ons by name
    await pool.query(`
      UPDATE add_ons SET price_mode = 'per_item'
      WHERE name = 'stain_treatment' AND price_mode IS NULL
    `);
    await pool.query(`
      UPDATE add_ons SET price_mode = COALESCE(price_mode, 'per_order')
      WHERE price_mode IS NULL
    `);
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (!msg.includes("already exists")) {
      console.warn("[integrity] D10 price_mode column:", msg);
    }
  }

  console.log("[integrity] FK constraints, indexes, and shadow cents columns applied.");
}

ensureIntegrityConstraints().catch((err) => {
  console.error("[storage] ensureIntegrityConstraints error:", err);
});

// ── Compose DatabaseStorage from domain modules ──
class DatabaseStorage implements IStorage {
  private _users = createUserMethods(db);
  private _orders = createOrderMethods(db);
  private _entities = createEntityMethods(db);

  // Users
  getUser = this._users.getUser;
  getUserByUsername = this._users.getUserByUsername;
  getUserByEmail = this._users.getUserByEmail;
  getUsersByRole = this._users.getUsersByRole;
  createUser = this._users.createUser;
  updateUser = this._users.updateUser;
  deleteUserAccount = this._users.deleteUserAccount;
  searchUsers = this._users.searchUsers;
  // Addresses
  getAddress = this._users.getAddress;
  getAddressesByUser = this._users.getAddressesByUser;
  createAddress = this._users.createAddress;
  updateAddress = this._users.updateAddress;
  deleteAddress = this._users.deleteAddress;
  // Payment Methods
  getPaymentMethodsByUser = this._users.getPaymentMethodsByUser;
  getPaymentMethod = this._users.getPaymentMethod;
  createPaymentMethod = this._users.createPaymentMethod;
  updatePaymentMethod = this._users.updatePaymentMethod;
  deletePaymentMethod = this._users.deletePaymentMethod;
  // Customer Stats
  getCustomerStats = this._users.getCustomerStats;
  // Sessions
  createSession = this._users.createSession;
  getSession = this._users.getSession;
  deleteSession = this._users.deleteSession;
  deleteSessionsByUser = this._users.deleteSessionsByUser;
  deleteExpiredSessions = this._users.deleteExpiredSessions;
  // Idempotency Keys
  storeIdempotencyKey = this._users.storeIdempotencyKey;
  getIdempotencyKey = this._users.getIdempotencyKey;
  deleteExpiredIdempotencyKeys = this._users.deleteExpiredIdempotencyKeys;
  // Password Reset Tokens
  createPasswordResetToken = this._users.createPasswordResetToken;
  getPasswordResetToken = this._users.getPasswordResetToken;
  markPasswordResetTokenUsed = this._users.markPasswordResetTokenUsed;
  cleanExpiredResetTokens = this._users.cleanExpiredResetTokens;

  // Orders
  getOrders = this._orders.getOrders;
  getOrder = this._orders.getOrder;
  getActiveOrders = this._orders.getActiveOrders;
  getOrdersByCustomer = this._orders.getOrdersByCustomer;
  getOrdersByVendor = this._orders.getOrdersByVendor;
  getOrdersByDriver = this._orders.getOrdersByDriver;
  getOrdersByStatus = this._orders.getOrdersByStatus;
  createOrder = this._orders.createOrder;
  updateOrder = this._orders.updateOrder;
  transitionOrderStatus = this._orders.transitionOrderStatus;
  // Order Events
  getOrderEvents = this._orders.getOrderEvents;
  createOrderEvent = this._orders.createOrderEvent;
  // Consents
  getConsentsByOrder = this._orders.getConsentsByOrder;
  getConsent = this._orders.getConsent;
  getPendingConsents = this._orders.getPendingConsents;
  createConsent = this._orders.createConsent;
  updateConsent = this._orders.updateConsent;
  // Disputes
  getDisputes = this._orders.getDisputes;
  getDispute = this._orders.getDispute;
  createDispute = this._orders.createDispute;
  updateDispute = this._orders.updateDispute;
  // Reviews
  getReviews = this._orders.getReviews;
  getReviewByOrder = this._orders.getReviewByOrder;
  getReviewsByVendor = this._orders.getReviewsByVendor;
  getReviewsByDriver = this._orders.getReviewsByDriver;
  createReview = this._orders.createReview;
  // Order Add-Ons
  getOrderAddOns = this._orders.getOrderAddOns;
  createOrderAddOn = this._orders.createOrderAddOn;
  // Payment Transactions
  getPaymentTransactions = this._orders.getPaymentTransactions;
  getPaymentTransactionsByOrder = this._orders.getPaymentTransactionsByOrder;
  createPaymentTransaction = this._orders.createPaymentTransaction;
  updatePaymentTransaction = this._orders.updatePaymentTransaction;
  // Stripe Accounts
  getStripeAccount = this._orders.getStripeAccount;
  createStripeAccount = this._orders.createStripeAccount;
  updateStripeAccount = this._orders.updateStripeAccount;
  // Order Status History
  getOrderStatusHistory = this._orders.getOrderStatusHistory;
  createOrderStatusHistory = this._orders.createOrderStatusHistory;
  // Order Photos
  createOrderPhoto = this._orders.createOrderPhoto;
  getOrderPhotos = this._orders.getOrderPhotos;
  getOrderPhotosByType = this._orders.getOrderPhotosByType;
  getPhotosByOrder = this._orders.getPhotosByOrder;
  // Quotes
  getQuote = this._orders.getQuote;
  getQuoteByNumber = this._orders.getQuoteByNumber;
  getQuoteByPublicToken = this._orders.getQuoteByPublicToken;
  getQuoteByIdempotencyKey = this._orders.getQuoteByIdempotencyKey;
  getQuotesByCustomer = this._orders.getQuotesByCustomer;
  getQuotesBySession = this._orders.getQuotesBySession;
  createQuote = this._orders.createQuote;
  updateQuote = this._orders.updateQuote;
  expireStaleQuotes = this._orders.expireStaleQuotes;
  // Stripe Webhook Events
  recordStripeEvent = this._orders.recordStripeEvent;
  deleteStripeEvent = this._orders.deleteStripeEvent;
  // Promo Usage
  recordPromoUsage = this._orders.recordPromoUsage;
  getPromoUsageByUser = this._orders.getPromoUsageByUser;
  deletePromoUsageByOrder = this._orders.deletePromoUsageByOrder;

  // Vendors
  getVendors = this._entities.getVendors;
  getVendor = this._entities.getVendor;
  getVendorByUserId = this._entities.getVendorByUserId;
  getActiveVendors = this._entities.getActiveVendors;
  createVendor = this._entities.createVendor;
  updateVendor = this._entities.updateVendor;
  getVendorStats = this._entities.getVendorStats;
  // Drivers
  getDrivers = this._entities.getDrivers;
  getDriver = this._entities.getDriver;
  getDriverByUserId = this._entities.getDriverByUserId;
  getAvailableDrivers = this._entities.getAvailableDrivers;
  createDriver = this._entities.createDriver;
  updateDriver = this._entities.updateDriver;
  getDriverStats = this._entities.getDriverStats;
  // Service Types
  getServiceTypes = this._entities.getServiceTypes;
  createServiceType = this._entities.createServiceType;
  // Messages
  getMessagesByOrder = this._entities.getMessagesByOrder;
  getMessagesByConversation = this._entities.getMessagesByConversation;
  createMessage = this._entities.createMessage;
  getMessagesBySender = this._entities.getMessagesBySender;
  getConversationsForUser = this._entities.getConversationsForUser;
  getMessage = this._entities.getMessage;
  markMessageRead = this._entities.markMessageRead;
  // Partner Applications
  getPartnerApplications = this._entities.getPartnerApplications;
  getPartnerApplication = this._entities.getPartnerApplication;
  createPartnerApplication = this._entities.createPartnerApplication;
  updatePartnerApplication = this._entities.updatePartnerApplication;
  // Notifications
  getNotificationsByUser = this._entities.getNotificationsByUser;
  getUnreadCount = this._entities.getUnreadCount;
  getNotification = this._entities.getNotification;
  createNotification = this._entities.createNotification;
  savePushToken = this._entities.savePushToken;
  deletePushToken = this._entities.deletePushToken;
  getPushTokensByUser = this._entities.getPushTokensByUser;
  markNotificationRead = this._entities.markNotificationRead;
  markAllRead = this._entities.markAllRead;
  deleteNotification = this._entities.deleteNotification;
  getNotificationsByCategory = this._entities.getNotificationsByCategory;
  // Promo Codes
  getPromoCode = this._entities.getPromoCode;
  getPromoCodes = this._entities.getPromoCodes;
  createPromoCode = this._entities.createPromoCode;
  updatePromoCode = this._entities.updatePromoCode;
  // Referrals
  getReferralsByUser = this._entities.getReferralsByUser;
  createReferral = this._entities.createReferral;
  updateReferral = this._entities.updateReferral;
  // Loyalty
  getLoyaltyTransactions = this._entities.getLoyaltyTransactions;
  createLoyaltyTransaction = this._entities.createLoyaltyTransaction;
  // Chat Sessions
  getChatSessions = this._entities.getChatSessions;
  getChatSession = this._entities.getChatSession;
  getAllSupportSessions = this._entities.getAllSupportSessions;
  createChatSession = this._entities.createChatSession;
  updateChatSession = this._entities.updateChatSession;
  // Vendor Payouts
  getVendorPayout = this._entities.getVendorPayout;
  getVendorPayouts = this._entities.getVendorPayouts;
  createVendorPayout = this._entities.createVendorPayout;
  updateVendorPayout = this._entities.updateVendorPayout;
  // Pricing Tiers
  getPricingTiers = this._entities.getPricingTiers;
  getPricingTier = this._entities.getPricingTier;
  getPricingTierByName = this._entities.getPricingTierByName;
  createPricingTier = this._entities.createPricingTier;
  // Add-Ons
  getAddOns = this._entities.getAddOns;
  getAllAddOns = this._entities.getAllAddOns;
  getAddOn = this._entities.getAddOn;
  createAddOn = this._entities.createAddOn;
  updateAddOn = this._entities.updateAddOn;
  deleteAddOn = this._entities.deleteAddOn;
  // Driver Location History
  createDriverLocationHistory = this._entities.createDriverLocationHistory;
  getDriverLocationHistory = this._entities.getDriverLocationHistory;
  // Pricing Config
  getPricingConfig = this._entities.getPricingConfig;
  getAllPricingConfig = this._entities.getAllPricingConfig;
  getPricingConfigByCategory = this._entities.getPricingConfigByCategory;
  upsertPricingConfig = this._entities.upsertPricingConfig;
  // Pricing Audit
  createPricingAuditEntry = this._entities.createPricingAuditEntry;
  getPricingAuditLog = this._entities.getPricingAuditLog;
  // Admin Audit Log
  createAdminAuditLog = this._entities.createAdminAuditLog;
  getAdminAuditLog = this._entities.getAdminAuditLog;
  countAdminAuditLog = this._entities.countAdminAuditLog;
  // Notification Rules
  getNotificationRules = this._entities.getNotificationRules;
  getNotificationRule = this._entities.getNotificationRule;
  getNotificationRulesByTrigger = this._entities.getNotificationRulesByTrigger;
  createNotificationRule = this._entities.createNotificationRule;
  updateNotificationRule = this._entities.updateNotificationRule;
  deleteNotificationRule = this._entities.deleteNotificationRule;
  // Service Area Requests
  createServiceAreaRequest = this._entities.createServiceAreaRequest;
  getServiceAreaRequests = this._entities.getServiceAreaRequests;
  getServiceAreaRequest = this._entities.getServiceAreaRequest;
  updateServiceAreaRequest = this._entities.updateServiceAreaRequest;
  getServiceAreaDemandByZip = this._entities.getServiceAreaDemandByZip;
}

export const storage = new DatabaseStorage();
export { db, pool };

export async function logStripeReconciliation(data: {
  stripeEventId?: string;
  stripeResourceId?: string;
  action: string;
  dbState: string;
  errorMessage?: string;
  notes?: string;
}) {
  try {
    await pool.query(
      `INSERT INTO stripe_reconciliation_log (stripe_event_id, stripe_resource_id, action, db_state, error_message, recorded_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [data.stripeEventId || null, data.stripeResourceId || null, data.action, data.dbState, data.errorMessage || null, new Date().toISOString(), data.notes || null]
    );
  } catch (err) {
    console.error("[stripe-reconciliation] Failed to log:", err, data);
  }
}
