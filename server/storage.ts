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

export interface IStorage {
  // Users
  getUser(id: number): Promise<schema.User | undefined>;
  getUserByUsername(username: string): Promise<schema.User | undefined>;
  getUserByEmail(email: string): Promise<schema.User | undefined>;
  getUsersByRole(role: string): Promise<schema.User[]>;
  createUser(data: schema.InsertUser): Promise<schema.User>;
  updateUser(id: number, data: Partial<schema.InsertUser>): Promise<schema.User | undefined>;
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
  createChatSession(data: schema.InsertChatSession): Promise<schema.ChatSession>;
  updateChatSession(id: number, data: Partial<schema.InsertChatSession>): Promise<schema.ChatSession | undefined>;
  // Vendor Payouts
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
    const [row] = await db.insert(schema.users).values(data).returning();
    return row;
  }
  async updateUser(id: number, data: Partial<schema.InsertUser>) {
    const [row] = await db.update(schema.users).set(data).where(eq(schema.users.id, id)).returning();
    return row;
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
    const [row] = await db.insert(schema.vendors).values(data).returning();
    return row;
  }
  async updateVendor(id: number, data: Partial<schema.InsertVendor>) {
    const [row] = await db.update(schema.vendors).set(data).where(eq(schema.vendors.id, id)).returning();
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
    const [row] = await db.insert(schema.drivers).values(data).returning();
    return row;
  }
  async updateDriver(id: number, data: Partial<schema.InsertDriver>) {
    const [row] = await db.update(schema.drivers).set(data).where(eq(schema.drivers.id, id)).returning();
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
    const [row] = await db.insert(schema.serviceTypes).values(data).returning();
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
    const [row] = await db.insert(schema.orders).values(data).returning();
    return row;
  }
  async updateOrder(id: number, data: Partial<schema.InsertOrder>) {
    const [row] = await db.update(schema.orders).set(data).where(eq(schema.orders.id, id)).returning();
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
    const [row] = await db.insert(schema.consentRecords).values(data).returning();
    return row;
  }
  async updateConsent(id: number, data: Partial<schema.InsertConsent>) {
    const [row] = await db.update(schema.consentRecords).set(data).where(eq(schema.consentRecords.id, id)).returning();
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
    const [row] = await db.insert(schema.disputes).values(data).returning();
    return row;
  }
  async updateDispute(id: number, data: Partial<schema.InsertDispute>) {
    const [row] = await db.update(schema.disputes).set(data).where(eq(schema.disputes.id, id)).returning();
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
    const [row] = await db.insert(schema.promoCodes).values(data).returning();
    return row;
  }
  async updatePromoCode(id: number, data: Partial<schema.InsertPromoCode>) {
    const [row] = await db.update(schema.promoCodes).set(data).where(eq(schema.promoCodes.id, id)).returning();
    return row;
  }

  // ─── Referrals ───
  async getReferralsByUser(userId: number) {
    return db.select().from(schema.referrals).where(
      or(eq(schema.referrals.referrerId, userId), eq(schema.referrals.refereeId, userId))
    );
  }
  async createReferral(data: schema.InsertReferral) {
    const [row] = await db.insert(schema.referrals).values(data).returning();
    return row;
  }
  async updateReferral(id: number, data: Partial<schema.InsertReferral>) {
    const [row] = await db.update(schema.referrals).set(data).where(eq(schema.referrals.id, id)).returning();
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
  async createChatSession(data: schema.InsertChatSession) {
    const [row] = await db.insert(schema.chatSessions).values(data).returning();
    return row;
  }
  async updateChatSession(id: number, data: Partial<schema.InsertChatSession>) {
    const [row] = await db.update(schema.chatSessions).set(data).where(eq(schema.chatSessions.id, id)).returning();
    return row;
  }

  // ─── Vendor Payouts ───
  async getVendorPayouts(vendorId: number) {
    return db.select().from(schema.vendorPayouts).where(eq(schema.vendorPayouts.vendorId, vendorId))
      .orderBy(desc(schema.vendorPayouts.createdAt));
  }
  async createVendorPayout(data: schema.InsertVendorPayout) {
    const [row] = await db.insert(schema.vendorPayouts).values(data).returning();
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
    const [row] = await db.insert(schema.pricingTiers).values(data).returning();
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
    const [row] = await db.insert(schema.addOns).values(data).returning();
    return row;
  }
  async updateAddOn(id: number, data: Partial<schema.InsertAddOn>) {
    const [row] = await db.update(schema.addOns).set(data).where(eq(schema.addOns.id, id)).returning();
    return row;
  }
  async deleteAddOn(id: number): Promise<boolean> {
    const result = await db.delete(schema.addOns).where(eq(schema.addOns.id, id)).returning();
    return result.length > 0;
  }

  // ─── Order Add-Ons ───
  async getOrderAddOns(orderId: number) { return db.select().from(schema.orderAddOns).where(eq(schema.orderAddOns.orderId, orderId)); }
  async createOrderAddOn(data: schema.InsertOrderAddOn) {
    const [row] = await db.insert(schema.orderAddOns).values(data).returning();
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
    const [row] = await db.insert(schema.paymentTransactions).values(data).returning();
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
    const [row] = await db.insert(schema.quotes).values(data).returning();
    return row;
  }
  async updateQuote(id: number, data: Partial<schema.InsertQuote>) {
    const [row] = await db.update(schema.quotes).set(data).where(eq(schema.quotes.id, id)).returning();
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
