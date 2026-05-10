// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const driverRepo = {
  createDriver: storage.createDriver.bind(storage),
  createDriverLocationHistory: storage.createDriverLocationHistory.bind(storage),
  getAvailableDrivers: storage.getAvailableDrivers.bind(storage),
  getDriver: storage.getDriver.bind(storage),
  getDriverByUserId: storage.getDriverByUserId.bind(storage),
  getDriverLocationHistory: storage.getDriverLocationHistory.bind(storage),
  getDriverStats: storage.getDriverStats.bind(storage),
  getDrivers: storage.getDrivers.bind(storage),
  getOrdersByDriver: storage.getOrdersByDriver.bind(storage),
  updateDriver: storage.updateDriver.bind(storage),
};
