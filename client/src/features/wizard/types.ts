import type { BagSize, DeliverySpeed } from "@/lib/design-tokens";

export interface BagSelection {
  size: BagSize;
  quantity: number;
}

export interface WizardState {
  // Step 1: Bags
  bags: BagSelection[];
  // Step 2: Separation
  separateByType: boolean | null;
  separationFee: number;
  // Step 3: Clothing types (only if separate=true)
  clothingTypes: string[];
  customTypes: string[];
  // Step 4: Address & pickup
  address: string;
  addressPlaceId: string;
  pickupDate: string;
  pickupTimeWindow: string;
  specialInstructions: string;
  serviceAreaAvailable: boolean | null;
  // Step 5: Payment
  paymentMethodId: string;
  // Step 6: Review (computed)
  deliverySpeed: DeliverySpeed;
  serviceType: string;
}

export const INITIAL_WIZARD_STATE: WizardState = {
  bags: [],
  separateByType: null,
  separationFee: 0,
  clothingTypes: [],
  customTypes: [],
  address: "",
  addressPlaceId: "",
  pickupDate: "",
  pickupTimeWindow: "",
  specialInstructions: "",
  serviceAreaAvailable: null,
  paymentMethodId: "",
  deliverySpeed: "standard",
  serviceType: "wash_fold",
};

export const WIZARD_STEPS = [
  { id: 1, title: "Select Bags", shortTitle: "Bags" },
  { id: 2, title: "Separate by Type?", shortTitle: "Separate" },
  { id: 3, title: "Clothing Types", shortTitle: "Types" },
  { id: 4, title: "Address & Pickup", shortTitle: "Address" },
  { id: 5, title: "Payment Method", shortTitle: "Payment" },
  { id: 6, title: "Review & Confirm", shortTitle: "Review" },
] as const;
