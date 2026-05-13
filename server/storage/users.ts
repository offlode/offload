import { eq, or, like, sql, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { addUserCents } from "./helpers";

type DB = NodePgDatabase<typeof schema>;

export function createUserMethods(db: DB) {
  return {
    // ─── Users ───
    async getUser(id: number) {
      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
      return row;
    },
    async getUserByUsername(username: string) {
      const [row] = await db.select().from(schema.users).where(eq(schema.users.username, username));
      return row;
    },
    async getUserByEmail(email: string) {
      const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
      return row;
    },
    async getUsersByRole(role: string) {
      return db.select().from(schema.users).where(eq(schema.users.role, role));
    },
    async createUser(data: schema.InsertUser) {
      const [row] = await db.insert(schema.users).values(addUserCents(data)).returning();
      return row;
    },
    async updateUser(id: number, data: Partial<schema.InsertUser>) {
      const [row] = await db.update(schema.users).set(addUserCents(data)).where(eq(schema.users.id, id)).returning();
      return row;
    },
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
    },
    async searchUsers(query: string) {
      return db.select().from(schema.users).where(
        or(like(schema.users.name, `%${query}%`), like(schema.users.email, `%${query}%`))
      );
    },

    // ─── Addresses ───
    async getAddress(id: number) {
      const [row] = await db.select().from(schema.addresses).where(eq(schema.addresses.id, id));
      return row;
    },
    async getAddressesByUser(userId: number) {
      return db.select().from(schema.addresses).where(eq(schema.addresses.userId, userId));
    },
    async createAddress(data: schema.InsertAddress) {
      const [row] = await db.insert(schema.addresses).values(data).returning();
      return row;
    },
    async updateAddress(id: number, data: Partial<schema.InsertAddress>) {
      const [row] = await db.update(schema.addresses).set(data).where(eq(schema.addresses.id, id)).returning();
      return row;
    },
    async deleteAddress(id: number) {
      await db.delete(schema.addresses).where(eq(schema.addresses.id, id));
    },

    // ─── Payment Methods ───
    async getPaymentMethodsByUser(userId: number) { return db.select().from(schema.paymentMethods).where(eq(schema.paymentMethods.userId, userId)); },
    async getPaymentMethod(id: number) {
      const [row] = await db.select().from(schema.paymentMethods).where(eq(schema.paymentMethods.id, id));
      return row;
    },
    async createPaymentMethod(data: schema.InsertPaymentMethod) {
      const [row] = await db.insert(schema.paymentMethods).values(data).returning();
      return row;
    },
    async updatePaymentMethod(id: number, data: Partial<schema.InsertPaymentMethod>) {
      const [row] = await db.update(schema.paymentMethods).set(data).where(eq(schema.paymentMethods.id, id)).returning();
      return row;
    },
    async deletePaymentMethod(id: number) { await db.delete(schema.paymentMethods).where(eq(schema.paymentMethods.id, id)); },

    // ─── Customer Stats ───
    async getCustomerStats(id: number) {
      const orders = await db.select().from(schema.orders).where(eq(schema.orders.customerId, id));
      const delivered = orders.filter(o => o.status === "delivered");
      const user = await db.select().from(schema.users).where(eq(schema.users.id, id)).then(r => r[0]);
      return {
        totalOrders: orders.length,
        completedOrders: delivered.length,
        totalSpent: delivered.reduce((s, o) => s + (o.total || 0), 0),
        avgOrderValue: delivered.length > 0 ? delivered.reduce((s, o) => s + (o.total || 0), 0) / delivered.length : 0,
        loyaltyPoints: user?.loyaltyPoints || 0,
        loyaltyTier: user?.loyaltyTier || "bronze",
        memberSince: user?.memberSince,
      };
    },

    // ─── Sessions (DB-backed) ───
    async createSession(token: string, userId: number, role: string, expiresAt: string): Promise<void> {
      await db.insert(schema.sessions).values({
        token,
        userId,
        role,
        createdAt: new Date().toISOString(),
        expiresAt,
      });
    },
    async getSession(token: string): Promise<{ userId: number; role: string; expiresAt: string } | null> {
      const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.token, token));
      if (!session) return null;
      if (new Date(session.expiresAt) < new Date()) {
        await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
        return null;
      }
      return { userId: session.userId, role: session.role, expiresAt: session.expiresAt };
    },
    async deleteSession(token: string): Promise<void> {
      await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
    },
    async deleteSessionsByUser(userId: number): Promise<void> {
      await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    },
    async deleteExpiredSessions(): Promise<void> {
      const now = new Date().toISOString();
      await db.delete(schema.sessions).where(sql`${schema.sessions.expiresAt} < ${now}`);
    },

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
    },
    async getIdempotencyKey(key: string): Promise<{ response: string; statusCode: number } | null> {
      const [row] = await db.select().from(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.key, key));
      if (!row) return null;
      if (new Date(row.expiresAt) < new Date()) {
        await db.delete(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.key, key));
        return null;
      }
      return { response: row.response, statusCode: row.statusCode };
    },
    async deleteExpiredIdempotencyKeys(): Promise<void> {
      const now = new Date().toISOString();
      await db.delete(schema.idempotencyKeys).where(sql`${schema.idempotencyKeys.expiresAt} < ${now}`);
    },

    // ─── Password Reset Tokens ───
    async createPasswordResetToken(userId: number, token: string, expiresAt: string): Promise<void> {
      await db.insert(schema.passwordResetTokens).values({
        userId,
        token,
        expiresAt,
        createdAt: new Date().toISOString(),
      });
    },
    async getPasswordResetToken(token: string): Promise<{ userId: number; token: string; expiresAt: string; usedAt: string | null } | undefined> {
      const [row] = await db.select().from(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.token, token));
      return row as any;
    },
    async markPasswordResetTokenUsed(token: string): Promise<void> {
      await db.update(schema.passwordResetTokens)
        .set({ usedAt: new Date().toISOString() })
        .where(eq(schema.passwordResetTokens.token, token));
    },
    async cleanExpiredResetTokens(): Promise<void> {
      const now = new Date().toISOString();
      await db.delete(schema.passwordResetTokens).where(sql`${schema.passwordResetTokens.expiresAt} < ${now}`);
    },
  };
}
