import { pgTable, text, integer, real, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Drivers ───
export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  vehicleType: text("vehicle_type"),
  licensePlate: text("license_plate"),
  status: text("status").notNull().default("available"), // available | busy | offline
  rating: doublePrecision("rating").default(4.8),
  completedTrips: integer("completed_trips").default(0),
  avatarUrl: text("avatar_url"),
  currentLat: doublePrecision("current_lat"),
  currentLng: doublePrecision("current_lng"),
  // Payout tracking
  payoutPerTrip: doublePrecision("payout_per_trip").default(8.50),
  totalEarnings: doublePrecision("total_earnings").default(0),
  pendingPayout: doublePrecision("pending_payout").default(0),
  todayTrips: integer("today_trips").default(0),
  // AI route optimization
  currentRouteJson: text("current_route_json"), // JSON: optimized route
  estimatedAvailableAt: text("estimated_available_at"),
  maxTripsPerDay: integer("max_trips_per_day").default(15),
  preferredZones: text("preferred_zones"), // JSON: array of zip codes
  // Performance
  onTimePickupRate: doublePrecision("on_time_pickup_rate").default(0.95),
  avgPickupTime: doublePrecision("avg_pickup_time").default(12), // minutes
  customerRatingAvg: doublePrecision("customer_rating_avg").default(4.8),
});

export const insertDriverSchema = createInsertSchema(drivers).omit({ id: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof drivers.$inferSelect;


// ─── Driver Location History ───
export const driverLocationHistory = pgTable("driver_location_history", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull(),
  orderId: integer("order_id"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  speed: doublePrecision("speed"),
  heading: doublePrecision("heading"),
  accuracy: doublePrecision("accuracy"),
  timestamp: text("timestamp").notNull(),
});

export const insertDriverLocationHistorySchema = createInsertSchema(driverLocationHistory).omit({ id: true });
export type InsertDriverLocationHistory = z.infer<typeof insertDriverLocationHistorySchema>;
export type DriverLocationHistory = typeof driverLocationHistory.$inferSelect;
