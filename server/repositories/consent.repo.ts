// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const consentRepo = {
  createConsent: storage.createConsent.bind(storage),
  getConsent: storage.getConsent.bind(storage),
  getConsentsByOrder: storage.getConsentsByOrder.bind(storage),
  getPendingConsents: storage.getPendingConsents.bind(storage),
  updateConsent: storage.updateConsent.bind(storage),
};
