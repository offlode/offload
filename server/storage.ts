import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, or, sql, like } from "drizzle-orm";
import * as schema from "@shared/schema";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema });

export interface IStorage {
  // Users
  getUser(id: number): schema.User | undefined;
  getUserByUsername(username: string): schema.User | undefined;
  getUserByEmail(email: string): schema.User | undefined;
  getUsersByRole(role: string): schema.User[];
  createUser(data: schema.InsertUser): schema.User;
  updateUser(id: number, data: Partial<schema.InsertUser>): schema.User | undefined;
  searchUsers(query: string): schema.User[];
  // Addresses
  getAddress(id: number): schema.Address | undefined;
  getAddressesByUser(userId: number): schema.Address[];
  createAddress(data: schema.InsertAddress): schema.Address;
  updateAddress(id: number, data: Partial<schema.InsertAddress>): schema.Address | undefined;
  deleteAddress(id: number): void;
  // Vendors
  getVendors(): schema.Vendor[];
  getVendor(id: number): schema.Vendor | undefined;
  getActiveVendors(): schema.Vendor[];
  createVendor(data: schema.InsertVendor): schema.Vendor;
  updateVendor(id: number, data: Partial<schema.InsertVendor>): schema.Vendor | undefined;
  getVendorStats(id: number): any;
  // Drivers
  getDrivers(): schema.Driver[];
  getDriver(id: number): schema.Driver | undefined;
  getDriverByUserId(userId: number): schema.Driver | undefined;
  getAvailableDrivers(): schema.Driver[];
  createDriver(data: schema.InsertDriver): schema.Driver;
  updateDriver(id: number, data: Partial<schema.InsertDriver>): schema.Driver | undefined;
  getDriverStats(id: number): any;
  // Service Types
  getServiceTypes(): schema.ServiceType[];
  createServiceType(data: schema.InsertServiceType): schema.ServiceType;
  // Orders
  getOrders(): schema.Order[];
  getOrder(id: number): schema.Order | undefined;
  getActiveOrders(): schema.Order[];
  getOrdersByCustomer(customerId: number): schema.Order[];
  getOrdersByVendor(vendorId: number): schema.Order[];
  getOrdersByDriver(driverId: number): schema.Order[];
  getOrdersByStatus(status: string): schema.Order[];
  createOrder(data: schema.InsertOrder): schema.Order;
  updateOrder(id: number, data: Partial<schema.InsertOrder>): schema.Order | undefined;
  // Order Events
  getOrderEvents(orderId: number): schema.OrderEvent[];
  createOrderEvent(data: schema.InsertOrderEvent): schema.OrderEvent;
  // Payment Methods
  getPaymentMethodsByUser(userId: number): schema.PaymentMethod[];
  createPaymentMethod(data: schema.InsertPaymentMethod): schema.PaymentMethod;
  updatePaymentMethod(id: number, data: Partial<schema.InsertPaymentMethod>): schema.PaymentMethod | undefined;
  deletePaymentMethod(id: number): void;
  // Consents
  getConsentsByOrder(orderId: number): schema.ConsentRecord[];
  getConsent(id: number): schema.ConsentRecord | undefined;
  getPendingConsents(): schema.ConsentRecord[];
  createConsent(data: schema.InsertConsent): schema.ConsentRecord;
  updateConsent(id: number, data: Partial<schema.InsertConsent>): schema.ConsentRecord | undefined;
  // Messages
  getMessagesByOrder(orderId: number): schema.Message[];
  getMessagesByConversation(conversationId: string): schema.Message[];
  createMessage(data: schema.InsertMessage): schema.Message;
  // Disputes
  getDisputes(): schema.Dispute[];
  getDispute(id: number): schema.Dispute | undefined;
  createDispute(data: schema.InsertDispute): schema.Dispute;
  updateDispute(id: number, data: Partial<schema.InsertDispute>): schema.Dispute | undefined;
  // Reviews
  getReviews(): schema.Review[];
  getReviewByOrder(orderId: number): schema.Review | undefined;
  getReviewsByVendor(vendorId: number): schema.Review[];
  getReviewsByDriver(driverId: number): schema.Review[];
  createReview(data: schema.InsertReview): schema.Review;
  // Notifications
  getNotificationsByUser(userId: number): schema.Notification[];
  getUnreadCount(userId: number): number;
  createNotification(data: schema.InsertNotification): schema.Notification;
  markNotificationRead(id: number): schema.Notification | undefined;
  markAllRead(userId: number): void;
  // Promo Codes
  getPromoCode(code: string): schema.PromoCode | undefined;
  getPromoCodes(): schema.PromoCode[];
  createPromoCode(data: schema.InsertPromoCode): schema.PromoCode;
  updatePromoCode(id: number, data: Partial<schema.InsertPromoCode>): schema.PromoCode | undefined;
  // Referrals
  getReferralsByUser(userId: number): schema.Referral[];
  createReferral(data: schema.InsertReferral): schema.Referral;
  updateReferral(id: number, data: Partial<schema.InsertReferral>): schema.Referral | undefined;
  // Loyalty
  getLoyaltyTransactions(userId: number): schema.LoyaltyTransaction[];
  createLoyaltyTransaction(data: schema.InsertLoyaltyTransaction): schema.LoyaltyTransaction;
  // Chat Sessions
  getChatSessions(userId: number): schema.ChatSession[];
  getChatSession(id: number): schema.ChatSession | undefined;
  createChatSession(data: schema.InsertChatSession): schema.ChatSession;
  updateChatSession(id: number, data: Partial<schema.InsertChatSession>): schema.ChatSession | undefined;
  // Vendor Payouts
  getVendorPayouts(vendorId: number): schema.VendorPayout[];
  createVendorPayout(data: schema.InsertVendorPayout): schema.VendorPayout;
  updateVendorPayout(id: number, data: Partial<schema.InsertVendorPayout>): schema.VendorPayout | undefined;
  // Pricing Tiers
  getPricingTiers(): schema.PricingTier[];
  getPricingTier(id: number): schema.PricingTier | undefined;
  getPricingTierByName(name: string): schema.PricingTier | undefined;
  createPricingTier(data: schema.InsertPricingTier): schema.PricingTier;
  // Add-Ons
  getAddOns(): schema.AddOn[];
  getAddOn(id: number): schema.AddOn | undefined;
  createAddOn(data: schema.InsertAddOn): schema.AddOn;
  // Order Add-Ons
  getOrderAddOns(orderId: number): schema.OrderAddOn[];
  createOrderAddOn(data: schema.InsertOrderAddOn): schema.OrderAddOn;
  // Payment Transactions
  getPaymentTransactionsByOrder(orderId: number): schema.PaymentTransaction[];
  createPaymentTransaction(data: schema.InsertPaymentTransaction): schema.PaymentTransaction;
  updatePaymentTransaction(id: number, data: Partial<schema.InsertPaymentTransaction>): schema.PaymentTransaction | undefined;
  // Stripe Accounts
  getStripeAccount(userId: number): schema.StripeAccount | undefined;
  createStripeAccount(data: schema.InsertStripeAccount): schema.StripeAccount;
  updateStripeAccount(id: number, data: Partial<schema.InsertStripeAccount>): schema.StripeAccount | undefined;
  // Order Status History
  getOrderStatusHistory(orderId: number): schema.OrderStatusHistory[];
  createOrderStatusHistory(data: schema.InsertOrderStatusHistory): schema.OrderStatusHistory;
  // Message helpers
  getMessagesBySender(senderId: number): schema.Message[];
  getConversationsForUser(userId: number): schema.Message[];
  getMessage(id: number): schema.Message | undefined;
  markMessageRead(id: number): schema.Message | undefined;
  // Driver Location History
  createDriverLocationHistory(data: schema.InsertDriverLocationHistory): schema.DriverLocationHistory;
  getDriverLocationHistory(driverId: number, limit?: number): schema.DriverLocationHistory[];
  // Order Photos
  createOrderPhoto(data: schema.InsertOrderPhoto): schema.OrderPhoto;
  getOrderPhotos(orderId: number): schema.OrderPhoto[];
  getOrderPhotosByType(orderId: number, type: string): schema.OrderPhoto[];
  getPhotosByOrder(orderId: number): schema.OrderPhoto[];
  // Notification helpers
  deleteNotification(id: number): void;
  getNotificationsByCategory(userId: number, category: string): schema.Notification[];
  // Quotes
  getQuote(id: number): schema.Quote | undefined;
  getQuoteByNumber(quoteNumber: string): schema.Quote | undefined;
  getQuoteByIdempotencyKey(key: string): schema.Quote | undefined;
  getQuotesByCustomer(customerId: number): schema.Quote[];
  getQuotesBySession(sessionId: string): schema.Quote[];
  createQuote(data: schema.InsertQuote): schema.Quote;
  updateQuote(id: number, data: Partial<schema.InsertQuote>): schema.Quote | undefined;
  expireStaleQuotes(): number;
  // Pricing Config
  getPricingConfig(key: string): schema.PricingConfig | undefined;
  getAllPricingConfig(): schema.PricingConfig[];
  getPricingConfigByCategory(category: string): schema.PricingConfig[];
  upsertPricingConfig(key: string, value: string, category: string, description?: string, updatedBy?: number): schema.PricingConfig;
  // Pricing Audit
  createPricingAuditEntry(data: schema.InsertPricingAuditLog): schema.PricingAuditLog;
  getPricingAuditLog(limit?: number): schema.PricingAuditLog[];
  // Stats
  getCustomerStats(id: number): any;
  // Sessions (DB-backed)
  createSession(token: string, userId: number, role: string, expiresAt: string): void;
  getSession(token: string): { userId: number; role: string; expiresAt: string } | null;
  deleteSession(token: string): void;
  deleteSessionsByUser(userId: number): void;
  deleteExpiredSessions(): void;
  // Idempotency Keys (DB-backed)
  storeIdempotencyKey(key: string, response: string, statusCode: number, expiresAt: string): void;
  getIdempotencyKey(key: string): { response: string; statusCode: number } | null;
  deleteExpiredIdempotencyKeys(): void;
  // Promo Usage
  recordPromoUsage(promoId: number, userId: number, orderId: number): void;
  getPromoUsageByUser(promoId: number, userId: number): number;
  deletePromoUsageByOrder(orderId: number): void;
  // Password Reset Tokens
  createPasswordResetToken(userId: number, token: string, expiresAt: string): any;
  getPasswordResetToken(token: string): any | undefined;
  markPasswordResetTokenUsed(token: string): void;
  cleanExpiredResetTokens(): void;
}

