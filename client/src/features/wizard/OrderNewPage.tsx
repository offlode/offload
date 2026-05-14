import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { BAG_OPTIONS, type BagSize, type DeliverySpeed } from "@/lib/design-tokens";
import { VoiceOrderModal } from "@/components/voice-order";

import { WizardProgress } from "./WizardProgress";
import { StepBags } from "./StepBags";
import { StepSeparation } from "./StepSeparation";
import { StepClothingTypes } from "./StepClothingTypes";
import { StepAddress } from "./StepAddress";
import { StepPayment } from "./StepPayment";
import { StepReview } from "./StepReview";
import { type WizardState, INITIAL_WIZARD_STATE } from "./types";

const STORAGE_KEY = "offload_wizard_state";

type VoicePrefill = {
  tierName?: string | null;
  bagSize?: string | null;
  serviceType?: string | null;
  separated?: boolean | null;
  clothingTypes?: string[] | null;
  pickupAddress?: string | null;
  address?: string | null;
  scheduledPickup?: string | null;
  pickupDate?: string | null;
  pickupTimeWindow?: string | null;
  special_instructions?: string | null;
  notes?: string | null;
  customerNotes?: string | null;
  deliverySpeed?: string | null;
};

function normalizeVoiceBag(value: string | null | undefined): BagSize | null {
  const normalized = value?.replace(/_bag$/, "") as BagSize | undefined;
  return normalized && normalized in BAG_OPTIONS ? normalized : null;
}

function normalizeDeliverySpeed(value: string | null | undefined): DeliverySpeed | null {
  if (value === "same_day") return "same_day";
  if (value === "next_day" || value === "24h") return "next_day";
  if (value === "standard" || value === "48h") return "standard";
  return null;
}

function parseQueryParams(): Partial<WizardState> {
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const partial: Partial<WizardState> = {};

  const service = params.get("service");
  if (service) {
    // "same_day" maps to delivery speed, not service type
    if (service === "same_day") {
      partial.deliverySpeed = "same_day" as DeliverySpeed;
    } else {
      // wash_fold, dry_cleaning, comforters, etc.
      partial.serviceType = service;
    }
  }

  const speed = params.get("speed") || params.get("delivery");
  if (speed === "same_day") partial.deliverySpeed = "same_day" as DeliverySpeed;

  const bag = params.get("bag");
  if (bag && bag in BAG_OPTIONS) {
    partial.bags = [{ size: bag as BagSize, quantity: 1 }];
  }

  return partial;
}

function applyVoicePrefill(base: WizardState): WizardState {
  const voice = (window as any).__offload_voice_prefill as VoicePrefill | undefined;
  if (!voice) return base;

  const bagSize = normalizeVoiceBag(voice.tierName ?? voice.bagSize);
  const deliverySpeed = normalizeDeliverySpeed(voice.deliverySpeed);
  const scheduledPickup = voice.scheduledPickup ? new Date(voice.scheduledPickup) : null;
  const scheduledPickupDate = scheduledPickup && !Number.isNaN(scheduledPickup.getTime())
    ? scheduledPickup.toISOString().split("T")[0]
    : undefined;

  delete (window as any).__offload_voice_prefill;

  return {
    ...base,
    ...(bagSize ? { bags: [{ size: bagSize, quantity: base.bags.find(b => b.size === bagSize)?.quantity ?? 1 }] } : {}),
    ...(voice.serviceType ? { serviceType: voice.serviceType } : {}),
    ...(deliverySpeed ? { deliverySpeed } : {}),
    ...(typeof voice.separated === "boolean" ? { separateByType: voice.separated } : {}),
    ...(Array.isArray(voice.clothingTypes) ? { clothingTypes: voice.clothingTypes } : {}),
    ...(voice.pickupAddress || voice.address ? { address: voice.pickupAddress || voice.address || "" } : {}),
    ...(scheduledPickupDate || voice.pickupDate ? { pickupDate: scheduledPickupDate || voice.pickupDate || "" } : {}),
    ...(voice.pickupTimeWindow ? { pickupTimeWindow: voice.pickupTimeWindow } : {}),
    ...(voice.special_instructions || voice.notes || voice.customerNotes
      ? { specialInstructions: voice.special_instructions || voice.notes || voice.customerNotes || "" }
      : {}),
  };
}

