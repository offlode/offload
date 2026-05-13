import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc, and, or, sql, like } from "drizzle-orm";
import * as schema from "@shared/schema";

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

  console.log("[integrity] FK constraints, indexes, and shadow cents columns applied.");
}

ensureIntegrityConstraints().catch((err) => {
  console.error("[storage] ensureIntegrityConstraints error:", err);
});

export interface IStorage {
  // Users
  getUser(id: number): Promise<schema.User | undefined>;
  getUserByUsername(username: string): Promise<schema.User | undefined>;
  getUserByEmail(email: string): Promise<schema.User | undefined>;
  getUsersByRole(role: string): Promise<schema.User[]>;
  createUser(data: schema.InsertUser): Promise<schema.User>;
  updateUser(id: number, data: Partial<schema.InsertUser>): Promise<schema.User | undefined>;
  deleteUserAccount(id: number): Promise<void>;
  searchUsers(query: string): Promise<schema.User[]>;
  // Addresses
  getAddress(id: number): Promise<schema.Address | undefined>;
  getAddressesByUser(userId: number): Promise<schema.Address[]>;
  createAddress(data: schema.InsertAddress): Promise<schema.Address>;
  updateAddress(id: number, data: Partial<schema.InsertAddress>): Promise<schema.Address | undefined>;
  deleteAddress(id: number): Promise<void>;
  // Vendors
  getVendors(): Promise<schema.Vendor[]>;
  getVendor(id: number): Promise<schema.Vendor | undefined>;
  getVendorByUserId(userId: number): Promise<schema.Vendor | undefined>;
  getActiveVendors(): Promise<schema.Vendor[]>;
  createVendor(data: schema.InsertVendor): Promise<schema.Vendor>;
  updateVendor(id: number, data: Partial<schema.InsertVendor>): Promise<schema.Vendor | undefined>;
  getVendorStats(id: number): Promise<any>;
  // Drivers
  getDrivers(): Promise<schema.Driver[]>;
  getDriver(id: number): Promise<schema.Driver | undefined>;
  getDriverByUserId(userId: number): Promise<schema.Driver | undefined>;
  getAvailableDrivers(): Promise<schema.Driver[]>;
  createDriver(data: schema.InsertDriver): Promise<schema.Driver>;
  updateDriver(id: number, data: Partial<schema.InsertDriver>): Promise<schema.Driver | undefined>;
  getDriverStats(id: number): Promise<any>;
  // Service Types
  getServiceTypes(): Promise<schema.ServiceType[]>;
  createServiceType(data: schema.InsertServiceType): Promise<schema.ServiceType>;
  // Orders
  getOrders(): Promise<schema.Order[]>;
  getOrder(id: number): Promise<schema.Order | undefined>;
  getActiveOrders(): Promise<schema.Order[]>;
  getOrdersByCustomer(customerId: number): Promise<schema.Order[]>;
  getOrdersByVendor(vendorId: number): Promise<schema.Order[]>;
  getOrdersByDriver(driverId: number): Promise<schema.Order[]>;
  getOrdersByStatus(status: string): Promise<schema.Order[]>;
  createOrder(data: schema.InsertOrder): Promise<schema.Order>;
  updateOrder(id: number, data: Partial<schema.InsertOrder>): Promise<schema.Order | undefined>;
  // Order Events
  getOrderEvents(orderId: number): Promise<schema.OrderEvent[]>;
  createOrderEvent(data: schema.InsertOrderEvent): Promise<schema.OrderEvent>;
  // Payment Methods
  getPaymentMethodsByUser(userId: number): Promise<schema.PaymentMethod[]>;
  createPaymentMethod(data: schema.InsertPaymentMethod): Promise<schema.PaymentMethod>;
  updatePaymentMethod(id: number, data: Partial<schema.InsertPaymentMethod>): Promise<schema.PaymentMethod | undefined>;
  deletePaymentMethod(id: number): Promise<void>;
  // Consents
  getConsentsByOrder(orderId: number): Promise<schema.ConsentRecord[]>;
  getConsent(id: number): Promise<schema.ConsentRecord | undefined>;
  getPendingConsents(): Promise<schema.ConsentRecord[]>;
  createConsent(data: schema.InsertConsent): Promise<schema.ConsentRecord>;
  updateConsent(id: number, data: Partial<schema.InsertConsent>): Promise<schema.ConsentRecord | undefined>;
  // Messages
  getMessagesByOrder(orderId: number): Promise<schema.Message[]>;
  getMessagesByConversation(conversationId: string): Promise<schema.Message[]>;
  createMessage(data: schema.InsertMessage): Promise<schema.Message>;
  // Disputes
  getDisputes(): Promise<schema.Dispute[]>;
  getDispute(id: number): Promise<schema.Dispute | undefined>;
  createDispute(data: schema.InsertDispute): Promise<schema.Dispute>;
  updateDispute(id: number, data: Partial<schema.InsertDispute>): Promise<schema.Dispute | undefined>;
  // Reviews
  getReviews(): Promise<schema.Review[]>;
  getReviewByOrder(orderId: number): Promise<schema.Review | undefined>;
  getReviewsByVendor(vendorId: number): Promise<schema.Review[]>;
  getReviewsByDriver(driverId: number): Promise<schema.Review[]>;
  createReview(data: schema.InsertReview): Promise<schema.Review>;

