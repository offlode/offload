// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const miscRepo = {
  deleteStripeEvent: storage.deleteStripeEvent.bind(storage),
  getCustomerStats: storage.getCustomerStats.bind(storage),
  recordStripeEvent: storage.recordStripeEvent.bind(storage),
};