function loadSavedState(): WizardState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export default function OrderNewPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  // Initialize state from sessionStorage > query params > defaults
  const [state, setState] = useState<WizardState>(() => {
    const saved = loadSavedState();
    if (saved) return applyVoicePrefill(saved);
    const qp = parseQueryParams();
    return applyVoicePrefill({ ...INITIAL_WIZARD_STATE, ...qp });
  });

  const [step, setStep] = useState(1);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null);

  // Persist state to sessionStorage on change
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState(prev => ({ ...prev, [key]: value }));
  }, []);

  // Skip step 3 if not separating
  const skipStep3 = state.separateByType !== true;

  const goNext = () => {
    if (step === 2 && skipStep3) {
      setStep(4);
    } else if (step < 6) {
      setStep(step + 1);
    }
  };

  const goBack = () => {
    if (step === 4 && skipStep3) {
      setStep(2);
    } else if (step > 1) {
      setStep(step - 1);
    } else {
      navigate("/");
    }
  };

  const goToStep = (target: number) => {
    setStep(target);
  };

  // Validate current step
  const canProceed = (): boolean => {
    switch (step) {
      case 1: return state.bags.length > 0 && state.bags.some(b => b.quantity > 0);
      case 2: return state.separateByType !== null;
      case 3: return state.clothingTypes.length > 0;
      case 4: return !!state.address && !!state.pickupDate && !!state.pickupTimeWindow && state.serviceAreaAvailable === true;
      case 5: return !!state.paymentMethodId;
      case 6: return true;
      default: return false;
    }
  };

  // Submit order
  const submitMutation = useMutation({
    mutationFn: async () => {
      const body = {
        bags: JSON.stringify(state.bags.filter(b => b.quantity > 0).map(b => ({
          type: b.size,
          quantity: b.quantity,
          bagSize: b.size,
        }))),
        serviceType: state.serviceType,
        deliverySpeed: state.deliverySpeed,
        separated: state.separateByType,
        clothingTypes: state.separateByType ? state.clothingTypes : [],
        address: state.address,
        pickupDate: state.pickupDate,
        pickupTimeWindow: state.pickupTimeWindow,
        specialInstructions: state.specialInstructions,
        paymentMethodId: state.paymentMethodId ? Number(state.paymentMethodId) : undefined,
      };
      const res = await apiRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: (data) => {
      sessionStorage.removeItem(STORAGE_KEY);
      setCreatedOrderId(data.id || data.orderId);
      setOrderSuccess(true);
      toast({ title: "Order placed!", description: "Your laundry pickup has been scheduled." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to place order", description: err.message, variant: "destructive" });
    },
  });

  // Success screen
  if (orderSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Order Placed!</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Your laundry pickup has been scheduled. We'll notify you when a driver is on the way.
          </p>
          <div className="space-y-3">
            {createdOrderId && (
              <Button className="w-full" onClick={() => navigate(`/orders/${createdOrderId}`)}>
                Track Your Order
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button onClick={goBack} className="p-1 -ml-1 rounded-lg hover:bg-muted transition-colors" data-testid="button-wizard-back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-bold">Customize Your Wash</h1>
          <button
            onClick={() => setVoiceModalOpen(true)}
            className="p-2 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            data-testid="button-voice-order"
          >
            <Mic className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        {/* Progress */}
        <WizardProgress currentStep={step} skipStep3={skipStep3} />

        {/* Step content */}
        <div className="mt-4">
          {step === 1 && (
            <StepBags
              bags={state.bags}
              onChange={bags => update("bags", bags)}
            />
          )}
          {step === 2 && (
            <StepSeparation
              value={state.separateByType}
              separationFee={state.separationFee}
              bags={state.bags}
              onChange={v => {
                update("separateByType", v);
                if (!v) {
                  update("clothingTypes", []);
                  update("customTypes", []);
                }
              }}
            />
          )}
          {step === 3 && (
            <StepClothingTypes
              selected={state.clothingTypes}
              customTypes={state.customTypes}
              onSelectedChange={types => update("clothingTypes", types)}
              onCustomTypesChange={types => update("customTypes", types)}
            />
          )}
          {step === 4 && (
            <StepAddress
              address={state.address}
              addressPlaceId={state.addressPlaceId}
              pickupDate={state.pickupDate}
              pickupTimeWindow={state.pickupTimeWindow}
              specialInstructions={state.specialInstructions}
              serviceType={state.serviceType}
              serviceAreaStatus={state.serviceAreaAvailable}
              onAddressChange={(addr, placeId) => {
                update("address", addr);
                update("addressPlaceId", placeId);
              }}
              onDateChange={d => update("pickupDate", d)}
              onTimeChange={t => update("pickupTimeWindow", t)}
              onInstructionsChange={i => update("specialInstructions", i)}
              onServiceAreaChange={available => update("serviceAreaAvailable", available)}
            />
          )}
          {step === 5 && (
            <StepPayment
              selectedMethodId={state.paymentMethodId}
              onSelect={id => update("paymentMethodId", id)}
            />
          )}
          {step === 6 && (
            <StepReview
              state={state}
              onEdit={goToStep}
            />
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border px-5 py-4">
        <div className="max-w-lg mx-auto">
          {step === 6 ? (
            <Button
              className="w-full h-12 text-base font-semibold"
              disabled={submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
              data-testid="button-place-order"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Placing Order...
                </>
              ) : (
                "Place Order"
              )}
            </Button>
          ) : (
            <div className="flex gap-3">
              {step > 1 && (
                <Button
                  variant="outline"
                  className="h-12 px-6"
                  onClick={goBack}
                  data-testid="button-prev-step"
                >
                  Back
                </Button>
              )}
              <Button
                className="flex-1 h-12 text-base font-semibold"
                disabled={!canProceed()}
                onClick={goNext}
                data-testid="button-next-step"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Voice order modal — uses existing component */}
      <VoiceOrderModal
        open={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
      />
    </div>
  );
}
