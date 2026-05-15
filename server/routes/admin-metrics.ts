import type { Express } from "express";
import { insertPromoCodeSchema } from "@shared/schema";
import type { Order } from "@shared/schema";
import { storage, pool } from "../storage";
import { logAdminAction } from "../audit-helpers";
import { ADMIN_ROLES, requireAuth } from "../session";
import { now } from "../engines";
import { getPagination, paginatedResponse, camelizeRow } from "./deps";
import { enrichAdminOrder } from "./orders-crud";

export function registerAdminMetricsRoutes(app: Express) {
  // ─────────────────────────────────────────────────────────
  //  ADMIN METRICS (dashboard)
  // ─────────────────────────────────────────────────────────

  app.get("/api/admin/metrics", requireAuth(["admin", "manager"]), async (_req, res) => {
    const allOrders = await storage.getOrders();
    const allVendors = await storage.getVendors();
    const allDrivers = await storage.getDrivers();
    const allDisputes = await storage.getDisputes();
    const allReviews = await storage.getReviews();

    const totalRevenue = allOrders
      .filter(o => o.status === "delivered")
      .reduce((sum, o) => sum + (o.total || 0), 0);
    const activeOrders = allOrders.filter(o => !["delivered", "cancelled"].includes(o.status)).length;
    const completedOrders = allOrders.filter(o => o.status === "delivered").length;
    const cancelledOrders = allOrders.filter(o => o.status === "cancelled").length;
    const avgOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;

    // SLA compliance
    const slaBreached = allOrders.filter(o => o.slaStatus === "breached").length;
    const slaAtRisk = allOrders.filter(o => o.slaStatus === "at_risk").length;

    // Status distribution
    const statusCounts: Record<string, number> = {};
    allOrders.forEach(async o => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    });

    // Revenue by vendor
    const revenueByVendor: Record<string, number> = {};
    allOrders.filter(o => o.status === "delivered").forEach(async o => {
      const vendor = allVendors.find(v => v.id === o.vendorId);
      const name = vendor?.name || "Unassigned";
      revenueByVendor[name] = (revenueByVendor[name] || 0) + (o.total || 0);
    });

    // Avg review score
    const avgRating = allReviews.length > 0
      ? allReviews.reduce((sum, r) => sum + r.overallRating, 0) / allReviews.length
      : 0;

    // Total payouts
    const totalVendorPayouts = allOrders.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);
    const totalDriverPayouts = allOrders.reduce((sum, o) => sum + (o.driverPayout || 0), 0);

    // Loyalty stats
    const allCustomers = await storage.getUsersByRole("customer");
    const totalLoyaltyPoints = allCustomers.reduce((sum, u) => sum + (u.loyaltyPoints || 0), 0);
    const tierBreakdown: Record<string, number> = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
    allCustomers.forEach(async u => {
      const t = u.loyaltyTier || "bronze";
      tierBreakdown[t] = (tierBreakdown[t] || 0) + 1;
    });

    // Pricing tier distribution
    const pricingTierCounts: Record<string, number> = {};
    allOrders.forEach(async o => {
      if (o.aiPricingTier) {
        pricingTierCounts[o.aiPricingTier] = (pricingTierCounts[o.aiPricingTier] || 0) + 1;
      }
    });

    res.json({
      totalOrders: allOrders.length,
      activeOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      totalVendors: allVendors.length,
      activeVendors: allVendors.filter(v => v.status === "active").length,
      totalDrivers: allDrivers.length,
      availableDrivers: allDrivers.filter(d => d.status === "available").length,
      openDisputes: allDisputes.filter(d => d.status === "open" || d.status === "investigating").length,
      statusCounts,
      revenueByVendor,
      slaBreached,
      slaAtRisk,
      avgRating: Math.round(avgRating * 10) / 10,
      totalVendorPayouts: Math.round(totalVendorPayouts * 100) / 100,
      totalDriverPayouts: Math.round(totalDriverPayouts * 100) / 100,
      platformRevenue: Math.round((totalRevenue - totalVendorPayouts - totalDriverPayouts) * 100) / 100,
      loyalty: {
        totalPoints: totalLoyaltyPoints,
        tierBreakdown,
      },
      pricingTierDistribution: pricingTierCounts,
    });
  });


  app.get("/api/admin/orders", requireAuth(ADMIN_ROLES), async (req, res) => {
    const pg = getPagination(req);
    const { rows } = await pool.query(`
      SELECT o.*,
        u.name AS "customerName", u.email AS "customerEmail", u.phone AS "customerPhone",
        v.name AS "vendorName",
        d.name AS "driverName",
        rd.name AS "returnDriverName"
      FROM orders o
      LEFT JOIN users u ON u.id = o.customer_id
      LEFT JOIN vendors v ON v.id = o.vendor_id
      LEFT JOIN drivers d ON d.id = o.driver_id
      LEFT JOIN drivers rd ON rd.id = o.return_driver_id
      ORDER BY o.created_at DESC
    `);
    res.json(paginatedResponse(rows.map(camelizeRow), pg));
  });

  app.get("/api/admin/orders/:id", requireAuth(ADMIN_ROLES), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json({
      ...await enrichAdminOrder(order),
      events: await storage.getOrderEvents(order.id),
      statusHistory: await storage.getOrderStatusHistory(order.id),
      photos: await storage.getOrderPhotos(order.id),
      paymentTransactions: await storage.getPaymentTransactionsByOrder(order.id),
      consents: await storage.getConsentsByOrder(order.id),
      review: await storage.getReviewByOrder(order.id),
    });
  });

  app.get("/api/admin/users/:id", requireAuth(ADMIN_ROLES), async (req, res) => {
    const user = await storage.getUser(Number(String(req.params.id)));
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      ...user,
      password: undefined,
      orders: user.role === "customer" ? await storage.getOrdersByCustomer(user.id) : [],
      driverProfile: user.role === "driver" ? await storage.getDriverByUserId(user.id) : null,
      vendorProfile: ["vendor", "laundromat", "manager"].includes(user.role) ? await storage.getVendorByUserId(user.id) : null,
      notifications: await storage.getNotificationsByUser(user.id),
    });
  });

  app.get("/api/admin/payments", requireAuth(ADMIN_ROLES), async (req, res) => {
    const pg = getPagination(req);
    const { rows } = await pool.query(`
      SELECT pt.*, o.order_number AS "orderNumber", o.customer_id AS "customerId", o.total AS "orderTotal"
      FROM payment_transactions pt
      JOIN orders o ON o.id = pt.order_id
      ORDER BY pt.created_at DESC
    `);
    res.json(paginatedResponse(rows.map(camelizeRow), pg));
  });

  app.get("/api/admin/drivers", requireAuth(ADMIN_ROLES), async (_req, res) => {
    res.json(await storage.getDrivers());
  });

  app.get("/api/admin/vendors", requireAuth(ADMIN_ROLES), async (_req, res) => {
    res.json(await storage.getVendors());
  });

  app.get("/api/admin/financial-summary", requireAuth(ADMIN_ROLES), async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total ELSE 0 END), 0) AS revenue,
        COUNT(*)::int AS "totalOrders",
        COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END), 0)::int AS "deliveredOrders",
        COALESCE(SUM(CASE WHEN pt.type = 'refund' AND pt.status = 'completed' THEN ABS(pt.amount) ELSE 0 END), 0) AS refunds
      FROM orders o
      LEFT JOIN payment_transactions pt ON pt.order_id = o.id
    `);
    const row = rows[0] || {};
    const revenue = Number(row.revenue || 0);
    const deliveredOrders = Number(row.deliveredOrders || 0);
    const refunds = Number(row.refunds || 0);
    res.json({
      revenue: Math.round(revenue * 100) / 100,
      refunds: Math.round(refunds * 100) / 100,
      averageOrderValue: deliveredOrders ? Math.round((revenue / deliveredOrders) * 100) / 100 : 0,
      deliveredOrders,
      totalOrders: Number(row.totalOrders || 0),
    });
  });

  async function adminKpis() {
    const orders = await storage.getOrders();
    const customers = await storage.getUsersByRole("customer");
    const drivers = await storage.getDrivers();
    const disputes = await storage.getDisputes();
    const delivered = orders.filter(o => o.status === "delivered");
    const revenue = delivered.reduce((sum, o) => sum + (o.total || 0), 0);
    return {
      totalRevenue: Math.round(revenue * 100) / 100,
      activeOrders: orders.filter(o => !["delivered", "cancelled"].includes(o.status)).length,
      activeCustomers: customers.length,
      activeDrivers: drivers.filter(d => d.status !== "offline").length,
      avgOrderValue: delivered.length ? Math.round((revenue / delivered.length) * 100) / 100 : 0,
      openDisputes: disputes.filter(d => ["open", "investigating"].includes(d.status)).length,
      slaViolations: orders.filter(o => o.slaStatus === "breached").length,
    };
  }

  app.get("/api/dashboard/kpis", requireAuth(ADMIN_ROLES), async (_req, res) => {
    res.json(await adminKpis());
  });

  app.get("/api/dashboard/revenue", requireAuth(ADMIN_ROLES), async (_req, res) => {
    const delivered = (await storage.getOrders()).filter(o => o.status === "delivered");
    const buckets: Record<string, number> = {};
    delivered.forEach(async o => {
      const key = new Date(o.deliveredAt || o.createdAt).toISOString().slice(0, 10);
      buckets[key] = (buckets[key] || 0) + (o.total || 0);
    });
    res.json(Object.entries(buckets).map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 })));
  });

  app.get("/api/dashboard/orders-by-status", requireAuth(ADMIN_ROLES), async (_req, res) => {
    const counts: Record<string, number> = {};
    (await storage.getOrders()).forEach(async o => { counts[o.status] = (counts[o.status] || 0) + 1; });
    res.json(Object.entries(counts).map(([status, count]) => ({ status, count })));
  });

  app.get("/api/dashboard/recent-orders", requireAuth(ADMIN_ROLES), async (_req, res) => {
    res.json(await Promise.all((await storage.getOrders()).slice(0, 10).map(enrichAdminOrder)));
  });

  app.get("/api/customers", requireAuth(ADMIN_ROLES), async (_req, res) => {
    res.json((await storage.getUsersByRole("customer")).map(u => ({ ...u, password: undefined })));
  });

  app.get("/api/customers/:id", requireAuth(ADMIN_ROLES), async (req, res) => {
    const user = await storage.getUser(Number(String(req.params.id)));
    if (!user || user.role !== "customer") return res.status(404).json({ error: "Customer not found" });
    res.json({ ...user, password: undefined, orders: await storage.getOrdersByCustomer(user.id) });
  });

  app.get("/api/customers/:id/orders", requireAuth(ADMIN_ROLES), async (req, res) => {
    res.json(await Promise.all((await storage.getOrdersByCustomer(Number(String(req.params.id)))).map(enrichAdminOrder)));
  });

  app.get("/api/customers/:id/communications", requireAuth(ADMIN_ROLES), async (req, res) => {
    res.json(await storage.getNotificationsByUser(Number(String(req.params.id))));
  });

  app.get("/api/transactions", requireAuth(ADMIN_ROLES), async (_req, res) => {
    res.json(await storage.getPaymentTransactions());
  });

  app.get("/api/analytics/overview", requireAuth(ADMIN_ROLES), async (_req, res) => {
    const kpis = await adminKpis();
    res.json({ kpis, acquisitionFunnel: [], acquisitionFunnelMessage: "Insufficient data: web analytics events are not available in the production database." });
  });

  app.get("/api/settings", requireAuth(ADMIN_ROLES), async (_req, res) => {
    res.json(await storage.getAllPricingConfig());
  });

  app.get("/api/promo-codes", requireAuth(ADMIN_ROLES), async (_req, res) => {
    res.json(await storage.getPromoCodes());
  });

  app.post("/api/promo-codes", requireAuth(["admin"]), async (req, res) => {
    const PromoBody = insertPromoCodeSchema.omit({ createdAt: true });
    const parsed = PromoBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const body: any = { ...parsed.data };

    const created = await storage.createPromoCode({ ...body, createdAt: now() });
    logAdminAction(req, { action: "promo_code.create", entityType: "promo_code", entityId: created.id, newValue: body });
    res.status(201).json(created);
  });

  app.patch("/api/promo-codes/:id", requireAuth(["admin"]), async (req, res) => {
    const PromoPatch = insertPromoCodeSchema.partial();
    const parsed = PromoPatch.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const body: any = { ...parsed.data };

    const promoId = Number(String(req.params.id));
    const updated = await storage.updatePromoCode(promoId, body);
    if (!updated) return res.status(404).json({ error: "Promo code not found" });
    logAdminAction(req, { action: "promo_code.update", entityType: "promo_code", entityId: promoId, newValue: body });
    res.json(updated);
  });
}
