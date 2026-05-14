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
  pickupAddressId: number | null;
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
  pickupAddressId: null,
  pickupDate: "",
  pickupTimeWindow: "",
  specialInstructions: "",
  serviceAreaAvailable: null,
  paymentMethodId: "",
  deliverySpeed: "standard",
  serviceType: "",
};

export const WIZARD_STEPS = [
  { id: 1, title: "Choose Wash Style", shortTitle: "Style" },
  { id: 2, title: "Select Bags", shortTitle: "Bags" },
  { id: 3, title: "Separate by Type?", shortTitle: "Separate" },
  { id: 4, title: "Clothing Types", shortTitle: "Types" },
  { id: 5, title: "Address & Pickup", shortTitle: "Address" },
  { id: 6, title: "Payment Method", shortTitle: "Payment" },
  { id: 7, title: "Review & Confirm", shortTitle: "Review" },
] as const;
