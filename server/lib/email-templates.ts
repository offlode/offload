import type { Order, User } from "@shared/schema";

const SUPPORT_EMAIL = "support@offloadusa.com";

const statusCopy: Record<string, { subject: string; heading: string; body: string; next: string }> = {
  order_confirmation: { subject: "Your Offload order is confirmed", heading: "Order confirmed", body: "We've received your order and are preparing the next step.", next: "You can track pickup and delivery in your Offload account." },
  payment_confirmed: { subject: "Payment received — Offload", heading: "Payment received", body: "Your payment has been confirmed.", next: "We'll continue processing your order." },
  driver_assigned: { subject: "Your Offload driver is assigned", heading: "Driver assigned", body: "A driver has been matched to your order.", next: "Keep an eye on tracking for pickup timing." },
  delivered: { subject: "Your laundry has been delivered — Offload", heading: "Delivered", body: "Your clean laundry has been delivered.", next: "Please review your order and contact support if anything needs attention." },
  cancelled: { subject: "Order cancelled — Offload", heading: "Order cancelled", body: "Your order has been cancelled.", next: "Any eligible payment adjustments will be handled by our team." },
  picked_up: { subject: "Your laundry has been picked up", heading: "Picked up", body: "Your laundry is safely with your Offload driver.", next: "Next, it heads to the facility for care." },
  at_facility: { subject: "Your laundry arrived at the facility", heading: "At the facility", body: "Your laundry has arrived at our partner facility.", next: "The team will begin processing shortly." },
  washing: { subject: "Your laundry is washing", heading: "Washing in progress", body: "Your laundry is being washed according to your selected preferences.", next: "We'll let you know when it is ready for delivery." },
  ready_for_delivery: { subject: "Your laundry is ready for delivery", heading: "Ready for delivery", body: "Your laundry is clean, folded, and ready to head back to you.", next: "A delivery driver will be assigned soon." },
  driver_en_route_delivery: { subject: "Your clean laundry is on the way", heading: "Out for delivery", body: "Your clean laundry is en route to your delivery address.", next: "Please be available according to your selected handoff preference." },
  disputed: { subject: "We received your order dispute", heading: "Dispute opened", body: "Our support team has received the dispute for this order.", next: "We'll review the details and follow up with a resolution." },
  refunded: { subject: "Your Offload refund has been processed", heading: "Refund processed", body: "A refund has been recorded for this order.", next: "Bank processing times may vary depending on your payment method." },
  resolved: { subject: "Your Offload issue has been resolved", heading: "Issue resolved", body: "The reported issue for this order has been resolved.", next: "Contact support if you still need help." },
  delivery_failed: { subject: "We need help completing your delivery", heading: "Delivery issue", body: "We could not complete delivery as planned.", next: "Our team will contact you to reschedule or resolve the issue." },
  rescheduled: { subject: "Your Offload order has been rescheduled", heading: "Order rescheduled", body: "Your order timing has been updated.", next: "Check your order details for the latest schedule." },
  delayed: { subject: "Your Offload order is delayed", heading: "Order delayed", body: "We're sorry — your order is taking longer than expected.", next: "We're monitoring it and will send another update as soon as possible." },
};

export function getOrderEmailTemplate(status: string, order: Order, customer: User): { subject: string; html: string; text: string } | null {
  const copy = statusCopy[status];
  if (!copy) return null;
  const name = customer.name || "there";
  const orderNo = (order as any).orderNumber || `#${order.id}`;
  const total = typeof order.total === "number" ? `$${order.total.toFixed(2)}` : "your order total";
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#ffffff;">
    <div style="text-align:center;margin-bottom:24px;"><h1 style="color:#5B4BC4;font-size:26px;margin:0;">Offload</h1></div>
    <h2 style="color:#1A1A1A;font-size:20px;margin:0 0 16px;">${copy.heading}</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;">Hi ${name},</p>
    <p style="color:#555;font-size:14px;line-height:1.6;">${copy.body}</p>
    <div style="background:#F7F5FF;border:1px solid #E5DFFF;border-radius:12px;padding:16px;margin:24px 0;">
      <p style="margin:0 0 8px;color:#1A1A1A;font-size:14px;"><strong>Order:</strong> ${orderNo}</p>
      <p style="margin:0;color:#1A1A1A;font-size:14px;"><strong>Total:</strong> ${total}</p>
    </div>
    <p style="color:#555;font-size:14px;line-height:1.6;"><strong>Next step:</strong> ${copy.next}</p>
    <p style="color:#888;font-size:12px;line-height:1.6;">Need help? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:#5B4BC4;">${SUPPORT_EMAIL}</a>.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
    <p style="color:#aaa;font-size:11px;text-align:center;">&copy; ${new Date().getFullYear()} Offload USA &mdash; Fresh clothes, zero hassle.</p>
  </div>`;
  const text = `Hi ${name},\n\n${copy.heading}\n\n${copy.body}\n\nOrder: ${orderNo}\nTotal: ${total}\n\nNext step: ${copy.next}\n\nNeed help? Email ${SUPPORT_EMAIL}.\n\n— The Offload Team`;
  return { subject: copy.subject, html, text };
}