  // ─── Partner Applications ───
  getPartnerApplications(filter?: { applicantType?: string; status?: string }): Promise<schema.PartnerApplication[]>;
  getPartnerApplication(id: number): Promise<schema.PartnerApplication | undefined>;
  createPartnerApplication(data: schema.InsertPartnerApplication & { status?: string; autoScreenScore?: number; autoScreenFlags?: string; autoScreenRecommendation?: string; createdAt: string }): Promise<schema.PartnerApplication>;
  updatePartnerApplication(id: number, patch: Partial<schema.PartnerApplication>): Promise<schema.PartnerApplication | undefined>;
  // Notifications
  getNotificationsByUser(userId: number): Promise<schema.Notification[]>;
  getUnreadCount(userId: number): Promise<number>;
  getNotification(id: number): Promise<schema.Notification | undefined>;
  createNotification(data: schema.InsertNotification): Promise<schema.Notification>;
  savePushToken(userId: number, token: string, platform: string): Promise<schema.PushToken>;
  deletePushToken(userId: number, token: string): Promise<void>;
  getPushTokensByUser(userId: number): Promise<schema.PushToken[]>;
  markNotificationRead(id: number): Promise<schema.Notification | undefined>;
  markAllRead(userId: number): Promise<void>;
  // Promo Codes
  getPromoCode(code: string): Promise<schema.PromoCode | undefined>;
  getPromoCodes(): Promise<schema.PromoCode[]>;
  createPromoCode(data: schema.InsertPromoCode): Promise<schema.PromoCode>;
  updatePromoCode(id: number, data: Partial<schema.InsertPromoCode>): Promise<schema.PromoCode | undefined>;
  // Referrals
  getReferralsByUser(userId: number): Promise<schema.Referral[]>;
  createReferral(data: schema.InsertReferral): Promise<schema.Referral>;
  updateReferral(id: number, data: Partial<schema.InsertReferral>): Promise<schema.Referral | undefined>;
  // Loyalty
  getLoyaltyTransactions(userId: number): Promise<schema.LoyaltyTransaction[]>;
  createLoyaltyTransaction(data: schema.InsertLoyaltyTransaction): Promise<schema.LoyaltyTransaction>;
  // Chat Sessions
  getChatSessions(userId: number): Promise<schema.ChatSession[]>;
  getChatSession(id: number): Promise<schema.ChatSession | undefined>;
  getAllSupportSessions(): Promise<schema.ChatSession[]>;
  createChatSession(data: schema.InsertChatSession): Promise<schema.ChatSession>;
  updateChatSession(id: number, data: Partial<schema.InsertChatSession>): Promise<schema.ChatSession | undefined>;
  // Vendor Payouts
  getVendorPayout(id: number): Promise<schema.VendorPayout | undefined>;
  getVendorPayouts(vendorId: number): Promise<schema.VendorPayout[]>;
  createVendorPayout(data: schema.InsertVendorPayout): Promise<schema.VendorPayout>;
  updateVendorPayout(id: number, data: Partial<schema.InsertVendorPayout>): Promise<schema.VendorPayout | undefined>;
  // Pricing Tiers
  getPricingTiers(): Promise<schema.PricingTier[]>;
  getPricingTier(id: number): Promise<schema.PricingTier | undefined>;
  getPricingTierByName(name: string): Promise<schema.PricingTier | undefined>;
  createPricingTier(data: schema.InsertPricingTier): Promise<schema.PricingTier>;
  // Add-Ons
  getAddOns(): Promise<schema.AddOn[]>;
  getAllAddOns(): Promise<schema.AddOn[]>;
  getAddOn(id: number): Promise<schema.AddOn | undefined>;
  createAddOn(data: schema.InsertAddOn): Promise<schema.AddOn>;
  updateAddOn(id: number, data: Partial<schema.InsertAddOn>): Promise<schema.AddOn | undefined>;
  deleteAddOn(id: number): Promise<boolean>;
  // Order Add-Ons
  getOrderAddOns(orderId: number): Promise<schema.OrderAddOn[]>;
  createOrderAddOn(data: schema.InsertOrderAddOn): Promise<schema.OrderAddOn>;
  // Payment Transactions
  getPaymentTransactions(): Promise<schema.PaymentTransaction[]>;
  getPaymentTransactionsByOrder(orderId: number): Promise<schema.PaymentTransaction[]>;
  createPaymentTransaction(data: schema.InsertPaymentTransaction): Promise<schema.PaymentTransaction>;
  updatePaymentTransaction(id: number, data: Partial<schema.InsertPaymentTransaction>): Promise<schema.PaymentTransaction | undefined>;
  // Stripe Accounts
  getStripeAccount(userId: number): Promise<schema.StripeAccount | undefined>;
  createStripeAccount(data: schema.InsertStripeAccount): Promise<schema.StripeAccount>;
  updateStripeAccount(id: number, data: Partial<schema.InsertStripeAccount>): Promise<schema.StripeAccount | undefined>;
  // Order Status History
  getOrderStatusHistory(orderId: number): Promise<schema.OrderStatusHistory[]>;
  createOrderStatusHistory(data: schema.InsertOrderStatusHistory): Promise<schema.OrderStatusHistory>;
  // Message helpers
  getMessagesBySender(senderId: number): Promise<schema.Message[]>;
  getConversationsForUser(userId: number): Promise<schema.Message[]>;
  getMessage(id: number): Promise<schema.Message | undefined>;
  markMessageRead(id: number): Promise<schema.Message | undefined>;
  // Driver Location History
  createDriverLocationHistory(data: schema.InsertDriverLocationHistory): Promise<schema.DriverLocationHistory>;
  getDriverLocationHistory(driverId: number, limit?: number): Promise<schema.DriverLocationHistory[]>;
  // Order Photos
  createOrderPhoto(data: schema.InsertOrderPhoto): Promise<schema.OrderPhoto>;
  getOrderPhotos(orderId: number): Promise<schema.OrderPhoto[]>;
  getOrderPhotosByType(orderId: number, type: string): Promise<schema.OrderPhoto[]>;
  getPhotosByOrder(orderId: number): Promise<schema.OrderPhoto[]>;
  // Notification helpers
  deleteNotification(id: number): Promise<void>;
  getNotificationsByCategory(userId: number, category: string): Promise<schema.Notification[]>;
  // Quotes
  getQuote(id: number): Promise<schema.Quote | undefined>;
  getQuoteByNumber(quoteNumber: string): Promise<schema.Quote | undefined>;
  getQuoteByIdempotencyKey(key: string): Promise<schema.Quote | undefined>;
  getQuotesByCustomer(customerId: number): Promise<schema.Quote[]>;
  getQuotesBySession(sessionId: string): Promise<schema.Quote[]>;
  createQuote(data: schema.InsertQuote): Promise<schema.Quote>;
  updateQuote(id: number, data: Partial<schema.InsertQuote>): Promise<schema.Quote | undefined>;
  expireStaleQuotes(): Promise<number>;
  // Pricing Config
  getPricingConfig(key: string): Promise<schema.PricingConfig | undefined>;
  getAllPricingConfig(): Promise<schema.PricingConfig[]>;
  getPricingConfigByCategory(category: string): Promise<schema.PricingConfig[]>;
  upsertPricingConfig(key: string, value: string, category: string, description?: string, updatedBy?: number): Promise<schema.PricingConfig>;
  // Pricing Audit
  createPricingAuditEntry(data: schema.InsertPricingAuditLog): Promise<schema.PricingAuditLog>;
  getPricingAuditLog(limit?: number): Promise<schema.PricingAuditLog[]>;
  // Admin Audit Log
  createAdminAuditLog(data: schema.InsertAdminAuditLog): Promise<schema.AdminAuditLog>;
  getAdminAuditLog(opts?: { entityType?: string; entityId?: string; actorId?: number; limit?: number; offset?: number }): Promise<schema.AdminAuditLog[]>;
  countAdminAuditLog(opts?: { entityType?: string; entityId?: string; actorId?: number }): Promise<number>;
  // Stats
  getCustomerStats(id: number): Promise<any>;
  // Sessions (DB-backed)
  createSession(token: string, userId: number, role: string, expiresAt: string): Promise<void>;
  getSession(token: string): Promise<{ userId: number; role: string; expiresAt: string } | null>;
  deleteSession(token: string): Promise<void>;
  deleteSessionsByUser(userId: number): Promise<void>;
  deleteExpiredSessions(): Promise<void>;
  // Idempotency Keys (DB-backed)
  storeIdempotencyKey(key: string, response: string, statusCode: number, expiresAt: string): Promise<void>;
  getIdempotencyKey(key: string): Promise<{ response: string; statusCode: number } | null>;
  deleteExpiredIdempotencyKeys(): Promise<void>;
  // Stripe Webhook Events
  recordStripeEvent(eventId: string, type: string): Promise<boolean>;
  deleteStripeEvent(eventId: string): Promise<void>;
  // Promo Usage
  recordPromoUsage(promoId: number, userId: number, orderId: number): Promise<void>;
  getPromoUsageByUser(promoId: number, userId: number): Promise<number>;
  deletePromoUsageByOrder(orderId: number): Promise<void>;
  // Password Reset Tokens
  createPasswordResetToken(userId: number, token: string, expiresAt: string): Promise<void>;
  getPasswordResetToken(token: string): Promise<{ userId: number; token: string; expiresAt: string; usedAt: string | null } | undefined>;
  markPasswordResetTokenUsed(token: string): Promise<void>;
  cleanExpiredResetTokens(): Promise<void>;
  // Notification Rules
  getNotificationRules(): Promise<schema.NotificationRule[]>;
  getNotificationRule(id: number): Promise<schema.NotificationRule | undefined>;
  getNotificationRulesByTrigger(trigger: string): Promise<schema.NotificationRule[]>;
  createNotificationRule(input: schema.InsertNotificationRule): Promise<schema.NotificationRule>;
  updateNotificationRule(id: number, patch: Partial<schema.InsertNotificationRule>): Promise<schema.NotificationRule | undefined>;
  deleteNotificationRule(id: number): Promise<boolean>;
}

