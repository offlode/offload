// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const referralRepo = {
  createReferral: storage.createReferral.bind(storage),
  getReferralsByUser: storage.getReferralsByUser.bind(storage),
  updateReferral: storage.updateReferral.bind(storage),
};
