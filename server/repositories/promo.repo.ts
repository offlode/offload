// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const promoRepo = {
  createPromoCode: storage.createPromoCode.bind(storage),
  deletePromoUsageByOrder: storage.deletePromoUsageByOrder.bind(storage),
  getPromoCode: storage.getPromoCode.bind(storage),
  getPromoCodes: storage.getPromoCodes.bind(storage),
  getPromoUsageByUser: storage.getPromoUsageByUser.bind(storage),
  recordPromoUsage: storage.recordPromoUsage.bind(storage),
  updatePromoCode: storage.updatePromoCode.bind(storage),
};
