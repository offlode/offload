import type { BagSize, DeliverySpeed } from "@/lib/design-tokens";

export interface BagSelection {
  size: BagSize;
  quantity: number;
}

export interface WizardState {
  // Step 1: Bags
  bags: BagSelection[];
  // Step 2: Pickup scheduling
  address: string;
  addressPlaceId: string;
  pickupAddressId: number | null;
  pickupDate: string;
  pickupTimeWindow: string;
  specialInstructions: string;
  serviceAreaAvailable: boolean | null;
  // Step 3: Review (includes payment inline)
  paymentMethodId: string;
  // Metadata
  deliverySpeed: DeliverySpeed;
  serviceType: string;
  // Legacy fields kept for compatibility with StepReview quote API
  separateByType: boolean | null;
  separationFee: number;
  clothingTypes: string[];
  customTypes: string[];
}

export const INITIAL_WIZARD_STATE: WizardState = {
  bags: [],
  address: "",
  addressPlaceId: "",
  pickupAddressId: null,
  pickupDate: "",
  pickupTimeWindow: "",
  specialInstructions: "",
  serviceAreaAvailable: null,
  paymentMethodId: "",
  deliverySpeed: "standard",
  serviceType: "",
  separateByType: null,
  separationFee: 0,
  clothingTypes: [],
  customTypes: [],
};

export const WIZARD_STEPS = [
  { id: 1, title: "Select Bags", shortTitle: "Bags" },
  { id: 2, title: "Pickup Time", shortTitle: "Pickup" },
  { id: 3, title: "Review & Pay", shortTitle: "Review" },
  { id: 4, title: "Place Order", shortTitle: "Place" },
] as const;
