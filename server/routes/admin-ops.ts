import type { Express } from "express";
import { z } from "zod";
import { SUBSCRIPTION_TIERS } from "@shared/schema";
import { storage, pool } from "../storage";
import { logAdminAction } from "../audit-helpers";
import { requireAuth } from "../session";
import {
  now, notifyUser,
  detectIntent, generateAIResponse,
  calculateVendorHealthScore, calculateFraudRisk,
} from "../engines";

export function registerAdminOpsRoutes(app: Express) {
  // ─────────────────────────────────────────────────────────
  //  AI CHATBOT
  // ─────────────────────────────────────────────────────────

  app.post("/api/chat/message", requireAuth(), async (req, res) => {
    const ChatMessageBody = z.object({ message: z.string().min(1), sessionId: z.number().optional() }).strip();
    const parsedChatMsg = ChatMessageBody.safeParse(req.body);
    if (!parsedChatMsg.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedChatMsg.error.issues });
    }
    const { message, sessionId } = parsedChatMsg.data;
    const currentUser = (req as any).currentUser;
    const userId = currentUser.id;
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const intent = detectIntent(message);
    const { response, resolved, escalate } = await generateAIResponse(intent, userId, message);

    const ts_ = now();

    // Find or create session
    let session;
    if (sessionId) {
      session = await storage.getChatSession(Number(sessionId));
      if (session && session.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    if (!session) {
      // Create new session
      const newMessages = [
        { role: "user", content: message, timestamp: ts_ },
        { role: "assistant", content: response, timestamp: ts_, intent },
      ];
      session = await storage.createChatSession({
        userId,
        status: resolved ? "resolved" : escalate ? "escalated" : "active",
        topic: intent,
        aiResolved: !!resolved,
        messagesJson: JSON.stringify(newMessages),
        createdAt: ts_,
        resolvedAt: resolved ? ts_ : undefined,
      });
    } else {
      // Append to existing session
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

    // Also store as messages
    await storage.createMessage({
      conversationId: `chat-${session.id}`,
      senderId: userId,
      senderRole: "customer",
      content: message,
      messageType: "text",
      timestamp: ts_,
    });
    await storage.createMessage({
      conversationId: `chat-${session.id}`,
      senderId: 0, // AI
      senderRole: "ai",
      content: response,
      messageType: "ai_response",
      isAiGenerated: true,
      timestamp: ts_,
    });

    if (escalate) {
      const admins = await storage.getUsersByRole("admin");
      // P2-049: replaced .forEach(async ...) with for...of
      for (const admin of admins) {
        await notifyUser(admin.id, null, "system",
          "Chat Escalation",
          `Customer chat session requires human attention. Topic: ${intent}`,
          "/admin/support"
        );
      }
    }

    res.json({
      sessionId: session.id,
      intent,
      response,
      resolved,
      escalated: escalate,
      timestamp: ts_,
    });
  });

  app.get("/api/chat/sessions/:userId", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    if (Number(String(req.params.userId)) !== currentUser.id && !["admin", "manager"].includes(currentUser.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const userId = Number(String(req.params.userId));
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const sessions = await storage.getChatSessions(userId);
    res.json({
      userId,
      totalSessions: sessions.length,
      resolvedSessions: sessions.filter(s => s.aiResolved).length,
      escalatedSessions: sessions.filter(s => s.status === "escalated").length,
      sessions: sessions.map(s => ({
        ...s,
        messages: (() => { try { return s.messagesJson ? JSON.parse(s.messagesJson) : []; } catch (_) { return []; } })(),
      })),
    });
  });

  app.get("/api/chat/sessions/:userId/:sessionId", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    // Ownership check: user can only view their own chat sessions
    if (Number(String(req.params.userId)) !== currentUser.id && !["admin", "manager"].includes(currentUser.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const session = await storage.getChatSession(Number(String(req.params.sessionId)));
    if (!session) return res.status(404).json({ error: "Session not found" });
    // Verify session belongs to the requested user
    if (session.userId !== Number(String(req.params.userId)) && !["admin", "manager"].includes(currentUser.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json({
      ...session,
      messages: (() => { try { return session.messagesJson ? JSON.parse(session.messagesJson) : []; } catch (_) { return []; } })(),
    });
  });

  // ─────────────────────────────────────────────────────────
  //  ADMIN SUPPORT INBOX
  // ─────────────────────────────────────────────────────────

  // List all escalated/active chat sessions for admin support inbox
  app.get("/api/admin/support-sessions", requireAuth(["admin", "manager", "support"]), async (_req, res) => {
    const sessions = await storage.getAllSupportSessions();
    const enriched = await Promise.all(sessions.map(async (s) => {
      const user = await storage.getUser(s.userId);
      return {
        ...s,
        messages: (() => { try { return s.messagesJson ? JSON.parse(s.messagesJson) : []; } catch (_) { return []; } })(),
        customerName: user?.name || user?.email || `User #${s.userId}`,
        customerEmail: user?.email || null,
      };
    }));
    res.json(enriched);
  });

  // Admin reply to a chat session
  app.post("/api/chat/sessions/:id/reply", requireAuth(["admin", "manager", "support"]), async (req, res) => {
    const ReplyBody = z.object({ content: z.string().min(1) }).strip();
    const parsed = ReplyBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const sessionId = Number(String(req.params.id));
    const session = await storage.getChatSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const currentUser = (req as any).currentUser;
    const ts = now();
    const existingMessages = (() => { try { return session.messagesJson ? JSON.parse(session.messagesJson) : []; } catch (_) { return []; } })();
    existingMessages.push({
      role: "admin",
      content: parsed.data.content,
      timestamp: ts,
      adminId: currentUser.id,
      adminName: currentUser.name || currentUser.email,
    });

    await storage.updateChatSession(sessionId, {
      messagesJson: JSON.stringify(existingMessages),
      escalatedTo: currentUser.id,
    });

    // Notify the customer
    await notifyUser(session.userId, session.orderId, "system",
      "Support Reply",
      parsed.data.content,
      session.orderId ? `/orders/${session.orderId}` : "/chat"
    );

    logAdminAction(req, { action: "support.reply", entityType: "chat_session", entityId: sessionId, newValue: { content: parsed.data.content } });
    res.json({ success: true, sessionId, messagesCount: existingMessages.length });
  });

  // ─────────────────────────────────────────────────────────
  //  STRIPE RECONCILIATION ADMIN
  // ─────────────────────────────────────────────────────────

  app.get("/api/admin/stripe-reconciliation", requireAuth(["admin", "manager", "support"]), async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const showResolved = req.query.resolved === "true";

    const whereClause = showResolved ? "" : "WHERE resolved_at IS NULL";
    const [rows, countResult] = await Promise.all([
      pool.query(
        `SELECT * FROM stripe_reconciliation_log ${whereClause} ORDER BY recorded_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query(`SELECT COUNT(*) AS total FROM stripe_reconciliation_log ${whereClause}`),
    ]);

    res.json({
      entries: rows.rows,
      page,
      limit,
      total: Number(countResult.rows[0].total),
    });
  });

  app.post("/api/admin/stripe-reconciliation/:id/resolve", requireAuth(["admin", "manager"]), async (req, res) => {
    const ResolveBody = z.object({ notes: z.string().optional() }).strip();
    const parsed = ResolveBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const id = Number(req.params.id);
    const existing = await pool.query(`SELECT * FROM stripe_reconciliation_log WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Reconciliation entry not found" });
    }
    const entry = existing.rows[0];
    const updatedNotes = parsed.data.notes
      ? (entry.notes ? entry.notes + "\n---\n" + parsed.data.notes : parsed.data.notes)
      : entry.notes;

    await pool.query(
      `UPDATE stripe_reconciliation_log SET resolved_at = $1, notes = $2 WHERE id = $3`,
      [new Date().toISOString(), updatedNotes, id]
    );

    logAdminAction(req, { action: "stripe_reconciliation.resolve", entityType: "stripe_reconciliation_log", entityId: id, newValue: { notes: parsed.data.notes } });

    res.json({ success: true, id, resolved_at: new Date().toISOString() });
  });

  // ─────────────────────────────────────────────────────────
  //  VENDOR SCORING (AI Health)
  // ─────────────────────────────────────────────────────────

  app.get("/api/admin/vendor-scores", requireAuth(["admin"]), async (_req, res) => {
    const vendors = await storage.getVendors();
    const scored = (await Promise.all(vendors.map(async vendor => {
      const health = calculateVendorHealthScore(vendor);
      const stats = await storage.getVendorStats(vendor.id);
      // Update stored score
      await storage.updateVendor(vendor.id, { aiHealthScore: health.score });
      return {
        id: vendor.id,
        name: vendor.name,
        city: vendor.city,
        status: vendor.status,
        performanceTier: vendor.performanceTier,
        aiHealthScore: health.score,
        breakdown: health.breakdown,
        recommendations: health.recommendations,
        stats: {
          totalOrders: stats.totalOrders,
          completedOrders: stats.completedOrders,
          activeOrders: stats.activeOrders,
          avgRating: stats.avgRating,
          totalRevenue: stats.totalRevenue,
        },
        capacityUtilization: Math.round(((vendor.currentLoad || 0) / (vendor.capacity || 50)) * 100),
        rating: vendor.rating,
        onTimeRate: vendor.onTimeRate,
        disputeRate: vendor.disputeRate,
        avgProcessingTime: vendor.avgProcessingTime,
      };
    }))).sort((a, b) => b.aiHealthScore - a.aiHealthScore);

    const eliteCount = scored.filter(v => v.performanceTier === "elite").length;
    const atRiskCount = scored.filter(v => v.aiHealthScore < 60).length;
    const avgOnTime = scored.length > 0 ? scored.reduce((sum, v) => sum + ((v.onTimeRate || 0) * 100), 0) / scored.length : 0;

    res.json({
      total: scored.length,
      avgScore: scored.length > 0 ? Math.round(scored.reduce((sum, v) => sum + v.aiHealthScore, 0) / scored.length * 10) / 10 : 0,
      avgHealthScore: scored.length > 0 ? Math.round(scored.reduce((sum, v) => sum + v.aiHealthScore, 0) / scored.length * 10) / 10 : 0,
      eliteVendors: eliteCount,
      atRiskVendors: atRiskCount,
      avgOnTimeRate: Math.round(avgOnTime * 10) / 10,
      vendors: scored.map(v => ({
        ...v,
        healthScore: v.aiHealthScore,
        tier: v.performanceTier || "standard",
        onTimeRate: Math.round((v.onTimeRate || 0) * 100),
        disputeRate: Math.round((v.disputeRate || 0) * 100 * 10) / 10,
      })),
    });
  });

  app.get("/api/admin/vendor-health/:id", requireAuth(["admin", "manager"]), async (req, res) => {
    const vendor = await storage.getVendor(Number(String(req.params.id)));
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const health = calculateVendorHealthScore(vendor);
    const stats = await storage.getVendorStats(vendor.id);
    const recentOrders = (await storage.getOrdersByVendor(vendor.id)).slice(0, 20);
    const reviews = await storage.getReviewsByVendor(vendor.id);

    // Update stored score
    await storage.updateVendor(vendor.id, { aiHealthScore: health.score });

    // On-time delivery analysis
    const deliveredOrders = recentOrders.filter(o => o.status === "delivered");
    const onTimeCount = deliveredOrders.filter(o => {
      if (!o.deliveredAt || !o.slaDeadline) return true;
      return new Date(o.deliveredAt) <= new Date(o.slaDeadline);
    }).length;

    // Recent trend
    const recentRatings = reviews.slice(0, 10).map(r => r.vendorRating || r.overallRating);
    const recentAvgRating = recentRatings.length > 0
      ? recentRatings.reduce((sum, r) => sum + r, 0) / recentRatings.length
      : 0;

    const previousRatings = reviews.slice(10, 20).map(r => r.vendorRating || r.overallRating);
    const prevAvgRating = previousRatings.length > 0
      ? previousRatings.reduce((sum, r) => sum + r, 0) / previousRatings.length
      : 0;

    res.json({
      vendor: {
        id: vendor.id,
        name: vendor.name,
        address: vendor.address,
        city: vendor.city,
        performanceTier: vendor.performanceTier,
        tier: vendor.performanceTier || "standard",
        status: vendor.status,
        healthScore: health.score,
        rating: vendor.rating,
        onTimeRate: Math.round((vendor.onTimeRate || 0) * 100),
        disputeRate: Math.round((vendor.disputeRate || 0) * 100 * 10) / 10,
        avgProcessingTime: vendor.avgProcessingTime,
      },
      healthScore: health.score,
      breakdown: health.breakdown,
      scoreBreakdown: {
        quality: health.breakdown.rating || 0,
        onTime: health.breakdown.onTimeRate || 0,
        disputes: health.breakdown.disputeRate || 0,
        processing: health.breakdown.processingTime || 0,
        volume: health.breakdown.capacityUtilization || 0,
      },
      recommendations: health.recommendations,
      metrics: {
        rating: vendor.rating,
        onTimeRate: vendor.onTimeRate,
        disputeRate: vendor.disputeRate,
        avgProcessingTimeMinutes: vendor.avgProcessingTime,
        capacityUtilization: Math.round(((vendor.currentLoad || 0) / (vendor.capacity || 50)) * 100),
        currentLoad: vendor.currentLoad,
        capacity: vendor.capacity,
        onTimeCount,
        deliveredOrdersCount: deliveredOrders.length,
      },
      financials: {
        totalEarnings: vendor.totalEarnings,
        pendingPayout: vendor.pendingPayout,
        payoutRate: vendor.payoutRate,
        totalRevenue: stats.totalRevenue,
      },
      trends: {
        ratingTrend: recentAvgRating >= prevAvgRating ? "improving" : "declining",
        recentAvgRating: Math.round(recentAvgRating * 10) / 10,
        previousAvgRating: Math.round(prevAvgRating * 10) / 10,
      },
      recentOrders: recentOrders.slice(0, 5).map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: Number(o.total) || 0,
        createdAt: o.createdAt,
      })),
      recentReviews: reviews.slice(0, 5).map(r => ({
        id: r.id,
        rating: r.overallRating || r.vendorRating || 0,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
    });
  });

  // ─────────────────────────────────────────────────────────
  //  FRAUD DETECTION
  // ─────────────────────────────────────────────────────────

  app.post("/api/admin/fraud-check/:orderId", requireAuth(["admin"]), async (req, res) => {
    const orderId = Number(String(req.params.orderId));
    const order = await storage.getOrder(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const result = await calculateFraudRisk(orderId);

    // If auto-flagged, add event
    if (result.autoFlagged) {
      await storage.createOrderEvent({
        orderId,
        eventType: "fraud_reviewed",
        description: `Manual fraud review: risk score ${result.riskScore}/100`,
        actorRole: "admin",
        timestamp: now(),
      });
    }

    res.json({
      orderId,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      orderTotal: order.total,
      riskScore: result.riskScore,
      riskLevel: result.riskScore >= 70 ? "high" : result.riskScore >= 40 ? "medium" : "low",
      flags: result.flags,
      autoFlagged: result.autoFlagged,
      recommendation: result.riskScore >= 70
        ? "Manually review before processing. Consider additional verification."
        : result.riskScore >= 40
        ? "Monitor this order closely."
        : "Order appears legitimate.",
      timestamp: now(),
    });
  });

  // Bulk fraud scan
  app.get("/api/admin/fraud-scan", requireAuth(["admin"]), async (_req, res) => {
    const activeOrders = await storage.getActiveOrders();
    const results = (await Promise.all(activeOrders.map(async order => {
      const fraud = await calculateFraudRisk(order.id);
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        total: order.total,
        riskScore: fraud.riskScore,
        riskLevel: fraud.riskScore >= 70 ? "high" : fraud.riskScore >= 40 ? "medium" : "low",
        flags: fraud.flags,
        autoFlagged: fraud.autoFlagged,
      };
    }))).filter(r => r.riskScore > 0).sort((a, b) => b.riskScore - a.riskScore);

    res.json({
      scanned: activeOrders.length,
      flagged: results.filter(r => r.autoFlagged).length,
      highRisk: results.filter(r => r.riskLevel === "high").length,
      mediumRisk: results.filter(r => r.riskLevel === "medium").length,
      results,
    });
  });

  // Admin: Fraud alerts (matching frontend FraudSummary interface)
  app.get("/api/admin/fraud-alerts", requireAuth(["admin"]), async (_req, res) => {
    const allOrders = await storage.getOrders();
    const alerts = (await Promise.all(allOrders.map(async order => {
      const fraud = await calculateFraudRisk(order.id);
      if (fraud.riskScore <= 10) return null;
      const customer = await storage.getUser(order.customerId);
      return {
        id: order.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerName: customer?.name || "Unknown",
        riskScore: fraud.riskScore,
        riskLevel: fraud.riskScore >= 70 ? "high" : fraud.riskScore >= 40 ? "medium" : "low" as "high" | "medium" | "low",
        flags: fraud.flags,
        status: fraud.autoFlagged ? "flagged" : "cleared" as "flagged" | "cleared" | "escalated",
        amount: Number(order.total) || 0,
        createdAt: order.createdAt,
      };
    }))).filter(Boolean).sort((a: any, b: any) => b.riskScore - a.riskScore);

    const flaggedAlerts = alerts.filter((a: any) => a.status === "flagged");
    res.json({
      totalFlagged: flaggedAlerts.length,
      highRisk: alerts.filter((a: any) => a.riskLevel === "high").length,
      mediumRisk: alerts.filter((a: any) => a.riskLevel === "medium").length,
      cleared: alerts.filter((a: any) => a.status === "cleared").length,
      alerts,
    });
  });

  // Fraud alert actions
  app.post("/api/admin/fraud-alerts/:alertId/clear", requireAuth(["admin"]), (req, res) => {
    logAdminAction(req, { action: "fraud_alert.clear", entityType: "fraud_alert", entityId: String(req.params.alertId) });
    res.json({ success: true, message: "Alert cleared" });
  });

  app.post("/api/admin/fraud-alerts/:alertId/escalate", requireAuth(["admin"]), (req, res) => {
    logAdminAction(req, { action: "fraud_alert.escalate", entityType: "fraud_alert", entityId: String(req.params.alertId) });
    res.json({ success: true, message: "Alert escalated" });
  });

  // ─────────────────────────────────────────────────────────
  //  SUBSCRIPTION MANAGEMENT
  // ─────────────────────────────────────────────────────────

  app.get("/api/subscription/:userId", requireAuth(), async (req, res) => {
    const cuSub = (req as any).currentUser;
    if (cuSub.role !== "admin" && cuSub.role !== "manager" && cuSub.id !== Number(String(req.params.userId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const userId = Number(String(req.params.userId));
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const tier = user.subscriptionTier;
    if (!tier || !SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS]) {
      return res.json({
        userId,
        subscriptionTier: null,
        active: false,
        message: "No active subscription",
        availablePlans: Object.entries(SUBSCRIPTION_TIERS).map(([name, info]) => ({
          name,
          ...info,
          pricePerMonth: info.price,
        })),
      });
    }

    const tierInfo = SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS];
    const isActive = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) > new Date() : false;

    res.json({
      userId,
      subscriptionTier: tier,
      active: isActive,
      startDate: user.subscriptionStartDate,
      endDate: user.subscriptionEndDate,
      benefits: {
        price: tierInfo.price,
        freeDeliveries: tierInfo.freeDeliveries,
        discount: `${tierInfo.discount * 100}%`,
        pointsBonus: `${tierInfo.pointsBonus}x`,
        prioritySupport: (tierInfo as any).prioritySupport || false,
      },
      nextRenewal: user.subscriptionEndDate,
      availableUpgrades: Object.entries(SUBSCRIPTION_TIERS)
        .filter(([name]) => name !== tier)
        .map(([name, info]) => ({
          name,
          price: info.price,
          freeDeliveries: info.freeDeliveries,
          discount: `${info.discount * 100}%`,
          pointsBonus: `${info.pointsBonus}x`,
        })),
    });
  });

  app.post("/api/subscription/upgrade", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const userId = currentUser.id;
    const SubscriptionBody = z.object({ tier: z.string().min(1) }).strip();
    const parsedSubscription = SubscriptionBody.safeParse(req.body);
    if (!parsedSubscription.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedSubscription.error.issues });
    }
    const { tier } = parsedSubscription.data;
    if (!tier) {
      return res.status(400).json({ error: "tier is required" });
    }
    if (!SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS]) {
      return res.status(400).json({ error: `Invalid tier. Must be: ${Object.keys(SUBSCRIPTION_TIERS).join(", ")}` });
    }

    const user = await storage.getUser(Number(userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    const tierInfo = SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS];
    const startDate = now();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    const updated = await storage.updateUser(Number(userId), {
      subscriptionTier: tier,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate.toISOString(),
    });

    await notifyUser(Number(userId), null, "system",
      `Subscribed to ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan!`,
      `Your ${tier} plan is now active. Enjoy ${tierInfo.freeDeliveries} free deliveries, ${tierInfo.discount * 100}% off orders, and ${tierInfo.pointsBonus}x loyalty points!`,
      "/profile"
    );

    // Award bonus points for subscribing
    const bonusPoints = tier === "premium" ? 500 : tier === "plus" ? 300 : 150;
    await storage.updateUser(Number(userId), {
      loyaltyPoints: (user.loyaltyPoints || 0) + bonusPoints,
    });
    await storage.createLoyaltyTransaction({
      userId: Number(userId),
      type: "bonus",
      points: bonusPoints,
      description: `${tier} subscription signup bonus`,
      createdAt: startDate,
    });

    res.json({
      success: true,
      subscriptionTier: tier,
      startDate,
      endDate: endDate.toISOString(),
      benefits: tierInfo,
      bonusPointsAwarded: bonusPoints,
      user: { ...updated, password: undefined },
    });
  });

  app.delete("/api/subscription/:userId", requireAuth(), async (req, res) => {
    const cuSubD = (req as any).currentUser;
    if (cuSubD.role !== "admin" && cuSubD.role !== "manager" && cuSubD.id !== Number(String(req.params.userId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const userId = Number(String(req.params.userId));
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.subscriptionTier) {
      return res.status(400).json({ error: "No active subscription to cancel" });
    }

    const updated = await storage.updateUser(userId, {
      subscriptionTier: null,
      subscriptionEndDate: now(), // End immediately
    });

    await notifyUser(userId, null, "system",
      "Subscription Cancelled",
      "Your subscription has been cancelled. You can re-subscribe at any time.",
      "/profile"
    );

    res.json({
      success: true,
      message: "Subscription cancelled",
      user: { ...updated, password: undefined },
    });
  });
}