class DatabaseStorage implements IStorage {
  // ─── Users ───
  getUser(id: number) { return db.select().from(schema.users).where(eq(schema.users.id, id)).get(); }
  getUserByUsername(username: string) { return db.select().from(schema.users).where(eq(schema.users.username, username)).get(); }
  getUserByEmail(email: string) { return db.select().from(schema.users).where(eq(schema.users.email, email)).get(); }
  getUsersByRole(role: string) { return db.select().from(schema.users).where(eq(schema.users.role, role)).all(); }
  createUser(data: schema.InsertUser) { return db.insert(schema.users).values(data).returning().get(); }
  updateUser(id: number, data: Partial<schema.InsertUser>) {
    return db.update(schema.users).set(data).where(eq(schema.users.id, id)).returning().get();
  }
  searchUsers(query: string) {
    return db.select().from(schema.users).where(
      or(like(schema.users.name, `%${query}%`), like(schema.users.email, `%${query}%`))
    ).all();
  }

  // ─── Addresses ───
  getAddress(id: number) { return db.select().from(schema.addresses).where(eq(schema.addresses.id, id)).get(); }
  getAddressesByUser(userId: number) { return db.select().from(schema.addresses).where(eq(schema.addresses.userId, userId)).all(); }
  createAddress(data: schema.InsertAddress) { return db.insert(schema.addresses).values(data).returning().get(); }
  updateAddress(id: number, data: Partial<schema.InsertAddress>) {
    return db.update(schema.addresses).set(data).where(eq(schema.addresses.id, id)).returning().get();
  }
  deleteAddress(id: number) { db.delete(schema.addresses).where(eq(schema.addresses.id, id)).run(); }

