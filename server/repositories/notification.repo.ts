// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const notificationRepo = {
  createNotification: storage.createNotification.bind(storage),
  createNotificationRule: storage.createNotificationRule.bind(storage),
  deleteNotification: storage.deleteNotification.bind(storage),
  deleteNotificationRule: storage.deleteNotificationRule.bind(storage),
  deletePushToken: storage.deletePushToken.bind(storage),
  getNotification: storage.getNotification.bind(storage),
  getNotificationRule: storage.getNotificationRule.bind(storage),
  getNotificationRules: storage.getNotificationRules.bind(storage),
  getNotificationRulesByTrigger: storage.getNotificationRulesByTrigger.bind(storage),
  getNotificationsByCategory: storage.getNotificationsByCategory.bind(storage),
  getNotificationsByUser: storage.getNotificationsByUser.bind(storage),
  getPushTokensByUser: storage.getPushTokensByUser.bind(storage),
  getUnreadCount: storage.getUnreadCount.bind(storage),
  markAllRead: storage.markAllRead.bind(storage),
  markNotificationRead: storage.markNotificationRead.bind(storage),
  savePushToken: storage.savePushToken.bind(storage),
  updateNotificationRule: storage.updateNotificationRule.bind(storage),
};
