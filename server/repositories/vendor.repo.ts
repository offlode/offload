// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const vendorRepo = {
  createVendor: storage.createVendor.bind(storage),
  createVendorPayout: storage.createVendorPayout.bind(storage),
  getActiveVendors: storage.getActiveVendors.bind(storage),
  getOrdersByVendor: storage.getOrdersByVendor.bind(storage),
  getVendor: storage.getVendor.bind(storage),
  getVendorByUserId: storage.getVendorByUserId.bind(storage),
  getVendorPayouts: storage.getVendorPayouts.bind(storage),
  getVendorStats: storage.getVendorStats.bind(storage),
  getVendors: storage.getVendors.bind(storage),
  updateVendor: storage.updateVendor.bind(storage),
  updateVendorPayout: storage.updateVendorPayout.bind(storage),
};
