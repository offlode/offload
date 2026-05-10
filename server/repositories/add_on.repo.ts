// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const add_onRepo = {
  createAddOn: storage.createAddOn.bind(storage),
  deleteAddOn: storage.deleteAddOn.bind(storage),
  getAddOn: storage.getAddOn.bind(storage),
  getAddOns: storage.getAddOns.bind(storage),
  getAllAddOns: storage.getAllAddOns.bind(storage),
  updateAddOn: storage.updateAddOn.bind(storage),
};
