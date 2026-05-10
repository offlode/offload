// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const pricingRepo = {
  createPricingAuditEntry: storage.createPricingAuditEntry.bind(storage),
  createPricingTier: storage.createPricingTier.bind(storage),
  getAllPricingConfig: storage.getAllPricingConfig.bind(storage),
  getPricingAuditLog: storage.getPricingAuditLog.bind(storage),
  getPricingConfig: storage.getPricingConfig.bind(storage),
  getPricingConfigByCategory: storage.getPricingConfigByCategory.bind(storage),
  getPricingTier: storage.getPricingTier.bind(storage),
  getPricingTierByName: storage.getPricingTierByName.bind(storage),
  getPricingTiers: storage.getPricingTiers.bind(storage),
  upsertPricingConfig: storage.upsertPricingConfig.bind(storage),
};