// ── Dual-write helpers: add shadow _cents columns from dollar values ──
function dollarToCents(v: number | null | undefined): number | null {
  return v != null ? Math.round(v * 100) : null;
}
export function addOrderCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.subtotal != null && d.subtotalCents == null) d.subtotalCents = dollarToCents(d.subtotal);
  if (d.tax != null && d.taxCents == null) d.taxCents = dollarToCents(d.tax);
  if (d.deliveryFee != null && d.deliveryFeeCents == null) d.deliveryFeeCents = dollarToCents(d.deliveryFee);
  if (d.discount != null && d.discountCents == null) d.discountCents = dollarToCents(d.discount);
  if (d.total != null && d.totalCents == null) d.totalCents = dollarToCents(d.total);
  if (d.finalPrice != null && d.finalPriceCents == null) d.finalPriceCents = dollarToCents(d.finalPrice);
  if (d.vendorPayout != null && d.vendorPayoutCents == null) d.vendorPayoutCents = dollarToCents(d.vendorPayout);
  if (d.driverPayout != null && d.driverPayoutCents == null) d.driverPayoutCents = dollarToCents(d.driverPayout);
  if (d.tierFlatPrice != null && d.tierFlatPriceCents == null) d.tierFlatPriceCents = dollarToCents(d.tierFlatPrice);
  return d;
}
export function addQuoteCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.subtotal != null && d.subtotalCents == null) d.subtotalCents = dollarToCents(d.subtotal);
  if (d.taxAmount != null && d.taxAmountCents == null) d.taxAmountCents = dollarToCents(d.taxAmount);
  if (d.deliveryFee != null && d.deliveryFeeCents == null) d.deliveryFeeCents = dollarToCents(d.deliveryFee);
  if (d.discount != null && d.discountCents == null) d.discountCents = dollarToCents(d.discount);
  if (d.total != null && d.totalCents == null) d.totalCents = dollarToCents(d.total);
  if (d.tierFlatPrice != null && d.tierFlatPriceCents == null) d.tierFlatPriceCents = dollarToCents(d.tierFlatPrice);
  return d;
}
function addVendorCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.payoutRate != null && d.payoutRateCents == null) d.payoutRateCents = dollarToCents(d.payoutRate);
  if (d.totalEarnings != null && d.totalEarningsCents == null) d.totalEarningsCents = dollarToCents(d.totalEarnings);
  if (d.pendingPayout != null && d.pendingPayoutCents == null) d.pendingPayoutCents = dollarToCents(d.pendingPayout);
  return d;
}
function addDriverCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.payoutPerTrip != null && d.payoutPerTripCents == null) d.payoutPerTripCents = dollarToCents(d.payoutPerTrip);
  if (d.totalEarnings != null && d.totalEarningsCents == null) d.totalEarningsCents = dollarToCents(d.totalEarnings);
  if (d.pendingPayout != null && d.pendingPayoutCents == null) d.pendingPayoutCents = dollarToCents(d.pendingPayout);
  return d;
}
function addUserCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.totalSpent != null && d.totalSpentCents == null) d.totalSpentCents = dollarToCents(d.totalSpent);
  return d;
}
function addDisputeCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.creditAmount != null && d.creditAmountCents == null) d.creditAmountCents = dollarToCents(d.creditAmount);
  if (d.refundAmount != null && d.refundAmountCents == null) d.refundAmountCents = dollarToCents(d.refundAmount);
  return d;
}
function addPromoCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.value != null && d.valueCents == null) d.valueCents = dollarToCents(d.value);
  if (d.minOrderAmount != null && d.minOrderAmountCents == null) d.minOrderAmountCents = dollarToCents(d.minOrderAmount);
  return d;
}
function addReferralCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.referrerReward != null && d.referrerRewardCents == null) d.referrerRewardCents = dollarToCents(d.referrerReward);
  if (d.refereeReward != null && d.refereeRewardCents == null) d.refereeRewardCents = dollarToCents(d.refereeReward);
  return d;
}
function addConsentCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.additionalCharge != null && d.additionalChargeCents == null) d.additionalChargeCents = dollarToCents(d.additionalCharge);
  return d;
}
function addServiceTypeCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.basePrice != null && d.basePriceCents == null) d.basePriceCents = dollarToCents(d.basePrice);
  return d;
}
function addPricingTierCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.flatPrice != null && d.flatPriceCents == null) d.flatPriceCents = dollarToCents(d.flatPrice);
  if (d.overageRate != null && d.overageRateCents == null) d.overageRateCents = dollarToCents(d.overageRate);
  return d;
}
function addAddOnCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.price != null && d.priceCents == null) d.priceCents = dollarToCents(d.price);
  return d;
}
function addOrderAddOnCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.unitPrice != null && d.unitPriceCents == null) d.unitPriceCents = dollarToCents(d.unitPrice);
  if (d.total != null && d.totalCents == null) d.totalCents = dollarToCents(d.total);
  return d;
}
function addPaymentTxnCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.platformFee != null && d.platformFeeCents == null) d.platformFeeCents = dollarToCents(d.platformFee);
  return d;
}

