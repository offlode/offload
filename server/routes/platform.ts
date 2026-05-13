import type { Express } from "express";
import { registerTrackingRoutes } from "./platform-tracking";
import { registerFsmRoutes } from "./platform-fsm";
import { registerCommsRoutes } from "./platform-comms";
import { registerWebhookRoutes } from "./platform-webhooks";
import { registerAdminRoutes } from "./platform-admin";

export function registerPlatformRoutes(app: Express) {
  registerTrackingRoutes(app);
  registerFsmRoutes(app);
  registerCommsRoutes(app);
  registerWebhookRoutes(app);
  registerAdminRoutes(app);

}
