import type { Express } from "express";
import { registerAdminOpsRoutes } from "./admin-ops";
import { registerAdminDashboardRoutes } from "./admin-dashboard";

export function registerAdminRoutes(app: Express) {
  registerAdminOpsRoutes(app);
  registerAdminDashboardRoutes(app);
}
