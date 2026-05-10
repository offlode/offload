// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const disputeRepo = {
  createDispute: storage.createDispute.bind(storage),
  getDispute: storage.getDispute.bind(storage),
  getDisputes: storage.getDisputes.bind(storage),
  updateDispute: storage.updateDispute.bind(storage),
};
