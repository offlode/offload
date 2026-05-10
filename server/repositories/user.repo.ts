// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const userRepo = {
  createUser: storage.createUser.bind(storage),
  deleteUserAccount: storage.deleteUserAccount.bind(storage),
  getConversationsForUser: storage.getConversationsForUser.bind(storage),
  getUser: storage.getUser.bind(storage),
  getUserByEmail: storage.getUserByEmail.bind(storage),
  getUserByUsername: storage.getUserByUsername.bind(storage),
  getUsersByRole: storage.getUsersByRole.bind(storage),
  searchUsers: storage.searchUsers.bind(storage),
  updateUser: storage.updateUser.bind(storage),
};
