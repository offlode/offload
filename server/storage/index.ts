import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import type { IStorage } from "./interface";
import { createUserMethods } from "./users";
import { createOrderMethods } from "./orders";
import { createEntityMethods } from "./entities";
import { ensureExtraTables, ensureIntegrityConstraints } from "./migrations";

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

ensureExtraTables(pool).catch((err) => {
  console.error("[storage] ensureExtraTables error:", err);
});

// Export a promise that bootstrap can await before running queries that need new columns/tables.
export const integrityReady = ensureIntegrityConstraints(pool).catch((err) => {
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
