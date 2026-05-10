// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const partner_applicationRepo = {
  createPartnerApplication: storage.createPartnerApplication.bind(storage),
  getPartnerApplication: storage.getPartnerApplication.bind(storage),
  getPartnerApplications: storage.getPartnerApplications.bind(storage),
  updatePartnerApplication: storage.updatePartnerApplication.bind(storage),
};
