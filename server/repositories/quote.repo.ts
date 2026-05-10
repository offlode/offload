// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const quoteRepo = {
  createQuote: storage.createQuote.bind(storage),
  expireStaleQuotes: storage.expireStaleQuotes.bind(storage),
  getQuote: storage.getQuote.bind(storage),
  getQuoteByNumber: storage.getQuoteByNumber.bind(storage),
  getQuotesByCustomer: storage.getQuotesByCustomer.bind(storage),
  updateQuote: storage.updateQuote.bind(storage),
};
