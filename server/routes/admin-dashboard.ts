import type { Express } from "express";
import { z } from "zod";
import { insertVendorPayoutSchema, insertPromoCodeSchema } from "@shared/schema";
import type { Order } from "@shared/schema";
import { storage, pool } from "../storage";
import { pricingConfig } from "../pricing-config-service";
import { logAdminAction } from "../audit-helpers";
import { ADMIN_ROLES, isAdminOrManager, requireAuth } from "../session";
import { now, canAccessOrder, detectIntent, generateAIResponse, calculateFraudRisk } from "../engines";
import { getPagination, paginatedResponse, camelizeRow } from "./deps";

export function registerAdminDashboardRoutes(app: Express) {
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
    allOrders.forEach(o => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    });

    // Revenue by vendor
    const revenueByVendor: Record<string, number> = {};
    allOrders.filter(o => o.status === "delivered").forEach(o => {
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
    allCustomers.forEach(u => {
      const t = u.loyaltyTier || "bronze";
      tierBreakdown[t] = (tierBreakdown[t] || 0) + 1;
    });

    // Pricing tier distribution
    const pricingTierCounts: Record<string, number> = {};
    allOrders.forEach(o => {
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

  async function enrichAdminOrder(order: Order) {
    const customer = await storage.getUser(order.customerId);
    const vendor = order.vendorId ? await storage.getVendor(order.vendorId) : null;
    const driver = order.driverId ? await storage.getDriver(order.driverId) : null;
    const returnDriver = order.returnDriverId ? await storage.getDriver(order.returnDriverId) : null;
    return {
      ...order,
      customerName: customer?.name || "Unknown customer",
      customerEmail: customer?.email || null,
      customerPhone: customer?.phone || null,
      vendorName: vendor?.name || null,
      driverName: driver?.name || null,
      returnDriverName: returnDriver?.name || null,
    };
  }

  app.get("/api/admin/orders", requireAuth(ADMIN_ROLES), async (req, res) => {
    const pg = getPagination(req);
    // Expected query count: 1. Keep this endpoint join-based; do not reintroduce per-order lookups.
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
    // Expected query count: 1. JOIN payment_transactions to orders instead of N+1 order lookups.
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
    // Expected query count: 1 aggregate query.
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
    delivered.forEach(o => {
      const key = new Date(o.deliveredAt || o.createdAt).toISOString().slice(0, 10);
      buckets[key] = (buckets[key] || 0) + (o.total || 0);
    });
    res.json(Object.entries(buckets).map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 })));
  });

  app.get("/api/dashboard/orders-by-status", requireAuth(ADMIN_ROLES), async (_req, res) => {
    const counts: Record<string, number> = {};
    (await storage.getOrders()).forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
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
    // Coerce isActive boolean → integer (DB column is integer, 1=active/0=inactive)
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

  // Admin: Analytics dashboard
  app.get("/api/admin/analytics", requireAuth(["admin", "manager"]), async (_req, res) => {
    const allOrders = await storage.getOrders();
    const allVendors = await storage.getVendors();
    const allCustomers = await storage.getUsersByRole("customer");
    const deliveredOrders = allOrders.filter(o => o.status === "delivered");

    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalVendorPayouts = allOrders.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);
    const totalDriverPayouts = allOrders.reduce((sum, o) => sum + (o.driverPayout || 0), 0);
    const platformCommission = totalRevenue - totalVendorPayouts - totalDriverPayouts;
    const avgOrderValue = deliveredOrders.length > 0 ? totalRevenue / deliveredOrders.length : 0;

    // Revenue by day — aggregate real delivered orders by day-of-week
    const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayRevenue: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const dayOrderCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    deliveredOrders.forEach(o => {
      if (o.createdAt) {
        const dow = new Date(o.createdAt).getDay();
        dayRevenue[dow] = (dayRevenue[dow] || 0) + (o.total || 0);
        dayOrderCount[dow] = (dayOrderCount[dow] || 0) + 1;
      }
    });
    const revenueByDay = DAY_LABELS.map((day, i) => ({
      day,
      revenue: Math.round((dayRevenue[i] || 0) * 100) / 100,
      orders: dayOrderCount[i] || 0,
    }));

    // Order status breakdown
    const statusCounts: Record<string, number> = {};
    allOrders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
    const orderStatusBreakdown = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

    // Acquisition funnel requires real web analytics data, which is not stored in the app DB.
    const acquisitionFunnel: Array<{ stage: string; count: number; percentage: number }> = [];
    const acquisitionFunnelMessage = "Insufficient data: web analytics events are not available in the production database.";

    // Top vendors
    const topVendors = allVendors.map(v => {
      const vOrders = deliveredOrders.filter(o => o.vendorId === v.id);
      return {
        id: v.id,
        name: v.name,
        orders: vOrders.length,
        rating: v.rating || 0,
        revenue: Math.round(vOrders.reduce((sum, o) => sum + (o.total || 0), 0) * 100) / 100,
        tier: v.performanceTier || "standard",
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // suppress unused variable warning
    void allCustomers;

    res.json({
      revenueByDay,
      kpis: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders: allOrders.length,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        platformCommission: Math.round(platformCommission * 100) / 100,
      },
      orderStatusBreakdown,
      acquisitionFunnel,
      acquisitionFunnelMessage,
      topVendors,
    });
  });

  // Admin: Financial report
  app.get("/api/admin/financial", requireAuth(["admin", "manager"]), async (_req, res) => {
    const allOrders = await storage.getOrders();
    const allVendors = await storage.getVendors();
    const deliveredOrders = allOrders.filter(o => o.status === "delivered");

    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    // Only count payouts for delivered orders to keep financials consistent
    const totalVendorPayouts = deliveredOrders.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);
    const totalDriverPayouts = deliveredOrders.reduce((sum, o) => sum + (o.driverPayout || 0), 0);
    const platformRevenue = totalRevenue - totalVendorPayouts - totalDriverPayouts;
    const commissionRate = totalRevenue > 0 ? Math.round((platformRevenue / totalRevenue) * 100) : 13;

    // Vendor breakdown
    const vendorBreakdown = allVendors.map(v => {
      const vOrders = deliveredOrders.filter(o => o.vendorId === v.id);
      const grossRevenue = vOrders.reduce((sum, o) => sum + (o.total || 0), 0);
      const vendorPayout = vOrders.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);
      const platformFee = grossRevenue - vendorPayout;
      return {
        id: v.id,
        name: v.name,
        orders: vOrders.length,
        grossRevenue: Math.round(grossRevenue * 100) / 100,
        vendorPayout: Math.round(vendorPayout * 100) / 100,
        platformFee: Math.round(platformFee * 100) / 100,
        payoutStatus: (v.pendingPayout || 0) > 0 ? "pending" : "completed" as "pending" | "processing" | "completed",
      };
    }).sort((a, b) => b.grossRevenue - a.grossRevenue);

    // Monthly trend from real delivered orders only.
    const monthlyBuckets: Record<string, { revenue: number; vendorPayouts: number; driverPayouts: number; platformRevenue: number }> = {};
    deliveredOrders.forEach(o => {
      const date = new Date(o.deliveredAt || o.createdAt);
      if (Number.isNaN(date.getTime())) return;
      const month = date.toLocaleString("en-US", { month: "short", year: "2-digit" });
      if (!monthlyBuckets[month]) monthlyBuckets[month] = { revenue: 0, vendorPayouts: 0, driverPayouts: 0, platformRevenue: 0 };
      const revenue = o.total || 0;
      const vendorPayout = o.vendorPayout || 0;
      const driverPayout = o.driverPayout || 0;
      monthlyBuckets[month].revenue += revenue;
      monthlyBuckets[month].vendorPayouts += vendorPayout;
      monthlyBuckets[month].driverPayouts += driverPayout;
      monthlyBuckets[month].platformRevenue += revenue - vendorPayout - driverPayout;
    });
    const monthlyTrend = Object.entries(monthlyBuckets).map(([month, values]) => ({
      month,
      revenue: Math.round(values.revenue * 100) / 100,
      vendorPayouts: Math.round(values.vendorPayouts * 100) / 100,
      driverPayouts: Math.round(values.driverPayouts * 100) / 100,
      platformRevenue: Math.round(values.platformRevenue * 100) / 100,
    }));
    const monthlyTrendMessage = monthlyTrend.length ? undefined : "Insufficient data: no delivered orders available for monthly trend.";

    res.json({
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        vendorPayouts: Math.round(totalVendorPayouts * 100) / 100,
        driverPayouts: Math.round(totalDriverPayouts * 100) / 100,
        platformRevenue: Math.round(platformRevenue * 100) / 100,
        commissionRate,
      },
      vendorBreakdown,
      monthlyTrend,
      monthlyTrendMessage,
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  OWNER REVIEW CENTER (sandbox-only)
  // ═══════════════════════════════════════════════════════════════
  // Returns metadata used by the Owner Review Center UI. Hard-gated on
  // SANDBOX=true env var so production cannot expose this even if the
  // route is accessed by an admin.
  app.get("/api/admin/owner-review/meta", requireAuth(["admin"]), async (req, res) => {
    const isSandbox = String(process.env.SANDBOX || "").toLowerCase() === "true";
    if (!isSandbox) {
      return res.status(404).json({ error: "Owner Review Center is sandbox-only." });
    }
    try {
      const taxRate = await pricingConfig.getTaxRate();
      const [fee48h, fee24h, feeSameDay] = await Promise.all([
        pricingConfig.getDeliveryFee("48h"),
        pricingConfig.getDeliveryFee("24h"),
        pricingConfig.getDeliveryFee("same_day"),
      ]);
      const tierKeys = ["small_bag", "medium_bag", "large_bag", "xl_bag"] as const;
      const tiers: Record<string, { displayName: string; flatPrice: number; maxWeight: number }> = {};
      const displayNames: Record<string, string> = {
        small_bag: "Small Bag", medium_bag: "Medium Bag", large_bag: "Large Bag", xl_bag: "XL Bag",
      };
      for (const k of tierKeys) {
        const t = await pricingConfig.getBagPrice(k);
        tiers[k] = { displayName: displayNames[k], flatPrice: t.flatPrice, maxWeight: t.maxWeight };
      }

      // Health probes
      let dbOk = false;
      try {
        await storage.getPricingConfig("tax_rate_default");
        dbOk = true;
      } catch { dbOk = false; }
      const hasStripe = !!process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.length > 20;
      const stripeMode = (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_")
        ? "live"
        : (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_")
          ? "test"
          : "unknown";
      const hasWhsec = !!process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_WEBHOOK_SECRET.length > 10;

      const meta = {
        sandbox: true,
        apiUrl: req.protocol + "://" + req.get("host"),
        buildCommit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || undefined,
        brand: {
          primaryColor: "#5B4BC4",
          bgColor: "#010101",
          textColor: "#FFFFFF",
          fontFamily: "Inter, system-ui, sans-serif",
          tagline: "Fresh clothes, zero hassle.",
          appName: "Offload",
        },
        pricing: { tiers, deliveryFees: { "48h": fee48h, "24h": fee24h, same_day: feeSameDay }, taxRate },
        health: { api: true, db: dbOk, stripe: hasStripe, stripeMode, webhookSecretConfigured: hasWhsec },
        testAccounts: [
          { role: "customer", email: "appreview@offloadusa.com", passwordHint: "Use configured sandbox credential", url: "/login" },
          { role: "admin", email: process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@offloadusa.com", passwordHint: "Use BOOTSTRAP_ADMIN_PASSWORD or generated one-time credential", url: "/login" },
          { role: "vendor", email: process.env.BOOTSTRAP_VENDOR_EMAIL || "vendor@offloadusa.com", passwordHint: "Use BOOTSTRAP_VENDOR_PASSWORD or generated one-time credential", url: "/login" },
          { role: "driver", email: process.env.BOOTSTRAP_DRIVER_EMAIL || "driver@offloadusa.com", passwordHint: "Use BOOTSTRAP_DRIVER_PASSWORD or generated one-time credential", url: "/login" },
        ],
        screens: [
          // Customer
          { role: "customer", title: "Home", path: "/", description: "Dashboard with recent orders and CTA" },
          { role: "customer", title: "Login", path: "/login" },
          { role: "customer", title: "Register", path: "/register" },
          { role: "customer", title: "Schedule", path: "/schedule", description: "Pickup scheduling & bag selection" },
          { role: "customer", title: "Orders", path: "/orders" },
          { role: "customer", title: "Order Detail", path: "/orders/1", description: "First sandbox order" },
          { role: "customer", title: "Tracking", path: "/tracking/1" },
          { role: "customer", title: "Profile", path: "/profile" },
          { role: "customer", title: "Addresses", path: "/addresses" },
          { role: "customer", title: "Payments", path: "/payments" },
          { role: "customer", title: "Loyalty", path: "/loyalty" },
          { role: "customer", title: "Referrals", path: "/referrals" },
          { role: "customer", title: "Chat / Support", path: "/chat" },
          // Driver
          { role: "driver", title: "Dashboard", path: "/driver" },
          { role: "driver", title: "Availability", path: "/driver/availability" },
          { role: "driver", title: "Route", path: "/driver/route" },
          { role: "driver", title: "Earnings", path: "/driver/earnings" },
          { role: "driver", title: "Profile", path: "/driver/profile" },
          // Vendor / laundromat
          { role: "vendor", title: "Queue", path: "/staff/queue" },
          { role: "vendor", title: "Active", path: "/staff/active" },
          { role: "vendor", title: "Quality", path: "/staff/quality" },
          { role: "vendor", title: "Profile", path: "/staff/profile" },
          // Manager
          { role: "manager", title: "Orders", path: "/manager/orders" },
          { role: "manager", title: "Payouts", path: "/manager/payouts" },
          { role: "manager", title: "Profile", path: "/manager/profile" },
          // Admin
          { role: "admin", title: "Overview", path: "/admin" },
          { role: "admin", title: "Orders", path: "/admin/orders" },
          { role: "admin", title: "Vendors", path: "/admin/vendors" },
          { role: "admin", title: "Drivers", path: "/admin/drivers" },
          { role: "admin", title: "Promos", path: "/admin/promos" },
          { role: "admin", title: "Financial", path: "/admin/financial" },
          { role: "admin", title: "Analytics", path: "/admin/analytics" },
          { role: "admin", title: "Disputes", path: "/admin/disputes" },
          { role: "admin", title: "Fraud", path: "/admin/fraud" },
          { role: "admin", title: "Vendor Health", path: "/admin/vendor-scoring" },
          { role: "admin", title: "Owner Review", path: "/admin/review", description: "This page (sandbox-only)" },
        ],
        flows: [
          { name: "Customer places & pays for first order", persona: "New customer", startUrl: "/login", expected: "Order created, Stripe test charge succeeds, order shows as Paid", steps: ["Log in as appreview@", "Go to /schedule", "Pick medium bag, 48h", "Confirm quote", "Pay with 4242 4242 4242 4242, any future date, any CVC", "See /orders/<id> with Paid status"] },
          { name: "Customer requests refund via support", persona: "Customer", startUrl: "/chat", expected: "Refund issued via Stripe test, order shows partial refund", steps: ["Open chat", "Ask 'I need a refund on order #X'", "Admin logs in, opens support inbox", "Issues refund from admin", "Customer sees refund event"] },
          { name: "Admin reviews reconciliation", persona: "Admin", startUrl: "/admin/financial", expected: "All Stripe charges/refunds reconcile against orders", steps: ["Log in as admin@", "Open /admin/financial", "Verify totals match Stripe Dashboard test mode"] },
          { name: "Driver toggles availability", persona: "Driver", startUrl: "/driver", expected: "Availability state persists across reload", steps: ["Log in as driver@", "Open /driver/availability", "Toggle on", "Reload", "Verify still on"] },
          { name: "Vendor accepts order from queue", persona: "Vendor", startUrl: "/staff/queue", expected: "Order moves to Active state", steps: ["Log in as vendor@", "Open /staff/queue", "Click first pending order", "Mark 'Accepted'", "Verify it appears in /staff/active"] },
          { name: "Bad-actor IDOR attempt", persona: "Unauthorized", startUrl: "/login", expected: "All cross-role access returns 401/403", steps: ["Log in as customer", "Open browser devtools, copy token", "curl /api/admin/users with token", "Expect 403"] },
        ],
      };
      res.json(meta);
    } catch (e: any) {
      console.error("[OwnerReview] meta error:", e?.message);
      res.status(500).json({ error: e?.message || "Failed to build owner review metadata" });
    }
  });

  // Admin: all users list
  app.get("/api/admin/users", requireAuth(["admin"]), async (req, res) => {
    const pg = getPagination(req);
    const role = req.query.role as string | undefined;
    if (role) {
      const users = (await storage.getUsersByRole(role)).map(u => ({ ...u, password: undefined }));
      return res.json(paginatedResponse(users, pg));
    }
    const allRoles = ["customer", "driver", "laundromat", "vendor", "manager", "admin"];
    const allUserArrays = await Promise.all(allRoles.map(r => storage.getUsersByRole(r)));
    const allUsers = allUserArrays.flat().map(u => ({ ...u, password: undefined }));
    res.json(paginatedResponse(allUsers, pg));
  });

  // Admin: search users
  app.get("/api/admin/users/search", requireAuth(["admin"]), async (req, res) => {
    const query = req.query.q as string;
    if (!query) return res.status(400).json({ error: "Search query required" });
    const users = await storage.searchUsers(query);
    res.json(users.map(u => ({ ...u, password: undefined })));
  });

  // ─────────────────────────────────────────────────────────
  //  MANAGER ENDPOINTS (vendor-specific)
  // ─────────────────────────────────────────────────────────

  app.get("/api/manager/earnings", requireAuth(["admin", "manager"]), async (req, res) => {
    const vendorId = Number(req.query.vendorId);
    if (!vendorId) {
      // Return aggregated earnings for all vendors
      const allVendors = await storage.getVendors();
      const allOrders = await storage.getOrders();
      const delivered = allOrders.filter(o => o.status === "delivered");
      const totalRevenue = delivered.reduce((sum, o) => sum + (o.total || 0), 0);
      const totalPayouts = delivered.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);
      const totalDriverPayouts = delivered.reduce((sum, o) => sum + (o.driverPayout || 0), 0);

      const vendorBreakdown = allVendors.map(v => {
        const vendorOrders = delivered.filter(o => o.vendorId === v.id);
        return {
          vendorId: v.id,
          vendorName: v.name,
          orders: vendorOrders.length,
          revenue: vendorOrders.reduce((sum, o) => sum + (o.total || 0), 0),
          payout: vendorOrders.reduce((sum, o) => sum + (o.vendorPayout || 0), 0),
          pending: v.pendingPayout || 0,
        };
      });

      return res.json({
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalVendorPayouts: Math.round(totalPayouts * 100) / 100,
        totalDriverPayouts: Math.round(totalDriverPayouts * 100) / 100,
        platformRevenue: Math.round((totalRevenue - totalPayouts - totalDriverPayouts) * 100) / 100,
        vendorBreakdown,
      });
    }

    const vendor = await storage.getVendor(vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const vendorOrders = await storage.getOrdersByVendor(vendorId);
    const delivered = vendorOrders.filter(o => o.status === "delivered");
    const totalRevenue = delivered.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalPayout = delivered.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);

    res.json({
      vendorId,
      vendorName: vendor.name,
      totalOrders: vendorOrders.length,
      completedOrders: delivered.length,
      activeOrders: vendorOrders.filter(o => !["delivered", "cancelled"].includes(o.status)).length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalPayout: Math.round(totalPayout * 100) / 100,
      pendingPayout: vendor.pendingPayout || 0,
      rating: vendor.rating,
    });
  });

  // ─────────────────────────────────────────────────────────
  //  DRIVER EARNINGS
  // ─────────────────────────────────────────────────────────

  app.get("/api/driver/earnings", requireAuth(["driver", "admin", "manager"]), async (req, res) => {
    // Security: drivers can only see their own earnings
    const cuE = (req as any).currentUser;
    if (cuE.role === "driver") {
      const myDriver = await storage.getDriverByUserId(cuE.id);
      const requestedId = Number(req.query.driverId);
      if (myDriver && requestedId && requestedId !== myDriver.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    const driverId = Number(req.query.driverId);
    if (!driverId) return res.status(400).json({ error: "driverId required" });

    const driver = await storage.getDriver(driverId);
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    const driverOrders = await storage.getOrdersByDriver(driverId);
    const delivered = driverOrders.filter(o => o.status === "delivered");
    const todayDelivered = delivered.filter(o => {
      if (!o.deliveredAt) return false;
      return new Date(o.deliveredAt).toDateString() === new Date().toDateString();
    });

    const todayTrips = driver.todayTrips || 0;
    const perTrip = driver.payoutPerTrip || 8.50;
    // Calculate today earnings from actual deliveries; fall back to trips * rate if driver has trips recorded
    const calculatedTodayEarnings = todayDelivered.length * perTrip;
    const todayEarnings = calculatedTodayEarnings > 0 ? calculatedTodayEarnings : todayTrips * perTrip;
    const todayTips = todayTrips > 0 ? Math.round(todayTrips * 2.5 * 100) / 100 : 0; // avg $2.50 tip estimate

    // Weekly data from recent orders
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayDelivered = delivered.filter(o => {
        if (!o.deliveredAt) return false;
        return new Date(o.deliveredAt).toDateString() === d.toDateString();
      });
      weeklyData.push({
        day: dayNames[d.getDay()],
        earnings: dayDelivered.length * perTrip,
        trips: dayDelivered.length,
      });
    }
    const finalWeeklyData = weeklyData;
    const weeklyDataMessage = weeklyData.some(w => w.earnings > 0) ? undefined : "Insufficient data: no completed driver trips in the last 7 days.";

    // Trip history from delivered orders
    const tripHistory = delivered.slice(0, 10).map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      pickupAddress: o.pickupAddress || "Miami, FL",
      deliveryAddress: o.deliveryAddress || "Miami, FL",
      earnings: perTrip,
      tip: o.tip || 0,
      timestamp: o.deliveredAt || o.createdAt || new Date().toISOString(),
      status: "completed",
    }));

    const bestDayEarnings = finalWeeklyData.reduce((max, d) => Math.max(max, d.earnings), 0);
    const avgPerTrip = (driver.completedTrips || 0) > 0
      ? Math.round(((driver.totalEarnings || 0) / (driver.completedTrips || 1)) * 100) / 100
      : perTrip;

    res.json({
      driverId,
      driverName: driver.name,
      totalTrips: driver.completedTrips || 0,
      todayTrips,
      todayEarnings,
      todayTips,
      totalEarnings: driver.totalEarnings || 0,
      pendingPayout: driver.pendingPayout || 0,
      avgPerTrip,
      bestDayEarnings,
      weeklyData: finalWeeklyData,
      weeklyDataMessage,
      tripHistory,
      nextPayoutDate: new Date(Date.now() + (5 - new Date().getDay() + 7) % 7 * 86400000 || 7 * 86400000).toISOString(),
      rating: driver.rating,
      onTimePickupRate: driver.onTimePickupRate,
      avgPickupTime: driver.avgPickupTime,
    });
  });

  // ─────────────────────────────────────────────────────────
  //  VENDOR PAYOUT MANAGEMENT
  // ─────────────────────────────────────────────────────────

  app.get("/api/vendor-payouts/:vendorId", requireAuth(["admin", "manager"]), async (req, res) => {
    const vendorId = Number(String(req.params.vendorId));
    const vendor = await storage.getVendor(vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    const payouts = await storage.getVendorPayouts(vendorId);
    res.json({
      vendorId,
      vendorName: vendor.name,
      pendingPayout: vendor.pendingPayout,
      totalEarnings: vendor.totalEarnings,
      payouts,
    });
  });

  app.post("/api/vendor-payouts", requireAuth(["admin", "manager"]), async (req, res) => {
    const PayoutBody = z.object({
      vendorId: z.number(),
      amount: z.number(),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
      ordersCount: z.number().optional(),
    }).strip();
    const parsedPayout = PayoutBody.safeParse(req.body);
    if (!parsedPayout.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedPayout.error.issues });
    }
    const { vendorId, amount, periodStart, periodEnd, ordersCount } = parsedPayout.data;
    const payout = await storage.createVendorPayout({
      vendorId,
      amount,
      status: "pending",
      periodStart: periodStart || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: periodEnd || now(),
      ordersCount: ordersCount || 0,
      createdAt: now(),
    });
    logAdminAction(req, { action: "vendor_payout.create", entityType: "vendor_payout", entityId: payout.id, newValue: { vendorId, amount } });
    res.status(201).json(payout);
  });

  app.patch("/api/vendor-payouts/:id", requireAuth(["admin"]), async (req, res) => {
    const payoutId = Number(String(req.params.id));
    const PayoutPatch = insertVendorPayoutSchema.partial();
    const parsed = PayoutPatch.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const beforePayout = await storage.getVendorPayout(payoutId);
    const updated = await storage.updateVendorPayout(payoutId, parsed.data);
    if (!updated) return res.status(404).json({ error: "Payout not found" });
    logAdminAction(req, { action: "vendor_payout.update", entityType: "vendor_payout", entityId: payoutId, oldValue: { status: beforePayout?.status }, newValue: parsed.data });

    // If completed, clear pendingPayout for vendor
    if (parsed.data.status === "completed") {
      const payout = updated;
      const vendor = await storage.getVendor(payout.vendorId);
      if (vendor) {
        await storage.updateVendor(vendor.id, {
          pendingPayout: Math.max(0, (vendor.pendingPayout || 0) - payout.amount),
        });
      }
    }

    res.json(updated);
  });

  // ─────────────────────────────────────────────────────────
  //  AI CHAT (enhanced endpoint with actions)
  // ─────────────────────────────────────────────────────────

  app.post("/api/ai/chat", requireAuth(), async (req, res) => {
    const AiChatBody = z.object({ message: z.string().min(1), sessionId: z.number().optional(), orderId: z.number().optional() }).strip();
    const parsedAiChat = AiChatBody.safeParse(req.body);
    if (!parsedAiChat.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedAiChat.error.issues });
    }
    const { message, sessionId, orderId } = parsedAiChat.data;
    const currentUser = (req as any).currentUser;
    const userId = currentUser.id;
    if (!message) return res.status(400).json({ error: "message is required" });

    const intent = detectIntent(message);
    const { response, resolved, escalate } = await generateAIResponse(intent, userId, message);
    const ts_ = now();

    let session;
    if (sessionId) {
      session = await storage.getChatSession(Number(sessionId));
      // F24: ensure the session belongs to the caller (or admin).
      if (session && session.userId !== userId && !isAdminOrManager(currentUser)) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }
    if (!session) {
      const newMessages = [
        { role: "user", content: message, timestamp: ts_ },
        { role: "assistant", content: response, timestamp: ts_, intent },
      ];
      session = await storage.createChatSession({
        userId, orderId: orderId || undefined,
        status: resolved ? "resolved" : escalate ? "escalated" : "active",
        topic: intent, aiResolved: !!resolved,
        messagesJson: JSON.stringify(newMessages), createdAt: ts_,
        resolvedAt: resolved ? ts_ : undefined,
      });
    } else {
      let existingMessages: any[] = [];
      try { existingMessages = session.messagesJson ? JSON.parse(session.messagesJson) : []; } catch (e) { console.warn("[chat] Failed to parse session messages:", e); }
      existingMessages.push({ role: "user", content: message, timestamp: ts_ });
      existingMessages.push({ role: "assistant", content: response, timestamp: ts_, intent });
      session = await storage.updateChatSession(session.id, {
        status: resolved ? "resolved" : escalate ? "escalated" : "active",
        aiResolved: !!resolved,
        messagesJson: JSON.stringify(existingMessages),
        resolvedAt: resolved ? ts_ : undefined,
      }) || session;
    }

    const actions: any[] = [];
    if (intent === "order_status") {
      const activeOrders = (await storage.getOrdersByCustomer(userId)).filter(o => !["delivered","cancelled"].includes(o.status));
      if (activeOrders.length > 0) actions.push({ type: "view_order", data: { orderId: activeOrders[0].id } });
    }
    if (intent === "pricing") actions.push({ type: "navigate", data: { path: "/schedule" } });
    if (escalate) actions.push({ type: "escalate", data: { reason: intent } });

    res.json({ reply: response, sessionId: session.id, actions, intent, resolved, escalated: escalate });
  });

  // ─────────────────────────────────────────────────────────
  //  BLE SCALE WEIGHT RECORDING
  // ─────────────────────────────────────────────────────────

  app.post("/api/orders/:id/ble-weight", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // F4: namespace-correct ownership (driver/vendor profile, not user id).
    const currentUser = (req as any).currentUser;
    if (!(await canAccessOrder(order, currentUser))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const BleBody = z.object({
      weight: z.number(),
      weightType: z.enum(["dirty", "clean"]),
      deviceName: z.string().optional(),
      rawReading: z.number().optional(),
      taredReading: z.number().optional(),
    }).strip();
    const parsedBle = BleBody.safeParse(req.body);
    if (!parsedBle.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedBle.error.issues });
    }
    const { weight, deviceName, rawReading, taredReading, weightType } = parsedBle.data;

    const updateData: any = {};
    const ts_ = now();

    if (weightType === "dirty") {
      updateData.dirtyWeight = weight;
      updateData.intakeWeight = weight;
    } else if (weightType === "clean") {
      updateData.cleanWeight = weight;
      updateData.outputWeight = weight;
      if (order.dirtyWeight) {
        updateData.weightDifference = Math.round((order.dirtyWeight - weight) * 100) / 100;
      }
      if (order.tierMaxWeight) {
        const overage = Math.max(0, weight - order.tierMaxWeight);
        const bleBagInfo = order.tierName ? await pricingConfig.getBagPrice(order.tierName as string) : null;
        const overageRate = bleBagInfo?.overageRate ?? 2.50;
        updateData.overageWeight = Math.round(overage * 100) / 100;
        updateData.overageCharge = Math.round(overage * overageRate * 100) / 100;
        const addOnsTotal = (await storage.getOrderAddOns(order.id)).reduce((sum, a) => sum + a.total, 0);
        updateData.finalPrice = Math.round(((order.tierFlatPrice || 0) + updateData.overageCharge + addOnsTotal - (order.discount || 0) + (order.tax || 0) + (order.deliveryFee || 0)) * 100) / 100;
      }
    }

    await storage.updateOrder(order.id, updateData);
    await storage.createOrderEvent({
      orderId: order.id,
      eventType: weightType === "dirty" ? "dirty_weight_recorded" : "clean_weight_recorded",
      description: `${weightType === "dirty" ? "Dirty" : "Clean"} weight: ${weight} lbs (BLE scale: ${deviceName || "unknown"})`,
      details: JSON.stringify({ weight, deviceName, rawReading, taredReading, source: "ble_scale" }),
      actorId: currentUser.id, actorRole: currentUser.role, timestamp: ts_,
    });

    res.json(await storage.getOrder(order.id));
  });
}
