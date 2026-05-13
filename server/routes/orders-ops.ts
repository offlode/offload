import type { Express } from "express";
import { registerOrdersOpsEntitiesRoutes } from "./orders-ops-entities";
import { registerOrdersOpsPricingRoutes } from "./orders-ops-pricing";

export function registerOrdersOpsRoutes(app: Express) {
  registerOrdersOpsEntitiesRoutes(app);
  registerOrdersOpsPricingRoutes(app);
}
