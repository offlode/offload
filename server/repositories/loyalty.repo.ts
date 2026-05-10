// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const loyaltyRepo = {
  createLoyaltyTransaction: storage.createLoyaltyTransaction.bind(storage),
  getLoyaltyTransactions: storage.getLoyaltyTransactions.bind(storage),
};
