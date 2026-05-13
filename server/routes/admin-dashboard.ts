import type { Express } from "express";
import { registerAdminMetricsRoutes } from "./admin-metrics";
import { registerAdminAnalyticsRoutes } from "./admin-analytics";
import { registerAdminAiRoutes } from "./admin-ai";

export function registerAdminDashboardRoutes(app: Express) {
  registerAdminMetricsRoutes(app);
  registerAdminAnalyticsRoutes(app);
  registerAdminAiRoutes(app);
}
