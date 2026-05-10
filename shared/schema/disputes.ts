import { pgTable, text, integer, real, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Disputes ───
export const disputes = pgTable("disputes", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  customerId: integer("customer_id").notNull(),
  reason: text("reason").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  resolution: text("resolution"),
  creditAmount: doublePrecision("credit_amount"),
  refundAmount: doublePrecision("refund_amount"),
  assignedTo: integer("assigned_to"),
  priority: text("priority").default("medium"),
  // AI analysis
  aiSuggestedResolution: text("ai_suggested_resolution"),
  aiSentimentScore: doublePrecision("ai_sentiment_score"), // -1 to 1
  aiCategory: text("ai_category"), // missing_item | quality | timing | billing | other
  aiAutoResolvable: integer("ai_auto_resolvable").default(0),
  photoEvidence: text("photo_evidence"), // JSON: array of photo URLs
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const insertDisputeSchema = createInsertSchema(disputes).omit({ id: true });
export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export type Dispute = typeof disputes.$inferSelect;
