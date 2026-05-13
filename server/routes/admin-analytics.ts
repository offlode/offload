import type { Express } from "express";
import { storage } from "../storage";
import { pricingConfig } from "../pricing-config-service";
import { requireAuth } from "../session";
import { getPagination, paginatedResponse } from "./deps";

export function registerAdminAnalyticsRoutes(app: Express) {
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
    deliveredOrders.forEach(async o => {
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
          { role: "driver", title: "Dashboard", path: "/driver" },
          { role: "driver", title: "Availability", path: "/driver/availability" },
          { role: "driver", title: "Route", path: "/driver/route" },
          { role: "driver", title: "Earnings", path: "/driver/earnings" },
          { role: "driver", title: "Profile", path: "/driver/profile" },
          { role: "vendor", title: "Queue", path: "/staff/queue" },
          { role: "vendor", title: "Active", path: "/staff/active" },
          { role: "vendor", title: "Quality", path: "/staff/quality" },
          { role: "vendor", title: "Profile", path: "/staff/profile" },
          { role: "manager", title: "Orders", path: "/manager/orders" },
          { role: "manager", title: "Payouts", path: "/manager/payouts" },
          { role: "manager", title: "Profile", path: "/manager/profile" },
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
}
