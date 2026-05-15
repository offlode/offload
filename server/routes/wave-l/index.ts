import type { Express } from "express";
import { registerOrderRoutes } from "./orders";
import { registerVendorRoutes } from "./vendors";
import { registerDriverRoutes } from "./drivers";
import { registerTwoFactorRoutes } from "./two-factor";
import { registerPricingRoutes } from "./pricing";

export function registerWaveLRoutes(app: Express): void {
  registerOrderRoutes(app);
  registerVendorRoutes(app);
  registerDriverRoutes(app);
  registerTwoFactorRoutes(app);
  registerPricingRoutes(app);
}
