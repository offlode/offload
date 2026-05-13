import { eq, desc, and, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import {
  addVendorCents, addDriverCents, addServiceTypeCents,
  addPromoCents, addReferralCents, addPricingTierCents,
  addAddOnCents,
} from "./helpers";

type DB = NodePgDatabase<typeof schema>;

export function createEntityMethods(db: DB) {
  return {
    // ─── Vendors ───
    async getVendors() { return db.select().from(schema.vendors); },
    async getVendor(id: number) {
      const [row] = await db.select().from(schema.vendors).where(eq(schema.vendors.id, id));
      return row;
    },
    async getVendorByUserId(userId: number) {
      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
      if (user?.vendorId) {
        const [v] = await db.select().from(schema.vendors).where(eq(schema.vendors.id, user.vendorId));
        return v;
      }
      const [row] = await db.select().from(schema.vendors).where(eq(schema.vendors.email, user?.email || ""));
      return row;
    },
    async getActiveVendors() { return db.select().from(schema.vendors).where(eq(schema.vendors.status, "active")); },
    async createVendor(data: schema.InsertVendor) {
      const [row] = await db.insert(schema.vendors).values(addVendorCents(data)).returning();
      return row;
    },
    async updateVendor(id: number, data: Partial<schema.InsertVendor>) {
      const [row] = await db.update(schema.vendors).set(addVendorCents(data)).where(eq(schema.vendors.id, id)).returning();
      return row;
    },
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
    },

    // ─── Drivers ───
    async getDrivers() { return db.select().from(schema.drivers); },
    async getDriver(id: number) {
      const [row] = await db.select().from(schema.drivers).where(eq(schema.drivers.id, id));
      return row;
    },
    async getDriverByUserId(userId: number) {
      const [row] = await db.select().from(schema.drivers).where(eq(schema.drivers.userId, userId));
      return row;
    },
    async getAvailableDrivers() { return db.select().from(schema.drivers).where(eq(schema.drivers.status, "available")); },
    async createDriver(data: schema.InsertDriver) {
      const [row] = await db.insert(schema.drivers).values(addDriverCents(data)).returning();
      return row;
    },
    async updateDriver(id: number, data: Partial<schema.InsertDriver>) {
      const [row] = await db.update(schema.drivers).set(addDriverCents(data)).where(eq(schema.drivers.id, id)).returning();
      return row;
    },
    async getDriverStats(id: number) {
      const orders = await db.select().from(schema.orders).where(eq(schema.orders.driverId, id));
      const reviews = await db.select().from(schema.reviews).where(eq(schema.reviews.driverId, id));
      return {
        totalOrders: orders.length,
        completedOrders: orders.filter(o => o.status === "delivered").length,
        avgRating: reviews.length ? reviews.reduce((s, r) => s + (r.driverRating || r.overallRating), 0) / reviews.length : 0,
      };
    },

    // ─── Service Types ───
    async getServiceTypes() { return db.select().from(schema.serviceTypes).orderBy(schema.serviceTypes.sortOrder); },
    async createServiceType(data: schema.InsertServiceType) {
      const [row] = await db.insert(schema.serviceTypes).values(addServiceTypeCents(data)).returning();
      return row;
    },

    // ─── Messages ───
    async getMessagesByOrder(orderId: number) {
      return db.select().from(schema.messages).where(eq(schema.messages.orderId, orderId)).orderBy(schema.messages.timestamp);
    },
    async getMessagesByConversation(conversationId: string) {
      return db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(schema.messages.timestamp);
    },
    async createMessage(data: schema.InsertMessage) {
      const [row] = await db.insert(schema.messages).values(data).returning();
      return row;
    },
    async getMessagesBySender(senderId: number) {
      return db.select().from(schema.messages).where(eq(schema.messages.senderId, senderId))
        .orderBy(desc(schema.messages.timestamp));
    },
    async getConversationsForUser(userId: number) {
      return db.select().from(schema.messages).where(
        or(eq(schema.messages.senderId, userId))
      ).orderBy(desc(schema.messages.timestamp));
    },
    async getMessage(id: number) {
      const [row] = await db.select().from(schema.messages).where(eq(schema.messages.id, id));
      return row;
    },
    async markMessageRead(id: number) {
      const [row] = await db.update(schema.messages).set({ readAt: new Date().toISOString() }).where(eq(schema.messages.id, id)).returning();
      return row;
    },

    // ─── Partner Applications ───
    async getPartnerApplications(filter?: { applicantType?: string; status?: string }) {
      const conditions: any[] = [];
      if (filter?.applicantType) conditions.push(eq(schema.partnerApplications.applicantType, filter.applicantType));
      if (filter?.status) conditions.push(eq(schema.partnerApplications.status, filter.status));
      const q = conditions.length
        ? db.select().from(schema.partnerApplications).where(and(...conditions))
        : db.select().from(schema.partnerApplications);
      return q.orderBy(desc(schema.partnerApplications.createdAt));
    },
    async getPartnerApplication(id: number) {
      const [row] = await db.select().from(schema.partnerApplications).where(eq(schema.partnerApplications.id, id));
      return row;
    },
    async createPartnerApplication(data: any) {
      const [row] = await db.insert(schema.partnerApplications).values(data).returning();
      return row;
    },
    async updatePartnerApplication(id: number, patch: Partial<schema.PartnerApplication>) {
      const [row] = await db.update(schema.partnerApplications).set(patch).where(eq(schema.partnerApplications.id, id)).returning();
      return row;
    },

    // ─── Notifications ───
    async getNotificationsByUser(userId: number) {
      return db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(desc(schema.notifications.createdAt));
    },
    async getUnreadCount(userId: number) {
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.notifications)
        .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.read, false)));
      return Number(result?.count) || 0;
    },
    async getNotification(id: number) {
      const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id));
      return row;
    },
    async createNotification(data: schema.InsertNotification) {
      const [row] = await db.insert(schema.notifications).values(data).returning();
      return row;
    },
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
    },
    async deletePushToken(userId: number, token: string) {
      await db.delete(schema.pushTokens).where(and(eq(schema.pushTokens.userId, userId), eq(schema.pushTokens.token, token)));
    },
    async getPushTokensByUser(userId: number) {
      return db.select().from(schema.pushTokens).where(eq(schema.pushTokens.userId, userId));
    },
    async markNotificationRead(id: number) {
      const [row] = await db.update(schema.notifications).set({ read: true }).where(eq(schema.notifications.id, id)).returning();
      return row;
    },
    async markAllRead(userId: number) {
      await db.update(schema.notifications).set({ read: true }).where(eq(schema.notifications.userId, userId));
    },
    async deleteNotification(id: number) {
      await db.delete(schema.notifications).where(eq(schema.notifications.id, id));
    },
    async getNotificationsByCategory(userId: number, category: string) {
      return db.select().from(schema.notifications)
        .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.category, category)))
        .orderBy(desc(schema.notifications.createdAt));
    },

    // ─── Promo Codes ───
    async getPromoCode(code: string) {
      const [row] = await db.select().from(schema.promoCodes).where(eq(schema.promoCodes.code, code));
      return row;
    },
    async getPromoCodes() { return db.select().from(schema.promoCodes); },
    async createPromoCode(data: schema.InsertPromoCode) {
      const [row] = await db.insert(schema.promoCodes).values(addPromoCents(data)).returning();
      return row;
    },
    async updatePromoCode(id: number, data: Partial<schema.InsertPromoCode>) {
      const [row] = await db.update(schema.promoCodes).set(addPromoCents(data)).where(eq(schema.promoCodes.id, id)).returning();
      return row;
    },

    // ─── Referrals ───
    async getReferralsByUser(userId: number) {
      return db.select().from(schema.referrals).where(
        or(eq(schema.referrals.referrerId, userId), eq(schema.referrals.refereeId, userId))
      );
    },
    async createReferral(data: schema.InsertReferral) {
      const [row] = await db.insert(schema.referrals).values(addReferralCents(data)).returning();
      return row;
    },
    async updateReferral(id: number, data: Partial<schema.InsertReferral>) {
      const [row] = await db.update(schema.referrals).set(addReferralCents(data)).where(eq(schema.referrals.id, id)).returning();
      return row;
    },

    // ─── Loyalty Transactions ───
    async getLoyaltyTransactions(userId: number) {
      return db.select().from(schema.loyaltyTransactions).where(eq(schema.loyaltyTransactions.userId, userId))
        .orderBy(desc(schema.loyaltyTransactions.createdAt));
    },
    async createLoyaltyTransaction(data: schema.InsertLoyaltyTransaction) {
      const [row] = await db.insert(schema.loyaltyTransactions).values(data).returning();
      return row;
    },

    // ─── Chat Sessions ───
    async getChatSessions(userId: number) {
      return db.select().from(schema.chatSessions).where(eq(schema.chatSessions.userId, userId))
        .orderBy(desc(schema.chatSessions.createdAt));
    },
    async getChatSession(id: number) {
      const [row] = await db.select().from(schema.chatSessions).where(eq(schema.chatSessions.id, id));
      return row;
    },
    async getAllSupportSessions() {
      return db.select().from(schema.chatSessions)
        .where(or(
          eq(schema.chatSessions.status, "escalated"),
          eq(schema.chatSessions.status, "active"),
        ))
        .orderBy(desc(schema.chatSessions.createdAt));
    },
    async createChatSession(data: schema.InsertChatSession) {
      const [row] = await db.insert(schema.chatSessions).values(data).returning();
      return row;
    },
    async updateChatSession(id: number, data: Partial<schema.InsertChatSession>) {
      const [row] = await db.update(schema.chatSessions).set(data).where(eq(schema.chatSessions.id, id)).returning();
      return row;
    },

    // ─── Vendor Payouts ───
    async getVendorPayout(id: number) {
      const [row] = await db.select().from(schema.vendorPayouts).where(eq(schema.vendorPayouts.id, id));
      return row;
    },
    async getVendorPayouts(vendorId: number) {
      return db.select().from(schema.vendorPayouts).where(eq(schema.vendorPayouts.vendorId, vendorId))
        .orderBy(desc(schema.vendorPayouts.createdAt));
    },
    async createVendorPayout(data: schema.InsertVendorPayout) {
      const d = data as any;
      if (d.amount != null && d.amountCents == null) {
        (d as any).amountCents = Math.round(d.amount * 100);
      }
      const [row] = await db.insert(schema.vendorPayouts).values(d).returning();
      return row;
    },
    async updateVendorPayout(id: number, data: Partial<schema.InsertVendorPayout>) {
      const [row] = await db.update(schema.vendorPayouts).set(data).where(eq(schema.vendorPayouts.id, id)).returning();
      return row;
    },

    // ─── Pricing Tiers ───
    async getPricingTiers() { return db.select().from(schema.pricingTiers).where(eq(schema.pricingTiers.isActive, true)).orderBy(schema.pricingTiers.sortOrder); },
    async getPricingTier(id: number) {
      const [row] = await db.select().from(schema.pricingTiers).where(eq(schema.pricingTiers.id, id));
      return row;
    },
    async getPricingTierByName(name: string) {
      const [row] = await db.select().from(schema.pricingTiers).where(eq(schema.pricingTiers.name, name));
      return row;
    },
    async createPricingTier(data: schema.InsertPricingTier) {
      const [row] = await db.insert(schema.pricingTiers).values(addPricingTierCents(data)).returning();
      return row;
    },

    // ─── Add-Ons ───
    async getAddOns() { return db.select().from(schema.addOns).where(eq(schema.addOns.isActive, true)); },
    async getAllAddOns() { return db.select().from(schema.addOns).orderBy(schema.addOns.id); },
    async getAddOn(id: number) {
      const [row] = await db.select().from(schema.addOns).where(eq(schema.addOns.id, id));
      return row;
    },
    async createAddOn(data: schema.InsertAddOn) {
      const [row] = await db.insert(schema.addOns).values(addAddOnCents(data)).returning();
      return row;
    },
    async updateAddOn(id: number, data: Partial<schema.InsertAddOn>) {
      const [row] = await db.update(schema.addOns).set(addAddOnCents(data)).where(eq(schema.addOns.id, id)).returning();
      return row;
    },
    async deleteAddOn(id: number): Promise<boolean> {
      const result = await db.delete(schema.addOns).where(eq(schema.addOns.id, id)).returning();
      return result.length > 0;
    },

    // ─── Driver Location History ───
    async createDriverLocationHistory(data: schema.InsertDriverLocationHistory) {
      const [row] = await db.insert(schema.driverLocationHistory).values(data).returning();
      return row;
    },
    async getDriverLocationHistory(driverId: number, limit = 100) {
      return db.select().from(schema.driverLocationHistory)
        .where(eq(schema.driverLocationHistory.driverId, driverId))
        .orderBy(desc(schema.driverLocationHistory.timestamp))
        .limit(limit);
    },

    // ─── Pricing Config ───
    async getPricingConfig(key: string) {
      const [row] = await db.select().from(schema.pricingConfig).where(eq(schema.pricingConfig.key, key));
      return row;
    },
    async getAllPricingConfig() { return db.select().from(schema.pricingConfig); },
    async getPricingConfigByCategory(category: string) {
      return db.select().from(schema.pricingConfig).where(eq(schema.pricingConfig.category, category));
    },
    async upsertPricingConfig(key: string, value: string, category: string, description?: string, updatedBy?: number) {
      const [existing] = await db.select().from(schema.pricingConfig).where(eq(schema.pricingConfig.key, key));
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
    },

    // ─── Pricing Audit ───
    async createPricingAuditEntry(data: schema.InsertPricingAuditLog) {
      const [row] = await db.insert(schema.pricingAuditLog).values(data).returning();
      return row;
    },
    async getPricingAuditLog(limit = 100) {
      return db.select().from(schema.pricingAuditLog).orderBy(desc(schema.pricingAuditLog.timestamp)).limit(limit);
    },

    // ─── Service Area Requests ───
    async createServiceAreaRequest(data: schema.InsertServiceAreaRequest & { notes?: string }) {
      const now = new Date().toISOString();
      const [row] = await db.insert(schema.serviceAreaRequests).values({
        ...data,
        status: "new",
        createdAt: now,
        updatedAt: now,
      } as any).returning();
      return row;
    },
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
    },
    async getServiceAreaRequest(id: number) {
      const [row] = await db.select().from(schema.serviceAreaRequests).where(eq(schema.serviceAreaRequests.id, id));
      return row;
    },
    async updateServiceAreaRequest(id: number, patch: { status?: string; notes?: string }) {
      const [row] = await db.update(schema.serviceAreaRequests)
        .set({ ...patch, updatedAt: new Date().toISOString() })
        .where(eq(schema.serviceAreaRequests.id, id))
        .returning();
      return row;
    },
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
    },

    // ─── Admin Audit Log ───
    async createAdminAuditLog(data: schema.InsertAdminAuditLog) {
      const [row] = await db.insert(schema.adminAuditLog).values(data).returning();
      return row;
    },
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
    },
    async countAdminAuditLog(opts?: { entityType?: string; entityId?: string; actorId?: number }) {
      const conditions: any[] = [];
      if (opts?.entityType) conditions.push(eq(schema.adminAuditLog.entityType, opts.entityType));
      if (opts?.entityId) conditions.push(eq(schema.adminAuditLog.entityId, opts.entityId));
      if (opts?.actorId) conditions.push(eq(schema.adminAuditLog.actorId, opts.actorId));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [row] = await db.select({ count: sql<number>`count(*)` }).from(schema.adminAuditLog).where(where);
      return Number(row?.count || 0);
    },

    // ─── Notification Rules ───
    async getNotificationRules(): Promise<schema.NotificationRule[]> {
      return db.select().from(schema.notificationRules).orderBy(desc(schema.notificationRules.id));
    },
    async getNotificationRule(id: number): Promise<schema.NotificationRule | undefined> {
      const [row] = await db.select().from(schema.notificationRules).where(eq(schema.notificationRules.id, id));
      return row;
    },
    async getNotificationRulesByTrigger(trigger: string): Promise<schema.NotificationRule[]> {
      return db.select().from(schema.notificationRules).where(
        and(eq(schema.notificationRules.trigger, trigger), eq(schema.notificationRules.isActive, true))
      );
    },
    async createNotificationRule(input: schema.InsertNotificationRule): Promise<schema.NotificationRule> {
      const now = new Date().toISOString();
      const [row] = await db.insert(schema.notificationRules).values({
        ...input,
        createdAt: now,
        updatedAt: now,
      }).returning();
      return row;
    },
    async updateNotificationRule(id: number, patch: Partial<schema.InsertNotificationRule>): Promise<schema.NotificationRule | undefined> {
      const [row] = await db.update(schema.notificationRules)
        .set({ ...patch, updatedAt: new Date().toISOString() })
        .where(eq(schema.notificationRules.id, id))
        .returning();
      return row;
    },
    async deleteNotificationRule(id: number): Promise<boolean> {
      const result = await db.delete(schema.notificationRules).where(eq(schema.notificationRules.id, id));
      return (result.rowCount ?? 0) > 0;
    },
  };
}
