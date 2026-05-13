import type { Express } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { Order } from "@shared/schema";
import { insertMessageSchema } from "@shared/schema";
import { storage, db, logStripeReconciliation } from "../storage";
import { pricingConfig } from "../pricing-config-service";
import { logAdminAction } from "../audit-helpers";
import {
  getStripe, hasStripe as hasStripeKey, dollarsToCents, centsToDollars,
} from "../lib/stripe";
import { issueStripeRefundForOrder } from "../lib/refund";
import { requireAuth, isAdminOrManager } from "../session";
import {
  now, notifyAndEmit, canAccessOrder, getOrderOwnershipAllowed, emitToOrder,
} from "../engines";

export function registerCommsRoutes(app: Express) {

  const hasStripe = hasStripeKey();
  const stripe = getStripe();

  // P2-047: refund helpers imported from server/lib/refund.ts

  // ═══════════════════════════════════════════════════════════════
  //  REAL-TIME MESSAGING ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  // ── Get messages for an order ──
  app.get("/api/messages/:orderId", requireAuth(), async (req, res) => {
    const orderId = Number(String(req.params.orderId));
    const order = await storage.getOrder(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // F13: full ownership.
    const cu = (req as any).currentUser;
    if (!(await canAccessOrder(order, cu))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const messages = await storage.getMessagesByOrder(orderId);
    res.json(messages);
  });

  // ── Send a message ──
  app.post("/api/messages", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const MessageBody = insertMessageSchema.pick({ orderId: true, content: true, messageType: true });
    const parsed = MessageBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const { orderId, content, messageType } = parsed.data;

    if (!content || !orderId) {
      return res.status(400).json({ error: "orderId and content are required" });
    }

    // Security: ownership check + sender auth from token (not request body)
    const order = await storage.getOrder(Number(orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });
    const driverRec = currentUser.role === "driver" ? await storage.getDriverByUserId(currentUser.id) : null;
    const vendorRec = ["laundromat","vendor"].includes(currentUser.role) ? (await storage.getVendorByUserId(currentUser.id)) ?? (order.vendorId ? await storage.getVendor(order.vendorId) : null) : null;
    if (!getOrderOwnershipAllowed(order, currentUser, driverRec, vendorRec)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const message = await storage.createMessage({
      orderId,
      conversationId: `order-${orderId}`,
      senderId: currentUser.id,
      senderRole: currentUser.role,
      content,
      messageType: messageType || "text",
      timestamp: now(),
    });

    // Emit via Socket.io to the order room
    emitToOrder(orderId, "new_message", message);

    // Notify the other party (reuse `order` from ownership check above)
    if (order) {
      // Determine who to notify based on sender role
      if (currentUser.role === "customer" && order.driverId) {
        const driverNotif = await storage.getDriver(order.driverId);
        if (driverNotif) {
          await notifyAndEmit(driverNotif.userId, orderId, "new_message",
            "New Message", `${(currentUser as any).name}: ${content.substring(0, 50)}`, `/driver/order/${orderId}`);
        }
      } else if (currentUser.role === "driver") {
        await notifyAndEmit(order.customerId, orderId, "new_message",
          "New Message", `Driver: ${content.substring(0, 50)}`, `/orders/${orderId}`);
      }
    }

    res.status(201).json(message);
  });

  // ── Mark message as read ──
  app.patch("/api/messages/:id/read", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    // First get the message to check ownership
    const existing = await storage.getMessage(Number(String(req.params.id)));
    if (!existing) return res.status(404).json({ error: "Message not found" });
    // P2-011: verify ownership — if orderId is null, only sender/recipient can access
    if (existing.orderId) {
      const order = await storage.getOrder(existing.orderId);
      if (order && !(await canAccessOrder(order, currentUser))) {
        return res.status(403).json({ error: "Forbidden" });
      }
    } else {
      // No order context — only the message sender or recipient can mark it read
      if (existing.senderId !== currentUser.id && (existing as any).recipientId !== currentUser.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }
    const message = await storage.markMessageRead(Number(String(req.params.id)));
    if (!message) return res.status(404).json({ error: "Message not found" });

    // Emit read receipt
    if (message.orderId) {
      emitToOrder(message.orderId, "message_read", {
        messageId: message.id,
        readAt: message.readAt,
      });
    }

    res.json(message);
  });

  // ── Get conversations for current user ──
  app.get("/api/conversations", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    let userOrders: Order[];

    if (currentUser.role === "customer") {
      userOrders = await storage.getOrdersByCustomer(currentUser.id);
    } else if (currentUser.role === "driver") {
      const driver = await storage.getDriverByUserId(currentUser.id);
      userOrders = driver ? await storage.getOrdersByDriver(driver.id) : [];
    } else {
      userOrders = await storage.getActiveOrders();
    }

    // Build conversation list with latest message per order
    const conversationRaw = await Promise.all(
      userOrders
        .filter(o => !["cancelled"].includes(o.status))
        .map(async order => {
          const messages = await storage.getMessagesByOrder(order.id);
          const lastMessage = messages[messages.length - 1];
          const unreadCount = messages.filter(m => !m.readAt && m.senderId !== currentUser.id).length;
          return {
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            lastMessage: lastMessage ? {
              content: lastMessage.content,
              timestamp: lastMessage.timestamp,
              senderRole: lastMessage.senderRole,
            } : null,
            unreadCount,
          };
        })
    );
    const conversations = conversationRaw
      .filter(c => c.lastMessage)
      .sort((a, b) => {
        const ta = a.lastMessage?.timestamp || "";
        const tb = b.lastMessage?.timestamp || "";
        return tb.localeCompare(ta);
      });

    res.json(conversations);
  });

  // =====================================================================
  //  PHASE 6: RECEIPTS, REFUND FLOW, EMAIL/SMS COMMUNICATIONS
  // =====================================================================

  // ── Generate receipt for an order ──
  app.get("/api/orders/:id/receipt", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });
    // S1 IDOR fix: only the order's customer, the assigned vendor/laundromat,
    // an admin or a manager may pull the receipt.
    {
      const role = currentUser.role;
      const isStaff = ["admin", "manager"].includes(role);
      let allowed = isStaff || order.customerId === currentUser.id;
      if (!allowed && (role === "laundromat" || role === "vendor") && order.vendorId) {
        const myVendor = await storage.getVendorByUserId(currentUser.id);
        if (myVendor && myVendor.id === order.vendorId) allowed = true;
      }
      if (!allowed) return res.status(403).json({ error: "Forbidden" });
    }
    if (!["delivered", "completed"].includes(order.status)) {
      return res.status(400).json({ error: "Receipt only available for completed orders" });
    }

    const transactions = await storage.getPaymentTransactionsByOrder(order.id);
    const chargeTxn = transactions.find(t => t.type === "charge" && t.status === "completed");
    const refundTxns = transactions.filter(t => t.type === "refund");
    const totalRefunded = refundTxns.reduce((sum, t) => sum + (t.amount || 0), 0);

    // Parse line items from the order's details or from associated quote
    let lineItems: any[] = [];
    try {
      const details = order.preferences ? JSON.parse(order.preferences as string) : {};
      if (details.lineItems) lineItems = details.lineItems;
    } catch { /* ignore */ }

    const receipt = {
      receiptNumber: `RCT-${order.orderNumber}`,
      orderNumber: order.orderNumber,
      orderId: order.id,
      customerId: order.customerId,
      issuedAt: now(),
      orderDate: order.createdAt,
      completedDate: order.deliveredAt || order.updatedAt,
      pickupAddress: order.pickupAddress,
      deliveryAddress: order.deliveryAddress || order.pickupAddress,
      lineItems,
      subtotal: order.subtotal || order.total || 0,
      tax: order.tax || 0,
      taxRate: await pricingConfig.getTaxRate(),
      deliveryFee: order.deliveryFee || 0,
      discount: order.discount || 0,
      total: order.finalPrice || order.total || 0,
      amountPaid: chargeTxn?.amount || order.finalPrice || order.total || 0,
      amountRefunded: totalRefunded,
      netCharged: (chargeTxn?.amount || 0) - totalRefunded,
      paymentMethod: chargeTxn?.stripePaymentIntentId?.startsWith("pi_demo") ? "Demo Payment" : "Credit Card",
      paymentStatus: order.paymentStatus,
      transactionId: chargeTxn?.stripePaymentIntentId || null,
      company: {
        name: "Offload USA",
        address: "New York, NY",
        email: "support@offloadusa.com",
        website: "https://offloadusa.com",
      },
    };

    res.json(receipt);
  });

  // ── Email/SMS communication stubs ──
  // These log communications and will be wired to real providers (SendGrid/Twilio)
  const communicationLog: any[] = [];

  app.post("/api/communications/send", requireAuth(["admin", "system"]), async (req, res) => {
    const CommunicationBody = z.object({ recipientId: z.number(), channel: z.string().min(1), templateName: z.string().min(1), templateData: z.any().optional(), orderId: z.number().optional() }).strip();
    const parsedComm = CommunicationBody.safeParse(req.body);
    if (!parsedComm.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedComm.error.issues });
    }
    const { recipientId, channel, templateName, templateData, orderId } = parsedComm.data;
    if (!recipientId || !channel || !templateName) {
      return res.status(400).json({ error: "recipientId, channel, and templateName required" });
    }
    if (!["email", "sms", "push", "in_app"].includes(channel)) {
      return res.status(400).json({ error: "channel must be email, sms, push, or in_app" });
    }

    // Template registry
    const templates: Record<string, { subject?: string; body: string }> = {
      order_confirmation: {
        subject: "Your Offload order is confirmed!",
        body: "Hi {{name}}, your order {{orderNumber}} has been confirmed. Pickup: {{pickupDate}} {{pickupTime}}. Total: ${{total}}.",
      },
      driver_assigned: {
        subject: "Driver on the way!",
        body: "Hi {{name}}, {{driverName}} is heading to pick up your laundry. ETA: {{eta}}.",
      },
      order_complete: {
        subject: "Your laundry is delivered!",
        body: "Hi {{name}}, your order {{orderNumber}} has been delivered. Final total: ${{total}}. Rate your experience at offloadusa.com.",
      },
      payment_receipt: {
        subject: "Payment receipt for order {{orderNumber}}",
        body: "Hi {{name}}, payment of ${{total}} has been received for order {{orderNumber}}. Thank you!",
      },
      quote_ready: {
        subject: "Your Offload quote is ready",
        body: "Hi {{name}}, your quote {{quoteNumber}} for ${{total}} is ready. Accept within {{expiry}} minutes.",
      },
      quote_expired: {
        subject: "Your quote has expired",
        body: "Hi {{name}}, your quote {{quoteNumber}} has expired. Request a new quote at offloadusa.com.",
      },
      refund_issued: {
        subject: "Refund issued for order {{orderNumber}}",
        body: "Hi {{name}}, a refund of ${{refundAmount}} has been issued for order {{orderNumber}}. Allow 3-5 business days.",
      },
    };

    const template = templates[templateName];
    if (!template) return res.status(400).json({ error: `Unknown template: ${templateName}` });

    // Interpolate template
    let body = template.body;
    let subject = template.subject || "";
    if (templateData) {
      // P2-049: replaced .forEach(async ...) — these are synchronous ops
      for (const [k, v] of Object.entries(templateData)) {
        body = body.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        subject = subject.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      }
    }

    const entry = {
      id: communicationLog.length + 1,
      recipientId,
      channel,
      templateName,
      subject,
      body,
      orderId: orderId || null,
      status: "sent",  // In production: "queued" → provider confirms "sent"/"delivered"/"failed"
      sentAt: now(),
      provider: channel === "email" ? "sendgrid" : channel === "sms" ? "twilio" : "internal",
    };
    communicationLog.push(entry);

    // Also create notification for in-app
    if (channel === "in_app" || channel === "push") {
      await storage.createNotification({
        userId: Number(recipientId),
        orderId: orderId ? Number(orderId) : null,
        type: templateName,
        title: subject || templateName,
        body,
        read: false,
        category: channel,
        createdAt: now(),
      });
    }

    res.status(201).json(entry);
  });

  app.get("/api/communications/log", requireAuth(["admin"]), (req, res) => {
    const { orderId, channel, limit } = req.query;
    let filtered = communicationLog;
    if (orderId) filtered = filtered.filter(c => c.orderId === Number(orderId));
    if (channel) filtered = filtered.filter(c => c.channel === channel);
    const max = Math.min(Number(limit) || 100, 500);
    res.json(filtered.slice(-max));
  });

  // ── Enhanced refund with reason codes and partial refund support ──
  app.post("/api/payments/partial-refund", requireAuth(["admin", "manager"]), async (req, res) => {
    // P2-024: renamed amount → amountCents with .int() constraint
    const PartialRefundBody = z.object({
      orderId: z.number(),
      amountCents: z.number().int().nonnegative(),
      reasonCode: z.enum(["damaged_items", "late_delivery", "wrong_items", "quality_issue", "customer_request", "overcharge", "other"]).optional(),
      notes: z.string().optional(),
    }).strip();
    const parsedPR = PartialRefundBody.safeParse(req.body);
    if (!parsedPR.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedPR.error.issues });
    }
    const { orderId, amountCents, reasonCode, notes } = parsedPR.data;

    const order = await storage.getOrder(Number(orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const result = await issueStripeRefundForOrder(order, amountCents, reasonCode === "overcharge" ? "duplicate" : "requested_by_customer", `refund-${order.id}-${Date.now()}`);
    if ("errorStatus" in result) {
      return res.status(result.errorStatus as number).json(result);
    }
    logAdminAction(req, { action: "payment.partial_refund", entityType: "order", entityId: order.id, newValue: { amountCents, reasonCode, notes } });

    res.json({
      refundId: result.txn.id,
      stripeRefundId: result.stripeRefundId,
      amount: result.amount,
      amountCents: result.amountCents,
      reasonCode,
      notes,
      remainingRefundable: result.remainingRefundable,
      totalRefunded: result.totalRefunded,
      paymentStatus: result.paymentStatus,
      demoMode: !hasStripe,
    });
  });

  // ── Quote-to-payment bridge: create payment intent from accepted quote ──
  app.post("/api/quotes/:id/create-payment", requireAuth(), async (req, res) => {
    const quote = await storage.getQuote(Number(String(req.params.id)));
    if (!quote) return res.status(404).json({ error: "Quote not found" });
    if (quote.status !== "accepted") {
      return res.status(400).json({ error: "Quote must be accepted before payment" });
    }

    const currentUser = (req as any).currentUser;
    if (quote.customerId !== currentUser.id && !isAdminOrManager(currentUser)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const amount = Number(quote.total);
    const amountCents = dollarsToCents(amount);
    if (amountCents <= 0) return res.status(400).json({ error: "Quote total must be positive" });

    let paymentIntentId: string;
    let clientSecret: string | null = null;
    if (stripe && !(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_DISABLED")) {
      try {
        const intent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: "usd",
          metadata: { quoteId: String(quote.id), quoteNumber: quote.quoteNumber, customerId: String(quote.customerId || "") },
        }, { idempotencyKey: `quote-${quote.id}-intent` });
        paymentIntentId = intent.id;
        clientSecret = intent.client_secret;
      } catch (err: any) {
        console.error("[Stripe] Quote payment intent creation failed:", err.message);
        return res.status(500).json({ error: "Payment processing failed" });
      }
    } else {
      return res.status(503).json({ error: "payments_unavailable" });
    }

    // Update quote status to indicate payment initiated
    await storage.updateQuote(quote.id, { status: "payment_pending", updatedAt: now() });

    res.json({
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      paymentIntentId,
      clientSecret,
      amount,
      amountCents,
      demoMode: !hasStripe,
    });
  });

  // =====================================================================
  //  PHASE 8: ENHANCED HEALTH CHECK, FEATURE FLAGS, ENV CONFIG
  // =====================================================================

  // ── Feature flags ──
  const FEATURE_FLAGS: Record<string, { enabled: boolean; description: string; rolloutPercent: number }> = {
    real_payments: { enabled: hasStripe, description: "Process real Stripe payments vs demo mode", rolloutPercent: hasStripe ? 100 : 0 },
    quote_flow: { enabled: true, description: "Enable quote-first order flow (quote → accept → pay → order)", rolloutPercent: 100 },
    surge_pricing: { enabled: true, description: "Dynamic surge pricing during holidays/peak demand", rolloutPercent: 100 },
    preferred_vendor: { enabled: true, description: "Allow customers to choose preferred vendor with surcharge", rolloutPercent: 100 },
    ai_chat: { enabled: true, description: "AI-powered customer support chatbot", rolloutPercent: 100 },
    gps_tracking: { enabled: true, description: "Real-time driver GPS tracking", rolloutPercent: 100 },
    photo_evidence: { enabled: true, description: "Before/after photo capture for orders", rolloutPercent: 100 },
    subscription_tiers: { enabled: true, description: "Monthly subscription plans with discounts", rolloutPercent: 100 },
    email_notifications: { enabled: !!process.env.RESEND_API_KEY, description: "Email notifications via Resend (or SendGrid fallback)", rolloutPercent: process.env.RESEND_API_KEY ? 100 : 0 },
    sms_notifications: { enabled: false, description: "Twilio SMS notifications (requires TWILIO_SID)", rolloutPercent: 0 },
    weight_reconciliation: { enabled: true, description: "Dirty→clean weight comparison for quality assurance", rolloutPercent: 100 },
    fraud_detection: { enabled: true, description: "AI-based fraud detection on orders", rolloutPercent: 100 },
  };

  function getFeatureFlags() { return FEATURE_FLAGS; }

  // ── Deep health check (enhanced) ──
  app.get("/api/health/deep", requireAuth(["admin", "manager"]), async (_req, res) => {
    const startMs = Date.now();
    try {
      // DB connectivity check
      const allOrders = await storage.getOrders();
      const allVendors = await storage.getVendors();
      const allDrivers = await storage.getDrivers();
      const activeOrders = allOrders.filter(o => !["completed", "cancelled", "quote_expired"].includes(o.status));

      // Memory usage
      const mem = process.memoryUsage();

      res.json({
        status: "healthy",
        version: process.env.APP_VERSION || "1.0.0",
        environment: process.env.NODE_ENV || "development",
        timestamp: now(),
        uptime: Math.round(process.uptime()),
        responseTimeMs: Date.now() - startMs,
        database: {
          status: "connected",
          engine: "sqlite",
          counts: {
            orders: allOrders.length,
            activeOrders: activeOrders.length,
            vendors: allVendors.length,
            drivers: allDrivers.length,
          },
        },
        payments: {
          stripeConnected: hasStripe,
          mode: hasStripe ? "live" : "demo",
        },
        memory: {
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
          rssMB: Math.round(mem.rss / 1024 / 1024),
        },
        features: getFeatureFlags(),
      });
    } catch (err: any) {
      console.error("[health/deep] error:", err);
      res.status(503).json({
        status: "unhealthy",
        error: "Health check failed",
        timestamp: now(),
      });
    }
  });

  app.get("/api/feature-flags", requireAuth(["admin", "manager"]), (_req, res) => {
    res.json(FEATURE_FLAGS);
  });

  app.put("/api/feature-flags/:flag", requireAuth(["admin"]), async (req, res) => {
    const flag = String(req.params.flag);
    if (!FEATURE_FLAGS[flag]) return res.status(404).json({ error: `Unknown feature flag: ${flag}` });

    const FlagBody = z.object({ enabled: z.boolean().optional(), rolloutPercent: z.number().min(0).max(100).optional() });
    const parsed = FlagBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const { enabled, rolloutPercent } = parsed.data;
    const oldFlags = { enabled: FEATURE_FLAGS[flag].enabled, rolloutPercent: FEATURE_FLAGS[flag].rolloutPercent };
    if (typeof enabled === "boolean") FEATURE_FLAGS[flag].enabled = enabled;
    if (typeof rolloutPercent === "number") FEATURE_FLAGS[flag].rolloutPercent = Math.max(0, Math.min(100, rolloutPercent));
    logAdminAction(req, { action: "feature_flag.update", entityType: "feature_flag", entityId: flag, oldValue: oldFlags, newValue: { enabled: FEATURE_FLAGS[flag].enabled, rolloutPercent: FEATURE_FLAGS[flag].rolloutPercent } });

    await storage.createPricingAuditEntry({
      action: "feature_flag_updated",
      details: JSON.stringify({ flag, enabled: FEATURE_FLAGS[flag].enabled, rolloutPercent: FEATURE_FLAGS[flag].rolloutPercent }),
      actorId: (req as any).currentUser?.id,
      actorRole: (req as any).currentUser?.role || "admin",
      timestamp: now(),
    });

    res.json({ flag, ...FEATURE_FLAGS[flag] });
  });

  // ── Environment info (admin only) ──
  app.get("/api/env", requireAuth(["admin"]), (_req, res) => {
    res.json({
      nodeEnv: process.env.NODE_ENV || "development",
      appVersion: process.env.APP_VERSION || "1.0.0",
      port: process.env.PORT || 5000,
      stripeConfigured: hasStripe,
      resendConfigured: !!process.env.RESEND_API_KEY,
      sendgridConfigured: !!process.env.SENDGRID_API_KEY,
      twilioConfigured: !!process.env.TWILIO_ACCOUNT_SID,
      databaseEngine: "postgres",
      uptime: Math.round(process.uptime()),
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    });
  });

}
