// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const orderRepo = {
  createOrder: storage.createOrder.bind(storage),
  createOrderAddOn: storage.createOrderAddOn.bind(storage),
  createOrderEvent: storage.createOrderEvent.bind(storage),
  createOrderPhoto: storage.createOrderPhoto.bind(storage),
  createOrderStatusHistory: storage.createOrderStatusHistory.bind(storage),
  getActiveOrders: storage.getActiveOrders.bind(storage),
  getOrder: storage.getOrder.bind(storage),
  getOrderAddOns: storage.getOrderAddOns.bind(storage),
  getOrderEvents: storage.getOrderEvents.bind(storage),
  getOrderPhotos: storage.getOrderPhotos.bind(storage),
  getOrderPhotosByType: storage.getOrderPhotosByType.bind(storage),
  getOrderStatusHistory: storage.getOrderStatusHistory.bind(storage),
  getOrders: storage.getOrders.bind(storage),
  getOrdersByCustomer: storage.getOrdersByCustomer.bind(storage),
  getOrdersByStatus: storage.getOrdersByStatus.bind(storage),
  getPhotosByOrder: storage.getPhotosByOrder.bind(storage),
  updateOrder: storage.updateOrder.bind(storage),
};
