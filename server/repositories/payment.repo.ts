// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const paymentRepo = {
  createPaymentMethod: storage.createPaymentMethod.bind(storage),
  createPaymentTransaction: storage.createPaymentTransaction.bind(storage),
  createStripeAccount: storage.createStripeAccount.bind(storage),
  deletePaymentMethod: storage.deletePaymentMethod.bind(storage),
  getPaymentMethodsByUser: storage.getPaymentMethodsByUser.bind(storage),
  getPaymentTransactions: storage.getPaymentTransactions.bind(storage),
  getPaymentTransactionsByOrder: storage.getPaymentTransactionsByOrder.bind(storage),
  getStripeAccount: storage.getStripeAccount.bind(storage),
  updatePaymentMethod: storage.updatePaymentMethod.bind(storage),
  updatePaymentTransaction: storage.updatePaymentTransaction.bind(storage),
  updateStripeAccount: storage.updateStripeAccount.bind(storage),
};
