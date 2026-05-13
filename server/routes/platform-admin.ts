import type { Express } from "express";
import { registerPlatformAdminAddonsRoutes } from "./platform-admin-addons";
import { registerPlatformAdminCertifiedRoutes } from "./platform-admin-certified";
import { registerPlatformAdminPartnersRoutes } from "./platform-admin-partners";

export function registerAdminRoutes(app: Express) {
  registerPlatformAdminAddonsRoutes(app);
  registerPlatformAdminCertifiedRoutes(app);
  registerPlatformAdminPartnersRoutes(app);
}
