import * as schema from "@shared/schema";

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
  transitionOrderStatus(orderId: number, fromStatus: string, toStatus: string, eventData: schema.InsertOrderEvent & { orderUpdate?: Partial<schema.InsertOrder>; vendorUpdate?: { id: number; data: Partial<schema.InsertVendor> }; driverUpdate?: { id: number; data: Partial<schema.InsertDriver> } }): Promise<schema.Order>;
  // Order Events
  getOrderEvents(orderId: number): Promise<schema.OrderEvent[]>;
  createOrderEvent(data: schema.InsertOrderEvent): Promise<schema.OrderEvent>;
  // Payment Methods
  getPaymentMethodsByUser(userId: number): Promise<schema.PaymentMethod[]>;
  getPaymentMethod(id: number): Promise<schema.PaymentMethod | undefined>;
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
  getQuoteByPublicToken(token: string): Promise<schema.Quote | undefined>;
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
