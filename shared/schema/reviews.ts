import { pgTable, text, integer, real, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Reviews / Ratings ───
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  customerId: integer("customer_id").notNull(),
  vendorId: integer("vendor_id"),
  driverId: integer("driver_id"),
  vendorRating: integer("vendor_rating"),
  driverRating: integer("driver_rating"),
  overallRating: integer("overall_rating").notNull(),
  comment: text("comment"),
  // AI analysis
  aiSentiment: text("ai_sentiment"), // positive | neutral | negative
  aiTopics: text("ai_topics"), // JSON: extracted topics
  aiActionable: integer("ai_actionable").default(0), // needs attention?
  // Response
  vendorResponse: text("vendor_response"),
  vendorRespondedAt: text("vendor_responded_at"),
  createdAt: text("created_at").notNull(),
});

export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;