  // ─── Vendors ───
  getVendors() { return db.select().from(schema.vendors).all(); }
  getVendor(id: number) { return db.select().from(schema.vendors).where(eq(schema.vendors.id, id)).get(); }
  getActiveVendors() { return db.select().from(schema.vendors).where(eq(schema.vendors.status, "active")).all(); }
  createVendor(data: schema.InsertVendor) { return db.insert(schema.vendors).values(data).returning().get(); }
  updateVendor(id: number, data: Partial<schema.InsertVendor>) {
    return db.update(schema.vendors).set(data).where(eq(schema.vendors.id, id)).returning().get();
  }
  getVendorStats(id: number) {
    const orders = db.select().from(schema.orders).where(eq(schema.orders.vendorId, id)).all();
    const reviews = db.select().from(schema.reviews).where(eq(schema.reviews.vendorId, id)).all();
    const delivered = orders.filter(o => o.status === "delivered");
    return {
      totalOrders: orders.length, completedOrders: delivered.length,
      activeOrders: orders.filter(o => !["delivered","cancelled"].includes(o.status)).length,
      avgRating: reviews.length ? reviews.reduce((s, r) => s + (r.vendorRating || r.overallRating), 0) / reviews.length : 0,
      totalRevenue: delivered.reduce((s, o) => s + (o.total || 0), 0),
    };
  }

