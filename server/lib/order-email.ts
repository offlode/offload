/**
 * Centralized order email sending — extracted from orders-crud.ts (P2-048).
 * All route modules that need to send order-related emails should import
 * from here instead of maintaining duplicate copies.
 */
import { Resend } from "resend";
import type { Order } from "@shared/schema";
import { storage } from "../storage";
import { getOrderEmailTemplate } from "./email-templates";
import { now } from "../engines";

export async function sendOrderEmail(order: Order, template: string) {
  const customer = await storage.getUser(order.customerId);
  if (!customer?.email) return;

  const tmpl = getOrderEmailTemplate(template, order, customer);
  if (!tmpl) {
    console.log(`[Email] No template for '${template}', skipping order#${order.id}`);
    return;
  }

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: "Offload <notifications@offloadusa.com>",
      to: customer.email,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
    });
    console.log(`[Email] Sent '${template}' to customer#${customer.id} via Resend: ${(result as any)?.data?.id || (result as any)?.id || "accepted"}`);
  } else if (process.env.SENDGRID_API_KEY) {
    console.log(`[Email] Would send '${template}' to customer#${customer.id} via SendGrid`);
  } else {
    console.log(`[Email] Would send '${template}' to customer#${customer.id}: ${tmpl.subject}`);
  }

  await storage.createOrderEvent({
    orderId: order.id,
    eventType: "email_sent",
    description: `Email sent: ${tmpl.subject}`,
    details: JSON.stringify({ template, to: customer.email }),
    actorRole: "system",
    timestamp: now(),
  });
}
