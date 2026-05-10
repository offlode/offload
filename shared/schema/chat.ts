import { pgTable, text, integer, real, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Messages (In-app chat) ───
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id"),
  conversationId: text("conversation_id"), // for non-order chats
  senderId: integer("sender_id").notNull(),
  senderRole: text("sender_role").notNull(),
  content: text("content").notNull(),
  messageType: text("message_type").default("text"), // text | image | system | auto_response
  isAiGenerated: integer("is_ai_generated").default(0),
  readAt: text("read_at"),
  timestamp: text("timestamp").notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;


// ─── AI Chat Sessions ───
export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  orderId: integer("order_id"),
  status: text("status").notNull().default("active"), // active | resolved | escalated
  topic: text("topic"), // order_status | reschedule | cancel | complaint | general
  aiResolved: integer("ai_resolved").default(0),
  escalatedTo: integer("escalated_to"), // admin userId
  messagesJson: text("messages_json"), // JSON: full conversation
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({ id: true });
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;
