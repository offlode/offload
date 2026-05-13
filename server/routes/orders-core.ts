import type { Express } from "express";
import { registerOrdersCrudRoutes } from "./orders-crud";
import { registerOrdersStatusRoutes } from "./orders-status";
import { registerOrdersFlowRoutes } from "./orders-ops-flow";
import { registerOrdersWeightRoutes } from "./orders-weight";

export function registerOrdersCoreRoutes(app: Express) {
  registerOrdersCrudRoutes(app);
  registerOrdersStatusRoutes(app);
  registerOrdersFlowRoutes(app);
  registerOrdersWeightRoutes(app);
}
