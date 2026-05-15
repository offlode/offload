import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { BAG_OPTIONS, type BagSize, type DeliverySpeed } from "@/lib/design-tokens";
import { VoiceOrderModal } from "@/components/voice-order";

import { WizardProgress } from "./WizardProgress";
import { StepBags } from "./StepBags";
import { StepAddress } from "./StepAddress";
import { StepPayment } from "./StepPayment";
import { StepReview } from "./StepReview";
import { EstimatedTotalFooter } from "./EstimatedTotalFooter";
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
  // wouter's hash-location navigate() places query params in window.location.search,
  // not inside the hash fragment. Check both locations for robustness.
  const fromHash = window.location.hash.split("?")[1] || "";
  const fromSearch = window.location.search.replace(/^\?/, "");
  const params = new URLSearchParams(fromSearch || fromHash);
  const partial: Partial<WizardState> = {};

  const service = params.get("service");
  if (service) {
    if (service === "same_day") {
      partial.deliverySpeed = "same_day" as DeliverySpeed;
    } else {
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
    ...(voice.pickupAddress || voice.address ? { address: voice.pickupAddress || voice.address || "" } : {}),
    ...(scheduledPickupDate || voice.pickupDate ? { pickupDate: scheduledPickupDate || voice.pickupDate || "" } : {}),
    ...(voice.pickupTimeWindow ? { pickupTimeWindow: voice.pickupTimeWindow } : {}),
    ...(voice.special_instructions || voice.notes || voice.customerNotes
      ? { specialInstructions: voice.special_instructions || voice.notes || voice.customerNotes || "" }
      : {}),
  };
}

