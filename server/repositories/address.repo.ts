// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const addressRepo = {
  createAddress: storage.createAddress.bind(storage),
  deleteAddress: storage.deleteAddress.bind(storage),
  getAddress: storage.getAddress.bind(storage),
  getAddressesByUser: storage.getAddressesByUser.bind(storage),
  updateAddress: storage.updateAddress.bind(storage),
};