  // ─── Drivers ───
  getDrivers() { return db.select().from(schema.drivers).all(); }
  getDriver(id: number) { return db.select().from(schema.drivers).where(eq(schema.drivers.id, id)).get(); }
  getDriverByUserId(userId: number) { return db.select().from(schema.drivers).where(eq(schema.drivers.userId, userId)).get(); }
  getAvailableDrivers() { return db.select().from(schema.drivers).where(eq(schema.drivers.status, "available")).all(); }
  createDriver(data: schema.InsertDriver) { return db.insert(schema.drivers).values(data).returning().get(); }
  updateDriver(id: number, data: Partial<schema.InsertDriver>) {
    return db.update(schema.drivers).set(data).where(eq(schema.drivers.id, id)).returning().get();
  }
  getDriverStats(id: number) {
    const orders = db.select().from(schema.orders).where(eq(schema.orders.driverId, id)).all();
    const reviews = db.select().from(schema.reviews).where(eq(schema.reviews.driverId, id)).all();
    return {
      totalOrders: orders.length,
      completedOrders: orders.filter(o => o.status === "delivered").length,
      avgRating: reviews.length ? reviews.reduce((s, r) => s + (r.driverRating || r.overallRating), 0) / reviews.length : 0,
    };
  }

  // ─── Service Types ───
  getServiceTypes() { return db.select().from(schema.serviceTypes).orderBy(schema.serviceTypes.sortOrder).all(); }
  createServiceType(data: schema.InsertServiceType) { return db.insert(schema.serviceTypes).values(data).returning().get(); }

