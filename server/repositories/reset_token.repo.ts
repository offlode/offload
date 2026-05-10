// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const reset_tokenRepo = {
  cleanExpiredResetTokens: storage.cleanExpiredResetTokens.bind(storage),
  createPasswordResetToken: storage.createPasswordResetToken.bind(storage),
  getPasswordResetToken: storage.getPasswordResetToken.bind(storage),
  markPasswordResetTokenUsed: storage.markPasswordResetTokenUsed.bind(storage),
};
