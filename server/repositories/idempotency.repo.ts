// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const idempotencyRepo = {
  deleteExpiredIdempotencyKeys: storage.deleteExpiredIdempotencyKeys.bind(storage),
  getIdempotencyKey: storage.getIdempotencyKey.bind(storage),
  getQuoteByIdempotencyKey: storage.getQuoteByIdempotencyKey.bind(storage),
  storeIdempotencyKey: storage.storeIdempotencyKey.bind(storage),
};