  // ─── Orders ───
  getOrders() { return db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)).all(); }
  getOrder(id: number) { return db.select().from(schema.orders).where(eq(schema.orders.id, id)).get(); }
  getActiveOrders() {
    return db.select().from(schema.orders).where(
      and(
        sql`${schema.orders.status} NOT IN ('delivered', 'cancelled')`,
      )
    ).all();
  }
  getOrdersByCustomer(customerId: number) {
    return db.select().from(schema.orders).where(eq(schema.orders.customerId, customerId)).orderBy(desc(schema.orders.createdAt)).all();
  }
  getOrdersByVendor(vendorId: number) {
    return db.select().from(schema.orders).where(eq(schema.orders.vendorId, vendorId)).orderBy(desc(schema.orders.createdAt)).all();
  }
  getOrdersByDriver(driverId: number) {
    return db.select().from(schema.orders).where(
      or(eq(schema.orders.driverId, driverId), eq(schema.orders.returnDriverId, driverId))
    ).orderBy(desc(schema.orders.createdAt)).all();
  }
  getOrdersByStatus(status: string) {
    return db.select().from(schema.orders).where(eq(schema.orders.status, status)).all();
  }
  createOrder(data: schema.InsertOrder) { return db.insert(schema.orders).values(data).returning().get(); }
  updateOrder(id: number, data: Partial<schema.InsertOrder>) {
    return db.update(schema.orders).set(data).where(eq(schema.orders.id, id)).returning().get();
  }

  // ─── Order Events ───
  getOrderEvents(orderId: number) {
    return db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, orderId)).orderBy(schema.orderEvents.timestamp).all();
  }
  createOrderEvent(data: schema.InsertOrderEvent) { return db.insert(schema.orderEvents).values(data).returning().get(); }

  // ─── Payment Methods ───
  getPaymentMethodsByUser(userId: number) { return db.select().from(schema.paymentMethods).where(eq(schema.paymentMethods.userId, userId)).all(); }
  createPaymentMethod(data: schema.InsertPaymentMethod) { return db.insert(schema.paymentMethods).values(data).returning().get(); }
  updatePaymentMethod(id: number, data: Partial<schema.InsertPaymentMethod>) {
    return db.update(schema.paymentMethods).set(data).where(eq(schema.paymentMethods.id, id)).returning().get();
  }
  deletePaymentMethod(id: number) { db.delete(schema.paymentMethods).where(eq(schema.paymentMethods.id, id)).run(); }

  // ─── Consents ───
  getConsentsByOrder(orderId: number) { return db.select().from(schema.consentRecords).where(eq(schema.consentRecords.orderId, orderId)).all(); }
  getConsent(id: number) { return db.select().from(schema.consentRecords).where(eq(schema.consentRecords.id, id)).get(); }
  getPendingConsents() { return db.select().from(schema.consentRecords).where(eq(schema.consentRecords.status, "pending")).all(); }
  createConsent(data: schema.InsertConsent) { return db.insert(schema.consentRecords).values(data).returning().get(); }
  updateConsent(id: number, data: Partial<schema.InsertConsent>) {
    return db.update(schema.consentRecords).set(data).where(eq(schema.consentRecords.id, id)).returning().get();
  }

  // ─── Messages ───
  getMessagesByOrder(orderId: number) {
    return db.select().from(schema.messages).where(eq(schema.messages.orderId, orderId)).orderBy(schema.messages.timestamp).all();
  }
  getMessagesByConversation(conversationId: string) {
    return db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(schema.messages.timestamp).all();
  }
  createMessage(data: schema.InsertMessage) { return db.insert(schema.messages).values(data).returning().get(); }

  // ─── Disputes ───
  getDisputes() { return db.select().from(schema.disputes).orderBy(desc(schema.disputes.createdAt)).all(); }
  getDispute(id: number) { return db.select().from(schema.disputes).where(eq(schema.disputes.id, id)).get(); }
  createDispute(data: schema.InsertDispute) { return db.insert(schema.disputes).values(data).returning().get(); }
  updateDispute(id: number, data: Partial<schema.InsertDispute>) {
    return db.update(schema.disputes).set(data).where(eq(schema.disputes.id, id)).returning().get();
  }

  // ─── Reviews ───
  getReviews() { return db.select().from(schema.reviews).orderBy(desc(schema.reviews.createdAt)).all(); }
  getReviewByOrder(orderId: number) { return db.select().from(schema.reviews).where(eq(schema.reviews.orderId, orderId)).get(); }
  getReviewsByVendor(vendorId: number) { return db.select().from(schema.reviews).where(eq(schema.reviews.vendorId, vendorId)).all(); }
  getReviewsByDriver(driverId: number) { return db.select().from(schema.reviews).where(eq(schema.reviews.driverId, driverId)).all(); }
  createReview(data: schema.InsertReview) { return db.insert(schema.reviews).values(data).returning().get(); }

  // ─── Notifications ───
  getNotificationsByUser(userId: number) {
    return db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(desc(schema.notifications.createdAt)).all();
  }
  getUnreadCount(userId: number) {
    const result = db.select({ count: sql<number>`count(*)` }).from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.read, 0))).get();
    return result?.count || 0;
  }
  createNotification(data: schema.InsertNotification) { return db.insert(schema.notifications).values(data).returning().get(); }
  markNotificationRead(id: number) {
    return db.update(schema.notifications).set({ read: 1 }).where(eq(schema.notifications.id, id)).returning().get();
  }
  markAllRead(userId: number) {
    db.update(schema.notifications).set({ read: 1 }).where(eq(schema.notifications.userId, userId)).run();
  }

  // ─── Promo Codes ───
  getPromoCode(code: string) { return db.select().from(schema.promoCodes).where(eq(schema.promoCodes.code, code)).get(); }
  getPromoCodes() { return db.select().from(schema.promoCodes).all(); }
  createPromoCode(data: schema.InsertPromoCode) { return db.insert(schema.promoCodes).values(data).returning().get(); }
  updatePromoCode(id: number, data: Partial<schema.InsertPromoCode>) {
    return db.update(schema.promoCodes).set(data).where(eq(schema.promoCodes.id, id)).returning().get();
  }

  // ─── Referrals ───
  getReferralsByUser(userId: number) {
    return db.select().from(schema.referrals).where(
      or(eq(schema.referrals.referrerId, userId), eq(schema.referrals.refereeId, userId))
    ).all();
  }
  createReferral(data: schema.InsertReferral) { return db.insert(schema.referrals).values(data).returning().get(); }
  updateReferral(id: number, data: Partial<schema.InsertReferral>) {
    return db.update(schema.referrals).set(data).where(eq(schema.referrals.id, id)).returning().get();
  }

  // ─── Loyalty Transactions ───
  getLoyaltyTransactions(userId: number) {
    return db.select().from(schema.loyaltyTransactions).where(eq(schema.loyaltyTransactions.userId, userId))
      .orderBy(desc(schema.loyaltyTransactions.createdAt)).all();
  }
  createLoyaltyTransaction(data: schema.InsertLoyaltyTransaction) {
    return db.insert(schema.loyaltyTransactions).values(data).returning().get();
  }

  // ─── Chat Sessions ───
  getChatSessions(userId: number) {
    return db.select().from(schema.chatSessions).where(eq(schema.chatSessions.userId, userId))
      .orderBy(desc(schema.chatSessions.createdAt)).all();
  }
  getChatSession(id: number) { return db.select().from(schema.chatSessions).where(eq(schema.chatSessions.id, id)).get(); }
  createChatSession(data: schema.InsertChatSession) { return db.insert(schema.chatSessions).values(data).returning().get(); }
  updateChatSession(id: number, data: Partial<schema.InsertChatSession>) {
    return db.update(schema.chatSessions).set(data).where(eq(schema.chatSessions.id, id)).returning().get();
  }

  // ─── Vendor Payouts ───
  getVendorPayouts(vendorId: number) {
    return db.select().from(schema.vendorPayouts).where(eq(schema.vendorPayouts.vendorId, vendorId))
      .orderBy(desc(schema.vendorPayouts.createdAt)).all();
  }
  createVendorPayout(data: schema.InsertVendorPayout) { return db.insert(schema.vendorPayouts).values(data).returning().get(); }
  updateVendorPayout(id: number, data: Partial<schema.InsertVendorPayout>) {
    return db.update(schema.vendorPayouts).set(data).where(eq(schema.vendorPayouts.id, id)).returning().get();
  }

  // ─── Pricing Tiers ───
  getPricingTiers() { return db.select().from(schema.pricingTiers).where(eq(schema.pricingTiers.isActive, 1)).orderBy(schema.pricingTiers.sortOrder).all(); }
  getPricingTier(id: number) { return db.select().from(schema.pricingTiers).where(eq(schema.pricingTiers.id, id)).get(); }
  getPricingTierByName(name: string) { return db.select().from(schema.pricingTiers).where(eq(schema.pricingTiers.name, name)).get(); }
  createPricingTier(data: schema.InsertPricingTier) { return db.insert(schema.pricingTiers).values(data).returning().get(); }

  // ─── Add-Ons ───
  getAddOns() { return db.select().from(schema.addOns).where(eq(schema.addOns.isActive, 1)).all(); }
  getAddOn(id: number) { return db.select().from(schema.addOns).where(eq(schema.addOns.id, id)).get(); }
  createAddOn(data: schema.InsertAddOn) { return db.insert(schema.addOns).values(data).returning().get(); }

  // ─── Order Add-Ons ───
  getOrderAddOns(orderId: number) { return db.select().from(schema.orderAddOns).where(eq(schema.orderAddOns.orderId, orderId)).all(); }
  createOrderAddOn(data: schema.InsertOrderAddOn) { return db.insert(schema.orderAddOns).values(data).returning().get(); }

  // ─── Payment Transactions ───
  getPaymentTransactionsByOrder(orderId: number) {
    return db.select().from(schema.paymentTransactions).where(eq(schema.paymentTransactions.orderId, orderId))
      .orderBy(desc(schema.paymentTransactions.createdAt)).all();
  }
  createPaymentTransaction(data: schema.InsertPaymentTransaction) {
    return db.insert(schema.paymentTransactions).values(data).returning().get();
  }
  updatePaymentTransaction(id: number, data: Partial<schema.InsertPaymentTransaction>) {
    return db.update(schema.paymentTransactions).set(data).where(eq(schema.paymentTransactions.id, id)).returning().get();
  }

  // ─── Stripe Accounts ───
  getStripeAccount(userId: number) {
    return db.select().from(schema.stripeAccounts).where(eq(schema.stripeAccounts.userId, userId)).get();
  }
  createStripeAccount(data: schema.InsertStripeAccount) {
    return db.insert(schema.stripeAccounts).values(data).returning().get();
  }
  updateStripeAccount(id: number, data: Partial<schema.InsertStripeAccount>) {
    return db.update(schema.stripeAccounts).set(data).where(eq(schema.stripeAccounts.id, id)).returning().get();
  }

  // ─── Order Status History ───
  getOrderStatusHistory(orderId: number) {
    return db.select().from(schema.orderStatusHistory).where(eq(schema.orderStatusHistory.orderId, orderId))
      .orderBy(schema.orderStatusHistory.timestamp).all();
  }
  createOrderStatusHistory(data: schema.InsertOrderStatusHistory) {
    return db.insert(schema.orderStatusHistory).values(data).returning().get();
  }

  // ─── Message Helpers ───
  getMessagesBySender(senderId: number) {
    return db.select().from(schema.messages).where(eq(schema.messages.senderId, senderId))
      .orderBy(desc(schema.messages.timestamp)).all();
  }
  getConversationsForUser(userId: number) {
    // Get the latest message per order for this user (as sender or related to their orders)
    return db.select().from(schema.messages).where(
      or(eq(schema.messages.senderId, userId))
    ).orderBy(desc(schema.messages.timestamp)).all();
  }
  getMessage(id: number) {
    return db.select().from(schema.messages).where(eq(schema.messages.id, id)).get();
  }

  markMessageRead(id: number) {
    return db.update(schema.messages).set({ readAt: new Date().toISOString() }).where(eq(schema.messages.id, id)).returning().get();
  }

  // ─── Driver Location History ───
  createDriverLocationHistory(data: schema.InsertDriverLocationHistory) {
    return db.insert(schema.driverLocationHistory).values(data).returning().get();
  }
  getDriverLocationHistory(driverId: number, limit = 100) {
    return db.select().from(schema.driverLocationHistory)
      .where(eq(schema.driverLocationHistory.driverId, driverId))
      .orderBy(desc(schema.driverLocationHistory.timestamp))
      .limit(limit)
      .all();
  }

  // ─── Order Photos ───
  createOrderPhoto(data: schema.InsertOrderPhoto) {
    return db.insert(schema.orderPhotos).values(data).returning().get();
  }
  getOrderPhotos(orderId: number) {
    return db.select().from(schema.orderPhotos)
      .where(eq(schema.orderPhotos.orderId, orderId))
      .orderBy(schema.orderPhotos.timestamp)
      .all();
  }
  getOrderPhotosByType(orderId: number, type: string) {
    return db.select().from(schema.orderPhotos)
      .where(and(eq(schema.orderPhotos.orderId, orderId), eq(schema.orderPhotos.type, type)))
      .orderBy(schema.orderPhotos.timestamp)
      .all();
  }
  getPhotosByOrder(orderId: number) {
    return db.select().from(schema.orderPhotos)
      .where(eq(schema.orderPhotos.orderId, orderId))
      .all();
  }

  // ─── Notification Helpers ───
  deleteNotification(id: number) {
    db.delete(schema.notifications).where(eq(schema.notifications.id, id)).run();
  }
  getNotificationsByCategory(userId: number, category: string) {
    return db.select().from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.category, category)))
      .orderBy(desc(schema.notifications.createdAt))
      .all();
  }

  // ─── Quotes ───
  getQuote(id: number) { return db.select().from(schema.quotes).where(eq(schema.quotes.id, id)).get(); }
  getQuoteByNumber(quoteNumber: string) { return db.select().from(schema.quotes).where(eq(schema.quotes.quoteNumber, quoteNumber)).get(); }
  getQuoteByIdempotencyKey(key: string) { return db.select().from(schema.quotes).where(eq(schema.quotes.idempotencyKey, key)).get(); }
  getQuotesByCustomer(customerId: number) {
    return db.select().from(schema.quotes).where(eq(schema.quotes.customerId, customerId)).orderBy(desc(schema.quotes.createdAt)).all();
  }
  getQuotesBySession(sessionId: string) {
    return db.select().from(schema.quotes).where(eq(schema.quotes.sessionId, sessionId)).orderBy(desc(schema.quotes.createdAt)).all();
  }
  createQuote(data: schema.InsertQuote) { return db.insert(schema.quotes).values(data).returning().get(); }
  updateQuote(id: number, data: Partial<schema.InsertQuote>) {
    return db.update(schema.quotes).set(data).where(eq(schema.quotes.id, id)).returning().get();
  }
  expireStaleQuotes(): number {
    const now = new Date().toISOString();
    const result = db.update(schema.quotes)
      .set({ status: "expired", updatedAt: now })
      .where(and(
        or(eq(schema.quotes.status, "draft"), eq(schema.quotes.status, "quoted")),
        sql`${schema.quotes.expiresAt} < ${now}`
      ))
      .run();
    return result.changes;
  }

  // ─── Pricing Config ───
  getPricingConfig(key: string) { return db.select().from(schema.pricingConfig).where(eq(schema.pricingConfig.key, key)).get(); }
  getAllPricingConfig() { return db.select().from(schema.pricingConfig).all(); }
  getPricingConfigByCategory(category: string) {
    return db.select().from(schema.pricingConfig).where(eq(schema.pricingConfig.category, category)).all();
  }
  upsertPricingConfig(key: string, value: string, category: string, description?: string, updatedBy?: number) {
    const existing = this.getPricingConfig(key);
    if (existing) {
      return db.update(schema.pricingConfig)
        .set({ value, category, description: description ?? existing.description, updatedAt: new Date().toISOString(), updatedBy: updatedBy ?? existing.updatedBy })
        .where(eq(schema.pricingConfig.key, key))
        .returning().get();
    }
    return db.insert(schema.pricingConfig).values({
      key, value, category, description: description ?? null, updatedAt: new Date().toISOString(), updatedBy: updatedBy ?? null,
    }).returning().get();
  }

  // ─── Pricing Audit ───
  createPricingAuditEntry(data: schema.InsertPricingAuditLog) {
    return db.insert(schema.pricingAuditLog).values(data).returning().get();
  }
  getPricingAuditLog(limit = 100) {
    return db.select().from(schema.pricingAuditLog).orderBy(desc(schema.pricingAuditLog.timestamp)).limit(limit).all();
  }

  // ─── Customer Stats ───
  getCustomerStats(id: number) {
    const orders = db.select().from(schema.orders).where(eq(schema.orders.customerId, id)).all();
    const delivered = orders.filter(o => o.status === "delivered");
    const user = this.getUser(id);
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
  createSession(token: string, userId: number, role: string, expiresAt: string): void {
    db.insert(schema.sessions).values({
      token,
      userId,
      role,
      createdAt: new Date().toISOString(),
      expiresAt,
    }).run();
  }
  getSession(token: string): { userId: number; role: string; expiresAt: string } | null {
    const session = db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).get();
    if (!session) return null;
    if (new Date(session.expiresAt) < new Date()) {
      db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run();
      return null;
    }
    return { userId: session.userId, role: session.role, expiresAt: session.expiresAt };
  }
  deleteSession(token: string): void {
    db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run();
  }
  deleteSessionsByUser(userId: number): void {
    db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run();
  }
  deleteExpiredSessions(): void {
    const now = new Date().toISOString();
    db.delete(schema.sessions).where(sql`${schema.sessions.expiresAt} < ${now}`).run();
  }

  // ─── Idempotency Keys (DB-backed) ───
  storeIdempotencyKey(key: string, response: string, statusCode: number, expiresAt: string): void {
    db.insert(schema.idempotencyKeys).values({
      key,
      response,
      statusCode,
      createdAt: new Date().toISOString(),
      expiresAt,
    }).onConflictDoUpdate({
      target: schema.idempotencyKeys.key,
      set: { response, statusCode, expiresAt },
    }).run();
  }
  getIdempotencyKey(key: string): { response: string; statusCode: number } | null {
    const row = db.select().from(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.key, key)).get();
    if (!row) return null;
    if (new Date(row.expiresAt) < new Date()) {
      db.delete(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.key, key)).run();
      return null;
    }
    return { response: row.response, statusCode: row.statusCode };
  }
  deleteExpiredIdempotencyKeys(): void {
    const now = new Date().toISOString();
    db.delete(schema.idempotencyKeys).where(sql`${schema.idempotencyKeys.expiresAt} < ${now}`).run();
  }

  // ─── Promo Usage ───
  recordPromoUsage(promoId: number, userId: number, orderId: number): void {
    db.insert(schema.promoUsage).values({
      promoId,
      userId,
      orderId,
      usedAt: new Date().toISOString(),
    }).run();
  }
  getPromoUsageByUser(promoId: number, userId: number): number {
    const result = db.select({ count: sql<number>`count(*)` }).from(schema.promoUsage)
      .where(and(eq(schema.promoUsage.promoId, promoId), eq(schema.promoUsage.userId, userId))).get();
    return result?.count || 0;
  }
  deletePromoUsageByOrder(orderId: number): void {
    db.delete(schema.promoUsage).where(eq(schema.promoUsage.orderId, orderId)).run();
  }

  // ─── Password Reset Tokens ───
  createPasswordResetToken(userId: number, token: string, expiresAt: string) {
    return db.insert(schema.passwordResetTokens).values({
      userId,
      token,
      expiresAt,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }
  getPasswordResetToken(token: string) {
    return db.select().from(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.token, token)).get();
  }
  markPasswordResetTokenUsed(token: string): void {
    db.update(schema.passwordResetTokens)
      .set({ usedAt: new Date().toISOString() })
      .where(eq(schema.passwordResetTokens.token, token))
      .run();
  }
  cleanExpiredResetTokens(): void {
    const now = new Date().toISOString();
    db.delete(schema.passwordResetTokens).where(sql`${schema.passwordResetTokens.expiresAt} < ${now}`).run();
  }
}

export const storage = new DatabaseStorage();
