import type { Express } from "express";
import { registerQuotesPricingRoutes } from "./quotes-pricing";
import { registerQuotesCheckoutRoutes } from "./quotes-checkout";

export function registerQuotesRoutes(app: Express) {
  registerQuotesPricingRoutes(app);
  registerQuotesCheckoutRoutes(app);
}