function applyReorderPrefill(base: WizardState): { state: WizardState; startStep: number } {
  const reorder = (window as any).__offload_reorder as {
    bags?: Array<{ size: string; quantity: number }>;
    serviceType?: string;
    deliverySpeed?: string;
    address?: string;
    pickupAddressId?: number;
    paymentMethodId?: string;
  } | undefined;
  if (!reorder) return { state: base, startStep: 1 };

  delete (window as any).__offload_reorder;

  const bags = Array.isArray(reorder.bags) && reorder.bags.length > 0
    ? reorder.bags.map(b => ({
        size: (b.size in BAG_OPTIONS ? b.size : "small") as BagSize,
        quantity: b.quantity || 1,
      }))
    : base.bags;

  const today = new Date().toISOString().split("T")[0];

  return {
    state: {
      ...base,
      bags,
      serviceType: reorder.serviceType || base.serviceType,
      deliverySpeed: (reorder.deliverySpeed as DeliverySpeed) || base.deliverySpeed,
      address: reorder.address || base.address,
      pickupAddressId: reorder.pickupAddressId ?? base.pickupAddressId,
      paymentMethodId: reorder.paymentMethodId || base.paymentMethodId,
      pickupDate: base.pickupDate || today,
      pickupTimeWindow: base.pickupTimeWindow || "8 AM \u2013 10 AM",
    },
    // Jump to review step (3) so user can confirm and place
    startStep: 3,
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

  // Initialize state from sessionStorage > query params > reorder > defaults
  const [initResult] = useState(() => {
    const qp = parseQueryParams();
    const reorderData = (window as any).__offload_reorder;
    if (reorderData) {
      const base = applyVoicePrefill({ ...INITIAL_WIZARD_STATE, ...qp });
      return applyReorderPrefill(base);
    }
    const saved = loadSavedState();
    if (saved) {
      // URL query params (serviceType, deliverySpeed) always override saved state
      const merged = { ...saved, ...qp };
      return { state: applyVoicePrefill(merged), startStep: 1 };
    }
    return { state: applyVoicePrefill({ ...INITIAL_WIZARD_STATE, ...qp }), startStep: 1 };
  });

  const [state, setState] = useState<WizardState>(initResult.state);
  const [step, setStep] = useState(initResult.startStep);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null);
  const [quoteValid, setQuoteValid] = useState(false);
  // Tracks whether the default-address auto-fill has already run, so clearing
  // the address field doesn't re-fill it from saved addresses.
  const addressAutoFilled = useRef(false);

  // Persist state to sessionStorage on change
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState(prev => ({ ...prev, [key]: value }));
  }, []);

  // Auto-fill default address if no address is set
  const { data: savedAddresses } = useQuery<Array<{ id: number; street: string; city: string; state: string; zip: string; isDefault: boolean | null }>>({
    queryKey: [`/api/addresses?userId=${user?.id}`],
    queryFn: async () => {
      const res = await apiRequest(`/api/addresses?userId=${user?.id}`);
      return res.json();
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (addressAutoFilled.current) return;
    if (!savedAddresses || savedAddresses.length === 0) return;
    if (state.address) {
      // Address already present (from reorder, saved state, or query params) — skip auto-fill
      addressAutoFilled.current = true;
      return;
    }
    const defaultAddr = savedAddresses.find(a => a.isDefault) || savedAddresses[0];
    if (defaultAddr) {
      addressAutoFilled.current = true;
      const formatted = [defaultAddr.street, defaultAddr.city, defaultAddr.state, defaultAddr.zip].filter(Boolean).join(", ");
      setState(prev => ({
        ...prev,
        address: formatted,
        pickupAddressId: defaultAddr.id,
      }));
    }
  }, [savedAddresses, state.address]);

  // serviceType is prelocked from the dashboard tile query param
  const isSignature = state.serviceType === "wash_fold_signature";

  // Wizard title based on service type
  const wizardTitle = isSignature ? "Signature Wash" : "Standard Wash";

  // 4-screen flow: Bags -> Pickup -> Review -> Place
  const goNext = () => {
    if (step < 4) {
      setStep(step + 1);
    }
  };

  const goBack = () => {
    if (step > 1) {
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
      case 2: {
        if (!state.address || !state.pickupDate || !state.pickupTimeWindow) return false;
        if (state.serviceAreaAvailable === true) return true;
        const addr = state.address.trim();
        const isValidFreeText = addr.length >= 8 && /\d/.test(addr) && addr.split(/\s+/).length >= 2;
        return isValidFreeText;
      }
      case 3: return !!state.paymentMethodId;
      case 4: return true;
      default: return false;
    }
  };

  // Ensure address is persisted before submitting order
  async function ensureAddressId(): Promise<number> {
    if (state.pickupAddressId) return state.pickupAddressId;

    const addr = state.address;
    const zipMatch = addr.match(/\b\d{5}(?:-\d{4})?\b/);
    const zip = zipMatch?.[0].slice(0, 5) ?? "";
    const csMatch = addr.match(/,\s*([^,]+),\s*([A-Z]{2})\s+\d{5}/i);
    const city = csMatch?.[1]?.trim() ?? "";
    const addrState = csMatch?.[2]?.toUpperCase() ?? "";
    const street = csMatch ? addr.slice(0, csMatch.index).replace(/,\s*$/, "").trim() : addr.trim();

    const res = await apiRequest("/api/addresses", {
      method: "POST",
      body: JSON.stringify({
        label: "Home",
        street,
        city,
        state: addrState,
        zip,
        isDefault: true,
      }),
    });
    const data = await res.json();
    const id = data.id ?? data.addressId;
    update("pickupAddressId", id);
    return id;
  }

  // Infer primary tier name from bags (highest count)
  function inferTierName(): string {
    const active = state.bags.filter(b => b.quantity > 0);
    if (active.length === 0) return "small";
    active.sort((a, b) => b.quantity - a.quantity);
    return active[0].size;
  }

  // Submit order
  const submitMutation = useMutation({
    mutationFn: async () => {
      const addressId = await ensureAddressId();
      const scheduledPickup = state.pickupDate
        ? new Date(`${state.pickupDate}T08:00:00`).toISOString()
        : undefined;

      const bags = state.bags
        .filter(b => b.quantity > 0)
        .map(b => ({ size: b.size, quantity: b.quantity }));

      // Load user's saved wash preferences for the order
      const rawPrefs = (user as any)?.preferences;
      const savedPrefs = typeof rawPrefs === "string"
        ? (() => { try { return JSON.parse(rawPrefs); } catch { return {}; } })()
        : (rawPrefs || {});

      const body = {
        pickupAddressId: addressId,
        pickupAddress: state.address,
        tierName: inferTierName(),
        serviceType: state.serviceType || "wash_fold",
        deliverySpeed: state.deliverySpeed,
        separated: false,
        clothing_types: [],
        wash_preferences: savedPrefs,
        scheduledPickup,
        pickupTimeWindow: state.pickupTimeWindow,
        paymentMethodId: state.paymentMethodId ? Number(state.paymentMethodId) : undefined,
        specialInstructions: state.specialInstructions || undefined,
        bags,
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

  // Success screen (step 4 completion)
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
          <h1 className="text-sm font-bold">{wizardTitle}</h1>
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
        <WizardProgress currentStep={step} />

        {/* Wash prefs chip on bags step */}
        {step === 1 && (
          <div className="px-5 mt-2">
            <div className="flex items-center gap-2 bg-primary/5 border border-primary/15 rounded-xl px-3 py-2">
              <span className="text-xs text-muted-foreground">Using your saved Wash Preferences</span>
              <a
                href="#/profile/wash-preferences"
                className="text-xs text-primary font-medium hover:underline ml-auto"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/profile?openWashPrefs=1&returnTo=wizard");
                }}
              >
                Edit
              </a>
            </div>
          </div>
        )}

        {/* Step content */}
        <div className="mt-4">
          {step === 1 && (
            <StepBags
              bags={state.bags}
              onChange={bags => update("bags", bags)}
              serviceType={state.serviceType}
            />
          )}
          {step === 2 && (
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
                update("pickupAddressId", null);
              }}
              onDateChange={d => update("pickupDate", d)}
              onTimeChange={t => update("pickupTimeWindow", t)}
              onInstructionsChange={i => update("specialInstructions", i)}
              onServiceAreaChange={available => update("serviceAreaAvailable", available)}
            />
          )}
          {step === 3 && (
            <>
              <StepReview
                state={state}
                onEdit={goToStep}
                onQuoteStatus={setQuoteValid}
              />
              <div className="px-5 mt-4">
                <StepPayment
                  selectedMethodId={state.paymentMethodId}
                  onSelect={id => update("paymentMethodId", id)}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Estimated total footer */}
      <EstimatedTotalFooter state={state} currentStep={step} />

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border px-5 py-4">
        <div className="max-w-lg mx-auto">
          {step === 3 ? (
            <Button
              className="w-full h-12 text-base font-semibold rounded-full"
              disabled={submitMutation.isPending || !quoteValid || !state.paymentMethodId}
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
            <div className="space-y-2">
              {step === 2 && state.address && !state.pickupTimeWindow && (
                <p className="text-xs text-amber-500 text-center font-medium" data-testid="hint-select-time">
                  Select a pickup time to continue
                </p>
              )}
              <div className="flex gap-3">
                {step > 1 && (
                  <Button
                    variant="outline"
                    className="h-12 px-6 rounded-full"
                    onClick={goBack}
                    data-testid="button-prev-step"
                  >
                    Back
                  </Button>
                )}
                <Button
                  className="flex-1 h-12 text-base font-semibold rounded-full"
                  disabled={!canProceed()}
                  onClick={goNext}
                  data-testid="button-next-step"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Voice order modal */}
      <VoiceOrderModal
        open={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
      />
    </div>
  );
}
