// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const service_typeRepo = {
  createServiceType: storage.createServiceType.bind(storage),
  getServiceTypes: storage.getServiceTypes.bind(storage),
};