class DatabaseStorage implements IStorage {
  // ─── Users ───
  async getUser(id: number) {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return row;
  }
  async getUserByUsername(username: string) {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.username, username));
    return row;
  }
  async getUserByEmail(email: string) {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return row;
  }
  async getUsersByRole(role: string) {
    return db.select().from(schema.users).where(eq(schema.users.role, role));
  }
  async createUser(data: schema.InsertUser) {
    const [row] = await db.insert(schema.users).values(addUserCents(data)).returning();
    return row;
  }
  async updateUser(id: number, data: Partial<schema.InsertUser>) {
    const [row] = await db.update(schema.users).set(addUserCents(data)).where(eq(schema.users.id, id)).returning();
    return row;
  }
  async deleteUserAccount(id: number) {
    // Scrub PII from the user record (soft-delete preserves FK integrity)
    const deletedTs = new Date().toISOString();
    await db.update(schema.users).set({
      name: "Deleted User",
      email: `deleted-${id}@removed.offloadusa.com`,
      username: `deleted-${id}`,
      phone: null,
      avatarUrl: null,
      password: "ACCOUNT_DELETED",
      referralCode: null,
      specialInstructions: null,
      loyaltyPoints: 0,
      credits: 0,
      lastActiveAt: deletedTs,
    } as any).where(eq(schema.users.id, id));
    // Delete PII-bearing child records
    await db.delete(schema.addresses).where(eq(schema.addresses.userId, id));
    await db.delete(schema.paymentMethods).where(eq(schema.paymentMethods.userId, id));
    await db.delete(schema.pushTokens).where(eq(schema.pushTokens.userId, id));
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
    await db.delete(schema.notifications).where(eq(schema.notifications.userId, id));
  }
  async searchUsers(query: string) {
    return db.select().from(schema.users).where(
      or(like(schema.users.name, `%${query}%`), like(schema.users.email, `%${query}%`))
    );
  }

  // ─── Addresses ───
  async getAddress(id: number) {
    const [row] = await db.select().from(schema.addresses).where(eq(schema.addresses.id, id));
    return row;
  }
  async getAddressesByUser(userId: number) {
    return db.select().from(schema.addresses).where(eq(schema.addresses.userId, userId));
  }
  async createAddress(data: schema.InsertAddress) {
    const [row] = await db.insert(schema.addresses).values(data).returning();
    return row;
  }
  async updateAddress(id: number, data: Partial<schema.InsertAddress>) {
    const [row] = await db.update(schema.addresses).set(data).where(eq(schema.addresses.id, id)).returning();
    return row;
  }
  async deleteAddress(id: number) {
    await db.delete(schema.addresses).where(eq(schema.addresses.id, id));
  }

  // ─── Vendors ───
  async getVendors() { return db.select().from(schema.vendors); }
  async getVendor(id: number) {
    const [row] = await db.select().from(schema.vendors).where(eq(schema.vendors.id, id));
    return row;
  }
  async getVendorByUserId(userId: number) {
    const user = await this.getUser(userId);
    if (user?.vendorId) return this.getVendor(user.vendorId);
    const [row] = await db.select().from(schema.vendors).where(eq(schema.vendors.email, user?.email || ""));
    return row;
  }
  async getActiveVendors() { return db.select().from(schema.vendors).where(eq(schema.vendors.status, "active")); }
  async createVendor(data: schema.InsertVendor) {
    const [row] = await db.insert(schema.vendors).values(addVendorCents(data)).returning();
    return row;
  }
  async updateVendor(id: number, data: Partial<schema.InsertVendor>) {
    const [row] = await db.update(schema.vendors).set(addVendorCents(data)).where(eq(schema.vendors.id, id)).returning();
    return row;
  }
  async getVendorStats(id: number) {
    const orders = await db.select().from(schema.orders).where(eq(schema.orders.vendorId, id));
    const reviews = await db.select().from(schema.reviews).where(eq(schema.reviews.vendorId, id));
    const delivered = orders.filter(o => o.status === "delivered");
    return {
      totalOrders: orders.length, completedOrders: delivered.length,
      activeOrders: orders.filter(o => !["delivered","cancelled"].includes(o.status)).length,
      avgRating: reviews.length ? reviews.reduce((s, r) => s + (r.vendorRating || r.overallRating), 0) / reviews.length : 0,
      totalRevenue: delivered.reduce((s, o) => s + (o.total || 0), 0),
    };
  }

  // ─── Drivers ───
  async getDrivers() { return db.select().from(schema.drivers); }
  async getDriver(id: number) {
    const [row] = await db.select().from(schema.drivers).where(eq(schema.drivers.id, id));
    return row;
  }
  async getDriverByUserId(userId: number) {
    const [row] = await db.select().from(schema.drivers).where(eq(schema.drivers.userId, userId));
    return row;
  }
  async getAvailableDrivers() { return db.select().from(schema.drivers).where(eq(schema.drivers.status, "available")); }
  async createDriver(data: schema.InsertDriver) {
    const [row] = await db.insert(schema.drivers).values(addDriverCents(data)).returning();
    return row;
  }
  async updateDriver(id: number, data: Partial<schema.InsertDriver>) {
    const [row] = await db.update(schema.drivers).set(addDriverCents(data)).where(eq(schema.drivers.id, id)).returning();
    return row;
  }
  async getDriverStats(id: number) {
    const orders = await db.select().from(schema.orders).where(eq(schema.orders.driverId, id));
    const reviews = await db.select().from(schema.reviews).where(eq(schema.reviews.driverId, id));
    return {
      totalOrders: orders.length,
      completedOrders: orders.filter(o => o.status === "delivered").length,
      avgRating: reviews.length ? reviews.reduce((s, r) => s + (r.driverRating || r.overallRating), 0) / reviews.length : 0,
    };
  }

  // ─── Service Types ───
  async getServiceTypes() { return db.select().from(schema.serviceTypes).orderBy(schema.serviceTypes.sortOrder); }
  async createServiceType(data: schema.InsertServiceType) {
    const [row] = await db.insert(schema.serviceTypes).values(addServiceTypeCents(data)).returning();
    return row;
  }

  // ─── Orders ───
  async getOrders() { return db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)); }
  async getOrder(id: number) {
    const [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
    return row;
  }
  async getActiveOrders() {
    return db.select().from(schema.orders).where(
      and(
        sql`${schema.orders.status} NOT IN ('delivered', 'cancelled')`,
      )
    );
  }
  async getOrdersByCustomer(customerId: number) {
    return db.select().from(schema.orders).where(eq(schema.orders.customerId, customerId)).orderBy(desc(schema.orders.createdAt));
  }
  async getOrdersByVendor(vendorId: number) {
    return db.select().from(schema.orders).where(eq(schema.orders.vendorId, vendorId)).orderBy(desc(schema.orders.createdAt));
  }
  async getOrdersByDriver(driverId: number) {
    return db.select().from(schema.orders).where(
      or(eq(schema.orders.driverId, driverId), eq(schema.orders.returnDriverId, driverId))
    ).orderBy(desc(schema.orders.createdAt));
  }
  async getOrdersByStatus(status: string) {
    return db.select().from(schema.orders).where(eq(schema.orders.status, status));
  }
  async createOrder(data: schema.InsertOrder) {
    const augmented = addOrderCents(data);
    const [row] = await db.insert(schema.orders).values(augmented).returning();
    return row;
  }
  async updateOrder(id: number, data: Partial<schema.InsertOrder>) {
    const augmented = addOrderCents(data);
    const [row] = await db.update(schema.orders).set(augmented).where(eq(schema.orders.id, id)).returning();
    return row;
  }

  // ─── Order Events ───
  async getOrderEvents(orderId: number) {
    return db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, orderId)).orderBy(schema.orderEvents.timestamp);
  }
  async createOrderEvent(data: schema.InsertOrderEvent) {
    const [row] = await db.insert(schema.orderEvents).values(data).returning();
    return row;
  }

  // ─── Payment Methods ───
  async getPaymentMethodsByUser(userId: number) { return db.select().from(schema.paymentMethods).where(eq(schema.paymentMethods.userId, userId)); }
  async createPaymentMethod(data: schema.InsertPaymentMethod) {
    const [row] = await db.insert(schema.paymentMethods).values(data).returning();
    return row;
  }
  async updatePaymentMethod(id: number, data: Partial<schema.InsertPaymentMethod>) {
    const [row] = await db.update(schema.paymentMethods).set(data).where(eq(schema.paymentMethods.id, id)).returning();
    return row;
  }
  async deletePaymentMethod(id: number) { await db.delete(schema.paymentMethods).where(eq(schema.paymentMethods.id, id)); }

  // ─── Consents ───
  async getConsentsByOrder(orderId: number) { return db.select().from(schema.consentRecords).where(eq(schema.consentRecords.orderId, orderId)); }
  async getConsent(id: number) {
    const [row] = await db.select().from(schema.consentRecords).where(eq(schema.consentRecords.id, id));
    return row;
  }
  async getPendingConsents() { return db.select().from(schema.consentRecords).where(eq(schema.consentRecords.status, "pending")); }
  async createConsent(data: schema.InsertConsent) {
    const [row] = await db.insert(schema.consentRecords).values(addConsentCents(data)).returning();
    return row;
  }
  async updateConsent(id: number, data: Partial<schema.InsertConsent>) {
    const [row] = await db.update(schema.consentRecords).set(addConsentCents(data)).where(eq(schema.consentRecords.id, id)).returning();
    return row;
  }

  // ─── Messages ───
  async getMessagesByOrder(orderId: number) {
    return db.select().from(schema.messages).where(eq(schema.messages.orderId, orderId)).orderBy(schema.messages.timestamp);
  }
  async getMessagesByConversation(conversationId: string) {
    return db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(schema.messages.timestamp);
  }
  async createMessage(data: schema.InsertMessage) {
    const [row] = await db.insert(schema.messages).values(data).returning();
    return row;
  }

  // ─── Disputes ───
  async getDisputes() { return db.select().from(schema.disputes).orderBy(desc(schema.disputes.createdAt)); }
  async getDispute(id: number) {
    const [row] = await db.select().from(schema.disputes).where(eq(schema.disputes.id, id));
    return row;
  }
  async createDispute(data: schema.InsertDispute) {
    const [row] = await db.insert(schema.disputes).values(addDisputeCents(data)).returning();
    return row;
  }
  async updateDispute(id: number, data: Partial<schema.InsertDispute>) {
    const [row] = await db.update(schema.disputes).set(addDisputeCents(data)).where(eq(schema.disputes.id, id)).returning();
    return row;
  }

  // ─── Reviews ───
  async getReviews() { return db.select().from(schema.reviews).orderBy(desc(schema.reviews.createdAt)); }
  async getReviewByOrder(orderId: number) {
    const [row] = await db.select().from(schema.reviews).where(eq(schema.reviews.orderId, orderId));
    return row;
  }
  async getReviewsByVendor(vendorId: number) { return db.select().from(schema.reviews).where(eq(schema.reviews.vendorId, vendorId)); }
  async getReviewsByDriver(driverId: number) { return db.select().from(schema.reviews).where(eq(schema.reviews.driverId, driverId)); }
  async createReview(data: schema.InsertReview) {
    const [row] = await db.insert(schema.reviews).values(data).returning();
    return row;
  }

  // ─── Partner Applications ───
  async getPartnerApplications(filter?: { applicantType?: string; status?: string }) {
    const conditions: any[] = [];
    if (filter?.applicantType) conditions.push(eq(schema.partnerApplications.applicantType, filter.applicantType));
    if (filter?.status) conditions.push(eq(schema.partnerApplications.status, filter.status));
    const q = conditions.length
      ? db.select().from(schema.partnerApplications).where(and(...conditions))
      : db.select().from(schema.partnerApplications);
    return q.orderBy(desc(schema.partnerApplications.createdAt));
  }
  async getPartnerApplication(id: number) {
    const [row] = await db.select().from(schema.partnerApplications).where(eq(schema.partnerApplications.id, id));
    return row;
  }
  async createPartnerApplication(data: any) {
    const [row] = await db.insert(schema.partnerApplications).values(data).returning();
    return row;
  }
  async updatePartnerApplication(id: number, patch: Partial<schema.PartnerApplication>) {
    const [row] = await db.update(schema.partnerApplications).set(patch).where(eq(schema.partnerApplications.id, id)).returning();
    return row;
  }

  // ─── Notifications ───
  async getNotificationsByUser(userId: number) {
    return db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(desc(schema.notifications.createdAt));
  }
  async getUnreadCount(userId: number) {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.read, 0)));
    return Number(result?.count) || 0;
  }
  async getNotification(id: number) {
    const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id));
    return row;
  }
  async createNotification(data: schema.InsertNotification) {
    const [row] = await db.insert(schema.notifications).values(data).returning();
    return row;
  }
  async savePushToken(userId: number, token: string, platform: string) {
    const [existing] = await db.select().from(schema.pushTokens).where(eq(schema.pushTokens.token, token));
    if (existing) {
      const [row] = await db.update(schema.pushTokens)
        .set({ userId, platform, createdAt: new Date().toISOString() })
        .where(eq(schema.pushTokens.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(schema.pushTokens).values({ userId, token, platform, createdAt: new Date().toISOString() }).returning();
    return row;
  }
  async deletePushToken(userId: number, token: string) {
    await db.delete(schema.pushTokens).where(and(eq(schema.pushTokens.userId, userId), eq(schema.pushTokens.token, token)));
  }
  async getPushTokensByUser(userId: number) {
    return db.select().from(schema.pushTokens).where(eq(schema.pushTokens.userId, userId));
  }
  async markNotificationRead(id: number) {
    const [row] = await db.update(schema.notifications).set({ read: 1 }).where(eq(schema.notifications.id, id)).returning();
    return row;
  }
  async markAllRead(userId: number) {
    await db.update(schema.notifications).set({ read: 1 }).where(eq(schema.notifications.userId, userId));
  }

  // ─── Promo Codes ───
  async getPromoCode(code: string) {
    const [row] = await db.select().from(schema.promoCodes).where(eq(schema.promoCodes.code, code));
    return row;
  }
  async getPromoCodes() { return db.select().from(schema.promoCodes); }
  async createPromoCode(data: schema.InsertPromoCode) {
    const [row] = await db.insert(schema.promoCodes).values(addPromoCents(data)).returning();
    return row;
  }
  async updatePromoCode(id: number, data: Partial<schema.InsertPromoCode>) {
    const [row] = await db.update(schema.promoCodes).set(addPromoCents(data)).where(eq(schema.promoCodes.id, id)).returning();
    return row;
  }

  // ─── Referrals ───
  async getReferralsByUser(userId: number) {
    return db.select().from(schema.referrals).where(
      or(eq(schema.referrals.referrerId, userId), eq(schema.referrals.refereeId, userId))
    );
  }
  async createReferral(data: schema.InsertReferral) {
    const [row] = await db.insert(schema.referrals).values(addReferralCents(data)).returning();
    return row;
  }
  async updateReferral(id: number, data: Partial<schema.InsertReferral>) {
    const [row] = await db.update(schema.referrals).set(addReferralCents(data)).where(eq(schema.referrals.id, id)).returning();
    return row;
  }

  // ─── Loyalty Transactions ───
  async getLoyaltyTransactions(userId: number) {
    return db.select().from(schema.loyaltyTransactions).where(eq(schema.loyaltyTransactions.userId, userId))
      .orderBy(desc(schema.loyaltyTransactions.createdAt));
  }
  async createLoyaltyTransaction(data: schema.InsertLoyaltyTransaction) {
    const [row] = await db.insert(schema.loyaltyTransactions).values(data).returning();
    return row;
  }

  // ─── Chat Sessions ───
  async getChatSessions(userId: number) {
    return db.select().from(schema.chatSessions).where(eq(schema.chatSessions.userId, userId))
      .orderBy(desc(schema.chatSessions.createdAt));
  }
  async getChatSession(id: number) {
    const [row] = await db.select().from(schema.chatSessions).where(eq(schema.chatSessions.id, id));
    return row;
  }
  async getAllSupportSessions() {
    return db.select().from(schema.chatSessions)
      .where(or(
        eq(schema.chatSessions.status, "escalated"),
        eq(schema.chatSessions.status, "active"),
      ))
      .orderBy(desc(schema.chatSessions.createdAt));
  }
  async createChatSession(data: schema.InsertChatSession) {
    const [row] = await db.insert(schema.chatSessions).values(data).returning();
    return row;
  }
  async updateChatSession(id: number, data: Partial<schema.InsertChatSession>) {
    const [row] = await db.update(schema.chatSessions).set(data).where(eq(schema.chatSessions.id, id)).returning();
    return row;
  }

  // ─── Vendor Payouts ───
  async getVendorPayout(id: number) {
    const [row] = await db.select().from(schema.vendorPayouts).where(eq(schema.vendorPayouts.id, id));
    return row;
  }
  async getVendorPayouts(vendorId: number) {
    return db.select().from(schema.vendorPayouts).where(eq(schema.vendorPayouts.vendorId, vendorId))
      .orderBy(desc(schema.vendorPayouts.createdAt));
  }
  async createVendorPayout(data: schema.InsertVendorPayout) {
    const d = data as any;
    if (d.amount != null && d.amountCents == null) {
      (d as any).amountCents = Math.round(d.amount * 100);
    }
    const [row] = await db.insert(schema.vendorPayouts).values(d).returning();
    return row;
  }
  async updateVendorPayout(id: number, data: Partial<schema.InsertVendorPayout>) {
    const [row] = await db.update(schema.vendorPayouts).set(data).where(eq(schema.vendorPayouts.id, id)).returning();
    return row;
  }

  // ─── Pricing Tiers ───
  async getPricingTiers() { return db.select().from(schema.pricingTiers).where(eq(schema.pricingTiers.isActive, 1)).orderBy(schema.pricingTiers.sortOrder); }
  async getPricingTier(id: number) {
    const [row] = await db.select().from(schema.pricingTiers).where(eq(schema.pricingTiers.id, id));
    return row;
  }
  async getPricingTierByName(name: string) {
    const [row] = await db.select().from(schema.pricingTiers).where(eq(schema.pricingTiers.name, name));
    return row;
  }
  async createPricingTier(data: schema.InsertPricingTier) {
    const [row] = await db.insert(schema.pricingTiers).values(addPricingTierCents(data)).returning();
    return row;
  }

  // ─── Add-Ons ───
  async getAddOns() { return db.select().from(schema.addOns).where(eq(schema.addOns.isActive, 1)); }
  async getAllAddOns() { return db.select().from(schema.addOns).orderBy(schema.addOns.id); }
  async getAddOn(id: number) {
    const [row] = await db.select().from(schema.addOns).where(eq(schema.addOns.id, id));
    return row;
  }
  async createAddOn(data: schema.InsertAddOn) {
    const [row] = await db.insert(schema.addOns).values(addAddOnCents(data)).returning();
    return row;
  }
  async updateAddOn(id: number, data: Partial<schema.InsertAddOn>) {
    const [row] = await db.update(schema.addOns).set(addAddOnCents(data)).where(eq(schema.addOns.id, id)).returning();
    return row;
  }
  async deleteAddOn(id: number): Promise<boolean> {
    const result = await db.delete(schema.addOns).where(eq(schema.addOns.id, id)).returning();
    return result.length > 0;
  }

  // ─── Order Add-Ons ───
  async getOrderAddOns(orderId: number) { return db.select().from(schema.orderAddOns).where(eq(schema.orderAddOns.orderId, orderId)); }
  async createOrderAddOn(data: schema.InsertOrderAddOn) {
    const [row] = await db.insert(schema.orderAddOns).values(addOrderAddOnCents(data)).returning();
    return row;
  }

  // ─── Payment Transactions ───
  async getPaymentTransactions() {
    return db.select().from(schema.paymentTransactions).orderBy(desc(schema.paymentTransactions.createdAt));
  }
  async getPaymentTransactionsByOrder(orderId: number) {
    return db.select().from(schema.paymentTransactions).where(eq(schema.paymentTransactions.orderId, orderId))
      .orderBy(desc(schema.paymentTransactions.createdAt));
  }
  async createPaymentTransaction(data: schema.InsertPaymentTransaction) {
    const [row] = await db.insert(schema.paymentTransactions).values(addPaymentTxnCents(data)).returning();
    return row;
  }
  async updatePaymentTransaction(id: number, data: Partial<schema.InsertPaymentTransaction>) {
    const [row] = await db.update(schema.paymentTransactions).set(data).where(eq(schema.paymentTransactions.id, id)).returning();
    return row;
  }

  // ─── Stripe Accounts ───
  async getStripeAccount(userId: number) {
    const [row] = await db.select().from(schema.stripeAccounts).where(eq(schema.stripeAccounts.userId, userId));
    return row;
  }
  async createStripeAccount(data: schema.InsertStripeAccount) {
    const [row] = await db.insert(schema.stripeAccounts).values(data).returning();
    return row;
  }
  async updateStripeAccount(id: number, data: Partial<schema.InsertStripeAccount>) {
    const [row] = await db.update(schema.stripeAccounts).set(data).where(eq(schema.stripeAccounts.id, id)).returning();
    return row;
  }

  // ─── Order Status History ───
  async getOrderStatusHistory(orderId: number) {
    return db.select().from(schema.orderStatusHistory).where(eq(schema.orderStatusHistory.orderId, orderId))
      .orderBy(schema.orderStatusHistory.timestamp);
  }
  async createOrderStatusHistory(data: schema.InsertOrderStatusHistory) {
    const [row] = await db.insert(schema.orderStatusHistory).values(data).returning();
    return row;
  }

  // ─── Message Helpers ───
  async getMessagesBySender(senderId: number) {
    return db.select().from(schema.messages).where(eq(schema.messages.senderId, senderId))
      .orderBy(desc(schema.messages.timestamp));
  }
  async getConversationsForUser(userId: number) {
    return db.select().from(schema.messages).where(
      or(eq(schema.messages.senderId, userId))
    ).orderBy(desc(schema.messages.timestamp));
  }
  async getMessage(id: number) {
    const [row] = await db.select().from(schema.messages).where(eq(schema.messages.id, id));
    return row;
  }
  async markMessageRead(id: number) {
    const [row] = await db.update(schema.messages).set({ readAt: new Date().toISOString() }).where(eq(schema.messages.id, id)).returning();
    return row;
  }

  // ─── Driver Location History ───
  async createDriverLocationHistory(data: schema.InsertDriverLocationHistory) {
    const [row] = await db.insert(schema.driverLocationHistory).values(data).returning();
    return row;
  }
  async getDriverLocationHistory(driverId: number, limit = 100) {
    return db.select().from(schema.driverLocationHistory)
      .where(eq(schema.driverLocationHistory.driverId, driverId))
      .orderBy(desc(schema.driverLocationHistory.timestamp))
      .limit(limit);
  }

  // ─── Order Photos ───
  async createOrderPhoto(data: schema.InsertOrderPhoto) {
    const [row] = await db.insert(schema.orderPhotos).values(data).returning();
    return row;
  }
  async getOrderPhotos(orderId: number) {
    return db.select().from(schema.orderPhotos)
      .where(eq(schema.orderPhotos.orderId, orderId))
      .orderBy(schema.orderPhotos.timestamp);
  }
  async getOrderPhotosByType(orderId: number, type: string) {
    return db.select().from(schema.orderPhotos)
      .where(and(eq(schema.orderPhotos.orderId, orderId), eq(schema.orderPhotos.type, type)))
      .orderBy(schema.orderPhotos.timestamp);
  }
  async getPhotosByOrder(orderId: number) {
    return db.select().from(schema.orderPhotos)
      .where(eq(schema.orderPhotos.orderId, orderId));
  }

  // ─── Notification Helpers ───
  async deleteNotification(id: number) {
    await db.delete(schema.notifications).where(eq(schema.notifications.id, id));
  }
  async getNotificationsByCategory(userId: number, category: string) {
    return db.select().from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.category, category)))
      .orderBy(desc(schema.notifications.createdAt));
  }

  // ─── Quotes ───
  async getQuote(id: number) {
    const [row] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id));
    return row;
  }
  async getQuoteByNumber(quoteNumber: string) {
    const [row] = await db.select().from(schema.quotes).where(eq(schema.quotes.quoteNumber, quoteNumber));
    return row;
  }
  async getQuoteByIdempotencyKey(key: string) {
    const [row] = await db.select().from(schema.quotes).where(eq(schema.quotes.idempotencyKey, key));
    return row;
  }
  async getQuotesByCustomer(customerId: number) {
    return db.select().from(schema.quotes).where(eq(schema.quotes.customerId, customerId)).orderBy(desc(schema.quotes.createdAt));
  }
  async getQuotesBySession(sessionId: string) {
    return db.select().from(schema.quotes).where(eq(schema.quotes.sessionId, sessionId)).orderBy(desc(schema.quotes.createdAt));
  }
  async createQuote(data: schema.InsertQuote) {
    const augmented = addQuoteCents(data);
    const [row] = await db.insert(schema.quotes).values(augmented).returning();
    return row;
  }
  async updateQuote(id: number, data: Partial<schema.InsertQuote>) {
    const augmented = addQuoteCents(data);
    const [row] = await db.update(schema.quotes).set(augmented).where(eq(schema.quotes.id, id)).returning();
    return row;
  }
  async expireStaleQuotes(): Promise<number> {
    const now = new Date().toISOString();
    const result = await db.update(schema.quotes)
      .set({ status: "expired", updatedAt: now })
      .where(and(
        or(eq(schema.quotes.status, "draft"), eq(schema.quotes.status, "quoted")),
        sql`${schema.quotes.expiresAt} < ${now}`
      ))
      .returning();
    return result.length;
  }

  // ─── Pricing Config ───
  async getPricingConfig(key: string) {
    const [row] = await db.select().from(schema.pricingConfig).where(eq(schema.pricingConfig.key, key));
    return row;
  }
  async getAllPricingConfig() { return db.select().from(schema.pricingConfig); }
  async getPricingConfigByCategory(category: string) {
    return db.select().from(schema.pricingConfig).where(eq(schema.pricingConfig.category, category));
  }
  async upsertPricingConfig(key: string, value: string, category: string, description?: string, updatedBy?: number) {
    const existing = await this.getPricingConfig(key);
    if (existing) {
      const [row] = await db.update(schema.pricingConfig)
        .set({ value, category, description: description ?? existing.description, updatedAt: new Date().toISOString(), updatedBy: updatedBy ?? existing.updatedBy })
        .where(eq(schema.pricingConfig.key, key))
        .returning();
      return row;
    }
    const [row] = await db.insert(schema.pricingConfig).values({
      key, value, category, description: description ?? null, updatedAt: new Date().toISOString(), updatedBy: updatedBy ?? null,
    }).returning();
    return row;
  }

  // ─── Pricing Audit ───
  async createPricingAuditEntry(data: schema.InsertPricingAuditLog) {
    const [row] = await db.insert(schema.pricingAuditLog).values(data).returning();
    return row;
  }
  async getPricingAuditLog(limit = 100) {
    return db.select().from(schema.pricingAuditLog).orderBy(desc(schema.pricingAuditLog.timestamp)).limit(limit);
  }

  // ─── Service Area Requests (unserved-area demand capture) ───
  async createServiceAreaRequest(data: schema.InsertServiceAreaRequest & { notes?: string }) {
    const now = new Date().toISOString();
    const [row] = await db.insert(schema.serviceAreaRequests).values({
      ...data,
      status: "new",
      createdAt: now,
      updatedAt: now,
    } as any).returning();
    return row;
  }
  async getServiceAreaRequests(opts?: { status?: string; zip?: string; state?: string; limit?: number; offset?: number }) {
    const conditions: any[] = [];
    if (opts?.status) conditions.push(eq(schema.serviceAreaRequests.status, opts.status));
    if (opts?.zip)    conditions.push(eq(schema.serviceAreaRequests.zip, opts.zip));
    if (opts?.state)  conditions.push(eq(schema.serviceAreaRequests.state, opts.state));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = Math.min(opts?.limit || 100, 500);
    const offset = opts?.offset || 0;
    return db.select().from(schema.serviceAreaRequests)
      .where(where)
      .orderBy(desc(schema.serviceAreaRequests.createdAt))
      .limit(limit)
      .offset(offset);
  }
  async getServiceAreaRequest(id: number) {
    const [row] = await db.select().from(schema.serviceAreaRequests).where(eq(schema.serviceAreaRequests.id, id));
    return row;
  }
  async updateServiceAreaRequest(id: number, patch: { status?: string; notes?: string }) {
    const [row] = await db.update(schema.serviceAreaRequests)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(schema.serviceAreaRequests.id, id))
      .returning();
    return row;
  }
  async getServiceAreaDemandByZip() {
    // Aggregated lead count per ZIP for the admin expansion dashboard
    const rows = await db.select().from(schema.serviceAreaRequests);
    const byZip: Record<string, { zip: string; count: number; newCount: number; latest: string }> = {};
    for (const r of rows) {
      const z = r.zip || "";
      if (!byZip[z]) byZip[z] = { zip: z, count: 0, newCount: 0, latest: r.createdAt };
      byZip[z].count++;
      if (r.status === "new") byZip[z].newCount++;
      if (r.createdAt > byZip[z].latest) byZip[z].latest = r.createdAt;
    }
    return Object.values(byZip).sort((a, b) => b.count - a.count);
  }

  // ─── Admin Audit Log ───
  async createAdminAuditLog(data: schema.InsertAdminAuditLog) {
    const [row] = await db.insert(schema.adminAuditLog).values(data).returning();
    return row;
  }
  async getAdminAuditLog(opts?: { entityType?: string; entityId?: string; actorId?: number; limit?: number; offset?: number }) {
    const conditions: any[] = [];
    if (opts?.entityType) conditions.push(eq(schema.adminAuditLog.entityType, opts.entityType));
    if (opts?.entityId) conditions.push(eq(schema.adminAuditLog.entityId, opts.entityId));
    if (opts?.actorId) conditions.push(eq(schema.adminAuditLog.actorId, opts.actorId));
    const limit = Math.min(opts?.limit || 50, 200);
    const offset = opts?.offset || 0;
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(schema.adminAuditLog)
      .where(where)
      .orderBy(desc(schema.adminAuditLog.timestamp))
      .limit(limit)
      .offset(offset);
  }
  async countAdminAuditLog(opts?: { entityType?: string; entityId?: string; actorId?: number }) {
    const conditions: any[] = [];
    if (opts?.entityType) conditions.push(eq(schema.adminAuditLog.entityType, opts.entityType));
    if (opts?.entityId) conditions.push(eq(schema.adminAuditLog.entityId, opts.entityId));
    if (opts?.actorId) conditions.push(eq(schema.adminAuditLog.actorId, opts.actorId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(schema.adminAuditLog).where(where);
    return Number(row?.count || 0);
  }

  // ─── Customer Stats ───
  async getCustomerStats(id: number) {
    const orders = await db.select().from(schema.orders).where(eq(schema.orders.customerId, id));
    const delivered = orders.filter(o => o.status === "delivered");
    const user = await this.getUser(id);
    return {
      totalOrders: orders.length,
      completedOrders: delivered.length,
      totalSpent: delivered.reduce((s, o) => s + (o.total || 0), 0),
      avgOrderValue: delivered.length > 0 ? delivered.reduce((s, o) => s + (o.total || 0), 0) / delivered.length : 0,
      loyaltyPoints: user?.loyaltyPoints || 0,
      loyaltyTier: user?.loyaltyTier || "bronze",
      memberSince: user?.memberSince,
    };
  }

  // ─── Sessions (DB-backed) ───
  async createSession(token: string, userId: number, role: string, expiresAt: string): Promise<void> {
    await db.insert(schema.sessions).values({
      token,
      userId,
      role,
      createdAt: new Date().toISOString(),
      expiresAt,
    });
  }
  async getSession(token: string): Promise<{ userId: number; role: string; expiresAt: string } | null> {
    const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.token, token));
    if (!session) return null;
    if (new Date(session.expiresAt) < new Date()) {
      await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
      return null;
    }
    return { userId: session.userId, role: session.role, expiresAt: session.expiresAt };
  }
  async deleteSession(token: string): Promise<void> {
    await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
  }
  async deleteSessionsByUser(userId: number): Promise<void> {
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  }
  async deleteExpiredSessions(): Promise<void> {
    const now = new Date().toISOString();
    await db.delete(schema.sessions).where(sql`${schema.sessions.expiresAt} < ${now}`);
  }

  // ─── Idempotency Keys (DB-backed) ───
  async storeIdempotencyKey(key: string, response: string, statusCode: number, expiresAt: string): Promise<void> {
    await db.insert(schema.idempotencyKeys).values({
      key,
      response,
      statusCode,
      createdAt: new Date().toISOString(),
      expiresAt,
    }).onConflictDoUpdate({
      target: schema.idempotencyKeys.key,
      set: { response, statusCode, expiresAt },
    });
  }
  async getIdempotencyKey(key: string): Promise<{ response: string; statusCode: number } | null> {
    const [row] = await db.select().from(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.key, key));
    if (!row) return null;
    if (new Date(row.expiresAt) < new Date()) {
      await db.delete(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.key, key));
      return null;
    }
    return { response: row.response, statusCode: row.statusCode };
  }
  async deleteExpiredIdempotencyKeys(): Promise<void> {
    const now = new Date().toISOString();
    await db.delete(schema.idempotencyKeys).where(sql`${schema.idempotencyKeys.expiresAt} < ${now}`);
  }

  // ─── Stripe Webhook Events ───
  async recordStripeEvent(eventId: string, type: string): Promise<boolean> {
    try {
      const result = await db.insert(schema.stripeProcessedEvents).values({
        eventId,
        type,
        processedAt: new Date().toISOString(),
      }).onConflictDoNothing().returning();
      return result.length > 0;
    } catch {
      return false;
    }
  }
  async deleteStripeEvent(eventId: string): Promise<void> {
    await db.delete(schema.stripeProcessedEvents).where(eq(schema.stripeProcessedEvents.eventId, eventId));
  }

  // ─── Promo Usage ───
  async recordPromoUsage(promoId: number, userId: number, orderId: number): Promise<void> {
    await db.insert(schema.promoUsage).values({
      promoId,
      userId,
      orderId,
      usedAt: new Date().toISOString(),
    });
  }
  async getPromoUsageByUser(promoId: number, userId: number): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.promoUsage)
      .where(and(eq(schema.promoUsage.promoId, promoId), eq(schema.promoUsage.userId, userId)));
    return Number(result?.count) || 0;
  }
  async deletePromoUsageByOrder(orderId: number): Promise<void> {
    await db.delete(schema.promoUsage).where(eq(schema.promoUsage.orderId, orderId));
  }

  // ─── Password Reset Tokens ───
  async createPasswordResetToken(userId: number, token: string, expiresAt: string): Promise<void> {
    await db.insert(schema.passwordResetTokens).values({
      userId,
      token,
      expiresAt,
      createdAt: new Date().toISOString(),
    });
  }
  async getPasswordResetToken(token: string): Promise<{ userId: number; token: string; expiresAt: string; usedAt: string | null } | undefined> {
    const [row] = await db.select().from(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.token, token));
    return row as any;
  }
  async markPasswordResetTokenUsed(token: string): Promise<void> {
    await db.update(schema.passwordResetTokens)
      .set({ usedAt: new Date().toISOString() })
      .where(eq(schema.passwordResetTokens.token, token));
  }
  async cleanExpiredResetTokens(): Promise<void> {
    const now = new Date().toISOString();
    await db.delete(schema.passwordResetTokens).where(sql`${schema.passwordResetTokens.expiresAt} < ${now}`);
  }

  // ─── Notification Rules ───
  async getNotificationRules(): Promise<schema.NotificationRule[]> {
    return db.select().from(schema.notificationRules).orderBy(desc(schema.notificationRules.id));
  }
  async getNotificationRule(id: number): Promise<schema.NotificationRule | undefined> {
    const [row] = await db.select().from(schema.notificationRules).where(eq(schema.notificationRules.id, id));
    return row;
  }
  async getNotificationRulesByTrigger(trigger: string): Promise<schema.NotificationRule[]> {
    return db.select().from(schema.notificationRules).where(
      and(eq(schema.notificationRules.trigger, trigger), eq(schema.notificationRules.isActive, 1))
    );
  }
  async createNotificationRule(input: schema.InsertNotificationRule): Promise<schema.NotificationRule> {
    const now = new Date().toISOString();
    const [row] = await db.insert(schema.notificationRules).values({
      ...input,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return row;
  }
  async updateNotificationRule(id: number, patch: Partial<schema.InsertNotificationRule>): Promise<schema.NotificationRule | undefined> {
    const [row] = await db.update(schema.notificationRules)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(schema.notificationRules.id, id))
      .returning();
    return row;
  }
  async deleteNotificationRule(id: number): Promise<boolean> {
    const result = await db.delete(schema.notificationRules).where(eq(schema.notificationRules.id, id));
    return (result.rowCount ?? 0) > 0;
  }
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
