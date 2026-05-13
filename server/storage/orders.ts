import { eq, desc, and, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import {
  addOrderCents, addQuoteCents, addConsentCents, addDisputeCents,
  addVendorCents, addDriverCents, addOrderAddOnCents, addPaymentTxnCents,
} from "./helpers";

type DB = NodePgDatabase<typeof schema>;

export function createOrderMethods(db: DB) {
  return {
    // ─── Orders ───
    async getOrders() { return db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)); },
    async getOrder(id: number) {
      const [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
      return row;
    },
    async getActiveOrders() {
      return db.select().from(schema.orders).where(
        and(
          sql`${schema.orders.status} NOT IN ('delivered', 'cancelled')`,
        )
      );
    },
    async getOrdersByCustomer(customerId: number) {
      return db.select().from(schema.orders).where(eq(schema.orders.customerId, customerId)).orderBy(desc(schema.orders.createdAt));
    },
    async getOrdersByVendor(vendorId: number) {
      return db.select().from(schema.orders).where(eq(schema.orders.vendorId, vendorId)).orderBy(desc(schema.orders.createdAt));
    },
    async getOrdersByDriver(driverId: number) {
      return db.select().from(schema.orders).where(
        or(eq(schema.orders.driverId, driverId), eq(schema.orders.returnDriverId, driverId))
      ).orderBy(desc(schema.orders.createdAt));
    },
    async getOrdersByStatus(status: string) {
      return db.select().from(schema.orders).where(eq(schema.orders.status, status));
    },
    async createOrder(data: schema.InsertOrder) {
      const augmented = addOrderCents(data);
      const [row] = await db.insert(schema.orders).values(augmented).returning();
      return row;
    },
    async updateOrder(id: number, data: Partial<schema.InsertOrder>) {
      const augmented = addOrderCents(data);
      const [row] = await db.update(schema.orders).set(augmented).where(eq(schema.orders.id, id)).returning();
      return row;
    },

    /**
     * Atomically transition an order and write its audit event.
     * Uses optimistic concurrency so callers cannot overwrite a status that changed
     * between read and write. Optional vendor/driver updates are committed in the
     * same transaction.
     */
    async transitionOrderStatus(
      orderId: number,
      fromStatus: string,
      toStatus: string,
      eventData: schema.InsertOrderEvent & {
        orderUpdate?: Partial<schema.InsertOrder>;
        vendorUpdate?: { id: number; data: Partial<schema.InsertVendor> };
        driverUpdate?: { id: number; data: Partial<schema.InsertDriver> };
      },
    ) {
      return db.transaction(async (tx) => {
        const { orderUpdate, vendorUpdate, driverUpdate, ...rawEvent } = eventData as any;
        const updatePayload = addOrderCents({
          ...(orderUpdate || {}),
          status: toStatus,
          updatedAt: (orderUpdate as any)?.updatedAt || new Date().toISOString(),
        });
        const [updated] = await tx.update(schema.orders)
          .set(updatePayload as any)
          .where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, fromStatus)))
          .returning();
        if (!updated) {
          throw new Error(`order_status_conflict:${orderId}:${fromStatus}->${toStatus}`);
        }
        await tx.insert(schema.orderEvents).values({
          ...rawEvent,
          orderId,
          eventType: rawEvent.eventType || toStatus,
          fromStatus,
          toStatus,
          timestamp: rawEvent.timestamp || new Date().toISOString(),
        } as any);
        if (vendorUpdate) {
          await tx.update(schema.vendors).set(addVendorCents(vendorUpdate.data) as any).where(eq(schema.vendors.id, vendorUpdate.id));
        }
        if (driverUpdate) {
          await tx.update(schema.drivers).set(addDriverCents(driverUpdate.data) as any).where(eq(schema.drivers.id, driverUpdate.id));
        }
        return updated;
      });
    },

    // ─── Order Events ───
    async getOrderEvents(orderId: number) {
      return db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, orderId)).orderBy(schema.orderEvents.timestamp);
    },
    async createOrderEvent(data: schema.InsertOrderEvent) {
      const [row] = await db.insert(schema.orderEvents).values(data).returning();
      return row;
    },

    // ─── Consents ───
    async getConsentsByOrder(orderId: number) { return db.select().from(schema.consentRecords).where(eq(schema.consentRecords.orderId, orderId)); },
    async getConsent(id: number) {
      const [row] = await db.select().from(schema.consentRecords).where(eq(schema.consentRecords.id, id));
      return row;
    },
    async getPendingConsents() { return db.select().from(schema.consentRecords).where(eq(schema.consentRecords.status, "pending")); },
    async createConsent(data: schema.InsertConsent) {
      const [row] = await db.insert(schema.consentRecords).values(addConsentCents(data)).returning();
      return row;
    },
    async updateConsent(id: number, data: Partial<schema.InsertConsent>) {
      const [row] = await db.update(schema.consentRecords).set(addConsentCents(data)).where(eq(schema.consentRecords.id, id)).returning();
      return row;
    },

    // ─── Disputes ───
    async getDisputes() { return db.select().from(schema.disputes).orderBy(desc(schema.disputes.createdAt)); },
    async getDispute(id: number) {
      const [row] = await db.select().from(schema.disputes).where(eq(schema.disputes.id, id));
      return row;
    },
    async createDispute(data: schema.InsertDispute) {
      const [row] = await db.insert(schema.disputes).values(addDisputeCents(data)).returning();
      return row;
    },
    async updateDispute(id: number, data: Partial<schema.InsertDispute>) {
      const [row] = await db.update(schema.disputes).set(addDisputeCents(data)).where(eq(schema.disputes.id, id)).returning();
      return row;
    },

    // ─── Reviews ───
    async getReviews() { return db.select().from(schema.reviews).orderBy(desc(schema.reviews.createdAt)); },
    async getReviewByOrder(orderId: number) {
      const [row] = await db.select().from(schema.reviews).where(eq(schema.reviews.orderId, orderId));
      return row;
    },
    async getReviewsByVendor(vendorId: number) { return db.select().from(schema.reviews).where(eq(schema.reviews.vendorId, vendorId)); },
    async getReviewsByDriver(driverId: number) { return db.select().from(schema.reviews).where(eq(schema.reviews.driverId, driverId)); },
    async createReview(data: schema.InsertReview) {
      const [row] = await db.insert(schema.reviews).values(data).returning();
      return row;
    },

    // ─── Order Add-Ons ───
    async getOrderAddOns(orderId: number) { return db.select().from(schema.orderAddOns).where(eq(schema.orderAddOns.orderId, orderId)); },
    async createOrderAddOn(data: schema.InsertOrderAddOn) {
      const [row] = await db.insert(schema.orderAddOns).values(addOrderAddOnCents(data)).returning();
      return row;
    },

    // ─── Payment Transactions ───
    async getPaymentTransactions() {
      return db.select().from(schema.paymentTransactions).orderBy(desc(schema.paymentTransactions.createdAt));
    },
    async getPaymentTransactionsByOrder(orderId: number) {
      return db.select().from(schema.paymentTransactions).where(eq(schema.paymentTransactions.orderId, orderId))
        .orderBy(desc(schema.paymentTransactions.createdAt));
    },
    async createPaymentTransaction(data: schema.InsertPaymentTransaction) {
      const [row] = await db.insert(schema.paymentTransactions).values(addPaymentTxnCents(data)).returning();
      return row;
    },
    async updatePaymentTransaction(id: number, data: Partial<schema.InsertPaymentTransaction>) {
      const [row] = await db.update(schema.paymentTransactions).set(data).where(eq(schema.paymentTransactions.id, id)).returning();
      return row;
    },

    // ─── Stripe Accounts ───
    async getStripeAccount(userId: number) {
      const [row] = await db.select().from(schema.stripeAccounts).where(eq(schema.stripeAccounts.userId, userId));
      return row;
    },
    async createStripeAccount(data: schema.InsertStripeAccount) {
      const [row] = await db.insert(schema.stripeAccounts).values(data).returning();
      return row;
    },
    async updateStripeAccount(id: number, data: Partial<schema.InsertStripeAccount>) {
      const [row] = await db.update(schema.stripeAccounts).set(data).where(eq(schema.stripeAccounts.id, id)).returning();
      return row;
    },

    // ─── Order Status History ───
    async getOrderStatusHistory(orderId: number) {
      return db.select().from(schema.orderStatusHistory).where(eq(schema.orderStatusHistory.orderId, orderId))
        .orderBy(schema.orderStatusHistory.timestamp);
    },
    async createOrderStatusHistory(data: schema.InsertOrderStatusHistory) {
      const [row] = await db.insert(schema.orderStatusHistory).values(data).returning();
      return row;
    },

    // ─── Order Photos ───
    async createOrderPhoto(data: schema.InsertOrderPhoto) {
      const [row] = await db.insert(schema.orderPhotos).values(data).returning();
      return row;
    },
    async getOrderPhotos(orderId: number) {
      return db.select().from(schema.orderPhotos)
        .where(eq(schema.orderPhotos.orderId, orderId))
        .orderBy(schema.orderPhotos.timestamp);
    },
    async getOrderPhotosByType(orderId: number, type: string) {
      return db.select().from(schema.orderPhotos)
        .where(and(eq(schema.orderPhotos.orderId, orderId), eq(schema.orderPhotos.type, type)))
        .orderBy(schema.orderPhotos.timestamp);
    },
    async getPhotosByOrder(orderId: number) {
      return db.select().from(schema.orderPhotos)
        .where(eq(schema.orderPhotos.orderId, orderId));
    },

    // ─── Quotes ───
    async getQuote(id: number) {
      const [row] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id));
      return row;
    },
    async getQuoteByNumber(quoteNumber: string) {
      const [row] = await db.select().from(schema.quotes).where(eq(schema.quotes.quoteNumber, quoteNumber));
      return row;
    },
    async getQuoteByPublicToken(token: string) {
      const [row] = await db.select().from(schema.quotes).where(eq(schema.quotes.publicToken, token));
      return row;
    },
    async getQuoteByIdempotencyKey(key: string) {
      const [row] = await db.select().from(schema.quotes).where(eq(schema.quotes.idempotencyKey, key));
      return row;
    },
    async getQuotesByCustomer(customerId: number) {
      return db.select().from(schema.quotes).where(eq(schema.quotes.customerId, customerId)).orderBy(desc(schema.quotes.createdAt));
    },
    async getQuotesBySession(sessionId: string) {
      return db.select().from(schema.quotes).where(eq(schema.quotes.sessionId, sessionId)).orderBy(desc(schema.quotes.createdAt));
    },
    async createQuote(data: schema.InsertQuote) {
      const augmented = addQuoteCents(data);
      const [row] = await db.insert(schema.quotes).values(augmented).returning();
      return row;
    },
    async updateQuote(id: number, data: Partial<schema.InsertQuote>) {
      const augmented = addQuoteCents(data);
      const [row] = await db.update(schema.quotes).set(augmented).where(eq(schema.quotes.id, id)).returning();
      return row;
    },
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
    },

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
    },
    async deleteStripeEvent(eventId: string): Promise<void> {
      await db.delete(schema.stripeProcessedEvents).where(eq(schema.stripeProcessedEvents.eventId, eventId));
    },

    // ─── Promo Usage ───
    async recordPromoUsage(promoId: number, userId: number, orderId: number): Promise<void> {
      await db.insert(schema.promoUsage).values({
        promoId,
        userId,
        orderId,
        usedAt: new Date().toISOString(),
      });
    },
    async getPromoUsageByUser(promoId: number, userId: number): Promise<number> {
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.promoUsage)
        .where(and(eq(schema.promoUsage.promoId, promoId), eq(schema.promoUsage.userId, userId)));
      return Number(result?.count) || 0;
    },
    async deletePromoUsageByOrder(orderId: number): Promise<void> {
      await db.delete(schema.promoUsage).where(eq(schema.promoUsage.orderId, orderId));
    },
  };
}
