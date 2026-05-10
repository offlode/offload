// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const sessionRepo = {
  createSession: storage.createSession.bind(storage),
  deleteExpiredSessions: storage.deleteExpiredSessions.bind(storage),
  deleteSession: storage.deleteSession.bind(storage),
  deleteSessionsByUser: storage.deleteSessionsByUser.bind(storage),
  getQuotesBySession: storage.getQuotesBySession.bind(storage),
  getSession: storage.getSession.bind(storage),
};
