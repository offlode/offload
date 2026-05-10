// Stage 3a refactor: thin repository façade over the storage singleton.
// New code SHOULD import from here. Existing code that imports `storage`
// directly continues to work unchanged.
import { storage } from "../storage";

export const reviewRepo = {
  createReview: storage.createReview.bind(storage),
  getReviewByOrder: storage.getReviewByOrder.bind(storage),
  getReviews: storage.getReviews.bind(storage),
  getReviewsByDriver: storage.getReviewsByDriver.bind(storage),
  getReviewsByVendor: storage.getReviewsByVendor.bind(storage),
};
