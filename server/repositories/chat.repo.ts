// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const chatRepo = {
  createChatSession: storage.createChatSession.bind(storage),
  createMessage: storage.createMessage.bind(storage),
  getChatSession: storage.getChatSession.bind(storage),
  getChatSessions: storage.getChatSessions.bind(storage),
  getMessage: storage.getMessage.bind(storage),
  getMessagesByConversation: storage.getMessagesByConversation.bind(storage),
  getMessagesByOrder: storage.getMessagesByOrder.bind(storage),
  getMessagesBySender: storage.getMessagesBySender.bind(storage),
  markMessageRead: storage.markMessageRead.bind(storage),
  updateChatSession: storage.updateChatSession.bind(storage),
};
