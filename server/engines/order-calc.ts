import { randomBytes } from "crypto";
import * as schema from "@shared/schema";
import { storage } from "../storage";
import { sendPushToUser } from "../push";
import { LOYALTY_TIERS } from "@shared/schema";
import type { Order } from "@shared/schema";
import type { Server as SocketIOServer } from "socket.io";

// ════════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════

export function generateOrderNumber(): string {
  const prefix = "OFF";
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString("hex").toUpperCase().substring(0, 4);
  return `${prefix}-${ts}-${rand}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function generateQuoteNumber(): string {
  const prefix = "QT";
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString("hex").toUpperCase().substring(0, 4);
  return `${prefix}-${ts}-${rand}`;
}

// ════════════════════════════════════════════════════════════════
//  NOTIFICATION HELPERS
// ════════════════════════════════════════════════════════════════

export async function notifyUser(userId: number, orderId: number | null, type: string, title: string, body: string, actionUrl?: string) {
  await storage.createNotification({
    userId,
    orderId,
    type,
    title,
    body,
    actionUrl,
    createdAt: now(),
  });
}

export async function notifyOrderUpdate(order: Order, title: string, body: string) {
  await notifyUser(order.customerId, order.id, "order_update", title, body, `/orders/${order.id}`);
  void sendPushToUser(order.customerId, title, body, { orderId: order.id, type: "order_update" });
}

export async function sendOrderStatusSMS(_order: Order, _status: string): Promise<void> {
  return;
}

export async function sendClaimAccountEmail(user: schema.User): Promise<void> {
  const { Resend } = await import("resend");
  const resetToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  await storage.createPasswordResetToken(user.id, resetToken, expiresAt);
  const resetUrl = `https://offloadusa.com/#/reset-password?token=${resetToken}`;
  if (!process.env.RESEND_API_KEY) {
    console.log(`[Email] Would send claim-account email to user#${user.id} (no RESEND_API_KEY)`);
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: "Offload <notifications@offloadusa.com>",
    to: user.email,
    subject: "Welcome to Offload — claim your account",
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;">
      <div style="text-align:center;margin-bottom:24px;"><h1 style="color:#5B4BC4;font-size:24px;margin:0;">Offload</h1></div>
      <h2 style="color:#1A1A1A;font-size:18px;">Claim your account</h2>
      <p style="color:#555;font-size:14px;line-height:1.6;">Hi ${user.name || "there"},</p>
      <p style="color:#555;font-size:14px;line-height:1.6;">We created an Offload account for your checkout. Set your password to track orders and manage preferences.</p>
      <div style="text-align:center;margin:28px 0;"><a href="${resetUrl}" style="background:#5B4BC4;color:#fff;padding:12px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Claim Account</a></div>
      <p style="color:#888;font-size:12px;">This link expires in 1 hour.</p>
    </div>`,
  });
  console.log(`[Email] Claim-account email sent to user#${user.id}: ${(result as any)?.data?.id || (result as any)?.id || "accepted"}`);
}

// Socket.io emit helper — safe no-op when io is not available
let _io: SocketIOServer | undefined;
export function setIO(socketIO?: SocketIOServer) { _io = socketIO; }

export function emitToUser(userId: number, event: string, data: any) {
  if (_io) _io.to(`user:${userId}`).emit(event, data);
}

export function emitToOrder(orderId: number, event: string, data: any) {
  if (_io) _io.to(`order:${orderId}`).emit(event, data);
}

export function emitToRole(role: string, event: string, data: any) {
  if (_io) _io.to(`role:${role}`).emit(event, data);
}

export function emitNotification(userId: number, notification: any) {
  emitToUser(userId, "notification", notification);
}

export async function notifyAndEmit(userId: number, orderId: number | null, type: string, title: string, body: string, actionUrl?: string) {
  const notification = await storage.createNotification({
    userId,
    orderId,
    type,
    title,
    body,
    actionUrl,
    createdAt: now(),
  });
  emitNotification(userId, notification);
  return notification;
}

// ════════════════════════════════════════════════════════════════
//  OWNERSHIP CHECK HELPERS (Security fix — BOLA prevention)
// ════════════════════════════════════════════════════════════════

export function getOrderOwnershipAllowed(order: any, user: any, driverRecord?: any, vendorRecord?: any): boolean {
  const role = user.role;
  if (role === "admin" || role === "manager") return true;
  if (role === "customer" && order.customerId === user.id) return true;
  if (role === "driver" && driverRecord && order.driverId === driverRecord.id) return true;
  if (["laundromat","vendor"].includes(role) && vendorRecord && order.vendorId === vendorRecord.id) return true;
  if (role === "support") return true;
  return false;
}

export async function canAccessOrder(order: any, user: any): Promise<boolean> {
  if (!order || !user) return false;
  const role = user.role;
  if (role === "admin" || role === "manager" || role === "support") return true;
  if (role === "customer") return order.customerId === user.id;
  if (role === "driver") {
    const dp = await storage.getDriverByUserId(user.id);
    return !!(dp && order.driverId === dp.id);
  }
  if (role === "laundromat" || role === "vendor") {
    const vp = await storage.getVendorByUserId(user.id);
    return !!(vp && order.vendorId === vp.id);
  }
  return false;
}

export async function ownsDriverProfile(profileId: number, user: any): Promise<boolean> {
  if (!user) return false;
  if (user.role === "admin" || user.role === "manager") return true;
  if (user.role !== "driver") return false;
  const dp = await storage.getDriverByUserId(user.id);
  return !!(dp && dp.id === Number(profileId));
}

export async function ownsVendorProfile(vendorProfileId: number, user: any): Promise<boolean> {
  if (!user) return false;
  if (user.role === "admin" || user.role === "manager") return true;
  if (!(user.role === "laundromat" || user.role === "vendor")) return false;
  const vp = await storage.getVendorByUserId(user.id);
  return !!(vp && vp.id === Number(vendorProfileId));
}

// ════════════════════════════════════════════════════════════════
//  AI CHATBOT ENGINE
// ════════════════════════════════════════════════════════════════

export type ChatIntent = "order_status" | "reschedule" | "cancel" | "complaint" | "pricing" | "general" | "loyalty" | "subscription";

export function detectIntent(message: string): ChatIntent {
  const lower = message.toLowerCase();
  if (lower.match(/\b(where|status|track|locate|order|pickup|delivery|when|eta|arrival)\b/)) return "order_status";
  if (lower.match(/\b(reschedule|change|move|postpone|different time|new time)\b/)) return "reschedule";
  if (lower.match(/\b(cancel|cancellation|stop|refund)\b/)) return "cancel";
  if (lower.match(/\b(complaint|issue|problem|missing|damaged|wrong|bad|terrible|awful|lost|broken)\b/)) return "complaint";
  if (lower.match(/\b(price|cost|fee|charge|how much|expensive|cheap|discount|promo|coupon)\b/)) return "pricing";
  if (lower.match(/\b(points|loyalty|tier|rewards|silver|gold|platinum|bronze)\b/)) return "loyalty";
  if (lower.match(/\b(subscription|plan|upgrade|basic|plus|premium|membership)\b/)) return "subscription";
  return "general";
}

export async function generateAIResponse(intent: ChatIntent, userId: number, message: string): Promise<{ response: string; resolved: boolean; escalate: boolean }> {
  switch (intent) {
    case "order_status": {
      const userOrders = await storage.getOrdersByCustomer(userId);
      const activeOrders = userOrders.filter(o => !["delivered", "cancelled"].includes(o.status));
      if (activeOrders.length === 0) {
        const lastDelivered = userOrders.find(o => o.status === "delivered");
        if (lastDelivered) {
          return {
            response: `Your last order (${lastDelivered.orderNumber}) was delivered on ${lastDelivered.deliveredAt ? new Date(lastDelivered.deliveredAt).toLocaleDateString() : "recently"}. You have no active orders right now. Would you like to schedule a new pickup?`,
            resolved: true, escalate: false,
          };
        }
        return {
          response: "You don't have any active orders at the moment. Would you like to schedule your first pickup? Just head to the home screen to get started!",
          resolved: true, escalate: false,
        };
      }
      const order = activeOrders[0];
      const statusMsg: Record<string, string> = {
        pending: "is pending and we're finding you the best vendor and driver",
        scheduled: "has been confirmed and we're assigning a driver",
        driver_assigned: "has a driver assigned and they'll be heading to you soon",
        pickup_in_progress: "has a driver en route to pick up your laundry right now",
        picked_up: "has been picked up and is on its way to the laundromat",
        at_laundromat: "has arrived at the facility and will start washing soon",
        washing: "is currently being washed",
        wash_complete: "has finished washing and is being packed",
        packing: "is being carefully packed for delivery",
        ready_for_delivery: "is ready and we're dispatching a delivery driver",
        out_for_delivery: "is out for delivery and should arrive soon!",
      };
      return {
        response: `Your order **${order.orderNumber}** ${statusMsg[order.status] || "is in progress"}. ${order.slaDeadline ? `Estimated delivery by ${new Date(order.slaDeadline).toLocaleString()}.` : ""} Is there anything else I can help you with?`,
        resolved: true, escalate: false,
      };
    }
    case "reschedule":
      return { response: "To reschedule your pickup, please go to your order details and tap 'Reschedule'. You can change your pickup time up to 2 hours before the scheduled time. If your driver has already been assigned, please call us at (305) 555-0100 and we'll arrange it for you.", resolved: true, escalate: false };
    case "cancel": {
      const activeOrders = (await storage.getOrdersByCustomer(userId)).filter(o => ["pending", "scheduled", "driver_assigned"].includes(o.status));
      if (activeOrders.length > 0) {
        return { response: `I can help you cancel your order **${activeOrders[0].orderNumber}**. Please note that cancellations are free before the driver is dispatched. To proceed, go to your order details and tap 'Cancel Order', or I can escalate this to our team who can process it immediately. Would you like me to connect you with a team member?`, resolved: false, escalate: true };
      }
      return { response: "You don't have any cancellable orders at this time. Orders can only be cancelled before the pickup is completed. If you have concerns about a delivered order, I can help you file a dispute.", resolved: true, escalate: false };
    }
    case "complaint":
      return { response: "I'm sorry to hear you're having an issue! Your satisfaction is our top priority. To ensure this is handled properly, I'm escalating your concern to our customer care team. They'll reach out within 2 hours. In the meantime, you can also file a formal dispute from your order details page, which initiates our resolution process immediately.", resolved: false, escalate: true };
    case "pricing":
      return { response: "Our pricing uses flat-rate bag sizes:\n\n\u2022 **Small Bag**: $24.99 (up to 10 lbs)\n\u2022 **Medium Bag**: $44.99 (up to 20 lbs)\n\u2022 **Large Bag**: $59.99 (up to 30 lbs)\n\u2022 **XL Bag**: $89.99 (up to 50 lbs)\n\nDelivery options: Standard (48h) is free, Next Day (24h) +$5.99, Same Day (12h) +$12.99. If your laundry goes over the bag weight limit, it's $2.50 per extra pound. Tax is 8.875% (NYC). Try promo code **WELCOME20** for 20% off your first order!", resolved: true, escalate: false };
    case "loyalty": {
      const user = await storage.getUser(userId);
      const points = user?.loyaltyPoints || 0;
      const tier = user?.loyaltyTier || "bronze";
      const tierInfo = LOYALTY_TIERS[tier as keyof typeof LOYALTY_TIERS];
      return { response: `You currently have **${points} loyalty points** and you're a **${tier.charAt(0).toUpperCase() + tier.slice(1)} member**!\n\nYour tier perks include: ${tierInfo.perks.join(", ")}.\n\n100 points = $1 discount on your next order. You can redeem points from the checkout screen. Keep washing to level up!`, resolved: true, escalate: false };
    }
    case "subscription":
      return { response: "We use simple flat-rate pricing per bag \u2014 Small $24.99, Medium $44.99, Large $59.99, XL $89.99 \u2014 with $2.50/lb overage if your bag is heavier than expected. Standard 48-hour return is free; Next Day (+$5.99) and Same Day (+$12.99) are also available.", resolved: true, escalate: false };
    default:
      return { response: "Hi! I'm Offload's virtual assistant. I can help you with:\n\n\u2022 **Order status** \u2014 track your active orders\n\u2022 **Pricing** \u2014 get a quote\n\u2022 **Cancellations** \u2014 cancel or reschedule\n\u2022 **Loyalty points** \u2014 check your rewards\n\u2022 **Issues** \u2014 file a complaint\n\nWhat can I help you with today?", resolved: false, escalate: false };
  }
}
