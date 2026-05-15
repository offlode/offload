import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Calendar, Clock, AlertCircle, Bell, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";

interface StepAddressProps {
  address: string;
  addressPlaceId: string;
  pickupDate: string;
  pickupTimeWindow: string;
  specialInstructions: string;
  serviceType: string;
  serviceAreaStatus: boolean | null;
  onAddressChange: (address: string, placeId: string) => void;
  onDateChange: (date: string) => void;
  onTimeChange: (window: string) => void;
  onInstructionsChange: (instructions: string) => void;
  onServiceAreaChange: (available: boolean | null) => void;
}

const TIME_WINDOWS = [
  "8:00 AM - 10:00 AM",
  "10:00 AM - 12:00 PM",
  "12:00 PM - 2:00 PM",
  "2:00 PM - 4:00 PM",
  "4:00 PM - 6:00 PM",
  "6:00 PM - 8:00 PM",
];

interface AddressMeta {
  zip: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
}

const EMPTY_ADDRESS_META: AddressMeta = {
  zip: "",
  city: "",
  state: "",
  lat: null,
  lng: null,
};

function extractZip(value: string): string {
  return value.match(/\b\d{5}(?:-\d{4})?\b/)?.[0].slice(0, 5) ?? "";
}

function parseCityStateFromAddress(value: string): Pick<AddressMeta, "city" | "state"> {
  const match = value.match(/,\s*([^,]+),\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/i);
  return {
    city: match?.[1]?.trim() ?? "",
    state: match?.[2]?.toUpperCase() ?? "",
  };
}

interface PlaceSuggestion {
  text: string;
  placeId: string;
}

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

async function fetchPlaceSuggestions(input: string): Promise<PlaceSuggestion[]> {
  if (!GOOGLE_API_KEY || input.length < 3) return [];
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
      },
      body: JSON.stringify({
        input,
        includedPrimaryTypes: ["street_address", "subpremise", "premise", "route"],
        includedRegionCodes: ["us"],
        languageCode: "en",
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const suggestions: PlaceSuggestion[] = (data.suggestions || [])
      .filter((s: any) => s.placePrediction)
      .map((s: any) => ({
        text: s.placePrediction.text?.text || s.placePrediction.structuredFormat?.mainText?.text || "",
        placeId: s.placePrediction.placeId || "",
      }));
    return suggestions;
  } catch {
    return [];
  }
}

async function fetchPlaceDetails(placeId: string): Promise<{
  formattedAddress: string;
  lat: number | null;
  lng: number | null;
  zip: string;
  city: string;
  state: string;
} | null> {
  if (!GOOGLE_API_KEY || !placeId) return null;
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?languageCode=en`,
      {
        headers: {
          "X-Goog-Api-Key": GOOGLE_API_KEY,
          "X-Goog-FieldMask": "formattedAddress,location,addressComponents",
        },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const lat = data.location?.latitude ?? null;
    const lng = data.location?.longitude ?? null;
    const components: Array<{ types: string[]; longText?: string; shortText?: string }> =
      data.addressComponents || [];
    const findComp = (type: string, short = false) => {
      const c = components.find((comp) => comp.types?.includes(type));
      if (!c) return "";
      return short ? c.shortText || c.longText || "" : c.longText || c.shortText || "";
    };
    return {
      formattedAddress: data.formattedAddress || "",
      lat,
      lng,
      zip: findComp("postal_code"),
      city: findComp("locality") || findComp("sublocality") || findComp("administrative_area_level_2"),
      state: findComp("administrative_area_level_1", true),
    };
  } catch {
    return null;
  }
}

export function StepAddress({
  address,
  addressPlaceId,
  pickupDate,
  pickupTimeWindow,
  specialInstructions,
  serviceType,
  serviceAreaStatus,
  onAddressChange,
  onDateChange,
  onTimeChange,
  onInstructionsChange,
  onServiceAreaChange,
}: StepAddressProps) {
  const { user } = useAuth();
  const autocompleteRef = useRef<HTMLInputElement>(null);
  const [notifyRequested, setNotifyRequested] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [checkingArea, setCheckingArea] = useState(false);
  const [addressMeta, setAddressMeta] = useState<AddressMeta>(EMPTY_ADDRESS_META);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [autocompleteError, setAutocompleteError] = useState("");
  const [fetchingSuggestions, setFetchingSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Store latest refs for callbacks
  const serviceTypeRef = useRef(serviceType);
  const onServiceAreaChangeRef = useRef(onServiceAreaChange);
  const onAddressChangeRef = useRef(onAddressChange);
  useEffect(() => { serviceTypeRef.current = serviceType; }, [serviceType]);
  useEffect(() => { onServiceAreaChangeRef.current = onServiceAreaChange; }, [onServiceAreaChange]);
  useEffect(() => { onAddressChangeRef.current = onAddressChange; }, [onAddressChange]);

  async function checkServiceArea(meta: AddressMeta) {
    setCheckingArea(true);
    setNotifyRequested(false);
    setAddressMeta(meta);
    onServiceAreaChangeRef.current(null);
    try {
      const params = new URLSearchParams({ service_type: serviceTypeRef.current });
      if (meta.zip) params.set("zip", meta.zip);
      if (meta.lat != null) params.set("lat", String(meta.lat));
      if (meta.lng != null) params.set("lng", String(meta.lng));
      const res = await apiRequest(`/api/service-area/check?${params}`);
      const result = await res.json();
      onServiceAreaChangeRef.current(result.available === true);
    } catch {
      // P1-1: On error, block and show retry instead of silently allowing
      onServiceAreaChangeRef.current(false);
    } finally {
      setCheckingArea(false);
    }
  }

  const { toast } = useToast();

  async function handleNotifyMe() {
    setNotifyLoading(true);
    try {
      const manual = parseCityStateFromAddress(address);
      const zip = addressMeta.zip || extractZip(address);
      const city = addressMeta.city || manual.city;
      const state = addressMeta.state || manual.state;
      const contactName = user?.name ?? "";
      const contactEmail = user?.email ?? "";
      const contactPhone = user?.phone ?? "";
      await apiRequest("/api/service-area-requests", {
        method: "POST",
        body: JSON.stringify({
          address,
          addressPlaceId,
          zip,
          city,
          state,
          lat: addressMeta.lat,
          lng: addressMeta.lng,
          requested_service: serviceType,
          contact_name: contactName,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          name: contactName,
          email: contactEmail,
          phone: contactPhone,
        }),
      });
      setNotifyRequested(true);
      toast({ title: "Request submitted", description: "We'll notify you when we expand to your area." });
    } catch (err: any) {
      toast({ title: "Request failed", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setNotifyLoading(false);
    }
  }

  // Fetch autocomplete suggestions from Places API (New)
  const fetchSuggestions = useCallback(async (input: string) => {
    if (input.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      setAutocompleteError("");
      return;
    }
    setFetchingSuggestions(true);
    setAutocompleteError("");
    const results = await fetchPlaceSuggestions(input);
    setFetchingSuggestions(false);
    setSuggestions(results);
    setShowSuggestions(true);
    if (results.length === 0 && input.length >= 5) {
      setAutocompleteError("No address suggestions found. Type your full address (with street number) to continue manually.");
    }
  }, []);

  // Handle selecting a suggestion
  const handleSelectSuggestion = useCallback(async (suggestion: PlaceSuggestion) => {
    setShowSuggestions(false);
    setSuggestions([]);
    setAutocompleteError("");
    onAddressChangeRef.current(suggestion.text, suggestion.placeId);

    // Fetch place details for lat/lng and address components
    const details = await fetchPlaceDetails(suggestion.placeId);
    if (details) {
      if (details.formattedAddress) {
        onAddressChangeRef.current(details.formattedAddress, suggestion.placeId);
      }
      if (details.zip || (details.lat != null && details.lng != null)) {
        checkServiceArea({
          zip: details.zip,
          city: details.city,
          state: details.state,
          lat: details.lat,
          lng: details.lng,
        });
      }
    }
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        autocompleteRef.current &&
        !autocompleteRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // For free-text entry (no placeId), update address meta but do NOT call coverage check.
  // Coverage issues must never block orders — ops verifies coverage post-order.
  useEffect(() => {
    if (addressPlaceId) return;
    const zip = extractZip(address);
    const { city, state } = parseCityStateFromAddress(address);
    if (!address) {
      setAddressMeta(EMPTY_ADDRESS_META);
      onServiceAreaChangeRef.current(null);
      return;
    }
    setAddressMeta({ ...EMPTY_ADDRESS_META, zip, city, state });
    // Do not call checkServiceArea for free-text — let canProceed() handle validation
    onServiceAreaChangeRef.current(null);
  }, [address, addressPlaceId]);

  // Time-window preset chips (C6)
  const now = new Date();
  const currentHour = now.getHours();
  const todayStr = now.toISOString().split("T")[0];
  const tomorrowStr = (() => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  })();

  type PresetChip = { label: string; date: string; window: string };
  const presetChips: PresetChip[] = [
    // "Today 4–6 PM" — only if current time is before 2 PM
    ...(currentHour < 14 ? [{ label: "Today 4–6 PM", date: todayStr, window: "16:00-18:00" }] : []),
    { label: "Tomorrow 8–10 AM", date: tomorrowStr, window: "8:00 AM - 10:00 AM" },
    { label: "Tomorrow 4–6 PM", date: tomorrowStr, window: "4:00 PM - 6:00 PM" },
  ];

  const [showDatePicker, setShowDatePicker] = useState(false);

  // Generate date options for next 7 days
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const value = d.toISOString().split("T")[0];
    const label = i === 0
      ? "Today"
      : i === 1
      ? "Tomorrow"
      : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    return { value, label };
  });

  return (
    <div className="px-5 space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-1">Pickup Details</h2>
        <p className="text-sm text-muted-foreground">
          Where and when should we pick up your laundry?
        </p>
      </div>

      {/* Address */}
      <div className="relative">
        <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> Pickup Address
        </Label>
        <Input
          ref={autocompleteRef}
          value={address}
          onChange={e => {
            const val = e.target.value;
            onAddressChange(val, "");
            onServiceAreaChange(null);
            setAutocompleteError("");
            // Debounce autocomplete requests
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          placeholder="Enter your address"
          className="h-12 rounded-xl"
          autoComplete="off"
          data-testid="input-address"
        />

        {/* Autocomplete dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden"
          >
            {suggestions.map((s, i) => (
              <button
                key={s.placeId || i}
                className="w-full text-left px-4 py-3 text-sm hover:bg-primary/10 transition-colors flex items-center gap-2 border-b border-border last:border-b-0"
                onClick={() => handleSelectSuggestion(s)}
                data-testid={`suggestion-${i}`}
              >
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{s.text}</span>
              </button>
            ))}
          </div>
        )}

        {fetchingSuggestions && (
          <p className="text-xs text-muted-foreground mt-1">Searching addresses...</p>
        )}
        {autocompleteError && (
          <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {autocompleteError}
          </p>
        )}
        {!addressPlaceId && address && address.length >= 3 && !autocompleteError && !fetchingSuggestions && !showSuggestions && !(address.trim().length >= 8 && /\d/.test(address) && address.trim().split(/\s+/).length >= 2) && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Include street number and ZIP for best results
          </p>
        )}
        {checkingArea && (
          <p className="text-xs text-muted-foreground mt-1">Checking service area...</p>
        )}
        {/* Yellow notice for free-text addresses (no placeId): coverage never blocks */}
        {!addressPlaceId && address.trim().length >= 8 && /\d/.test(address) && address.trim().split(/\s+/).length >= 2 && !checkingArea && (
          <div className="mt-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
            <p className="text-sm text-amber-600 font-medium flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              We'll confirm coverage after you place the order. If we can't serve your address, we'll fully refund within 1 business day.
            </p>
            <p className="text-xs text-amber-600/80 mt-1 ml-[22px]">
              Confirmaremos la cobertura después de realizar el pedido. Si no podemos atender su dirección, le reembolsaremos completamente en 1 día hábil.
            </p>
          </div>
        )}
        {/* Red error only for Place-selected addresses where coverage check explicitly failed */}
        {addressPlaceId && serviceAreaStatus === false && !checkingArea && (
          <div className="mt-2 rounded-xl bg-red-500/10 border border-red-500/30 p-3">
            <p className="text-sm text-red-500 font-medium flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Couldn't verify coverage
            </p>
            <div className="mt-2 ml-[22px] flex items-center gap-3">
              <button
                className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                onClick={() => {
                  const zip = addressMeta.zip || extractZip(address);
                  if (zip || (addressMeta.lat != null && addressMeta.lng != null)) {
                    checkServiceArea(addressMeta);
                  }
                }}
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
            {notifyRequested ? (
              <p className="text-xs text-muted-foreground mt-2 ml-[22px]">
                We'll notify you when we expand to your area.
              </p>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 ml-[22px] text-xs"
                disabled={notifyLoading}
                onClick={handleNotifyMe}
                data-testid="button-notify-service-area"
              >
                <Bell className="w-3.5 h-3.5 mr-1.5" />
                {notifyLoading ? "Submitting..." : "Notify me when available"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Time-window preset chips (C6) */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Quick Select
        </Label>
        <div className="flex flex-wrap gap-2">
          {presetChips.map(chip => {
            const isSelected = pickupDate === chip.date && pickupTimeWindow === chip.window;
            return (
              <button
                key={chip.label}
                onClick={() => {
                  onDateChange(chip.date);
                  onTimeChange(chip.window);
                  setShowDatePicker(false);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-medium min-h-[44px] flex items-center justify-center transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "bg-card border border-border hover:border-primary/40"
                }`}
                data-testid={`chip-${chip.label.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {chip.label}
              </button>
            );
          })}
          <button
            onClick={() => setShowDatePicker(prev => !prev)}
            className={`px-3 py-2 rounded-xl text-xs font-medium min-h-[44px] flex items-center justify-center transition-all ${
              showDatePicker
                ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                : "bg-card border border-border hover:border-primary/40"
            }`}
            data-testid="chip-pick-a-date"
          >
            Pick a date
          </button>
        </div>
      </div>

      {/* Date picker — shown when "Pick a date" is selected */}
      {showDatePicker && (
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" /> Pickup Date
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {dateOptions.slice(0, 7).map(opt => (
            <button
              key={opt.value}
              onClick={() => onDateChange(opt.value)}
              className={`p-2.5 rounded-xl text-xs font-medium text-center min-h-[44px] flex items-center justify-center transition-all ${
                pickupDate === opt.value
                  ? "bg-primary text-primary-foreground ring-1 ring-primary/30"
                  : "bg-card border border-border hover:border-primary/30"
              }`}
              data-testid={`date-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Time window */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Pickup Window
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {TIME_WINDOWS.map(w => (
            <button
              key={w}
              onClick={() => onTimeChange(w)}
              className={`p-2.5 rounded-xl text-xs font-medium text-center min-h-[44px] flex items-center justify-center transition-all ${
                pickupTimeWindow === w
                  ? "bg-primary text-primary-foreground ring-1 ring-primary/30"
                  : "bg-card border border-border hover:border-primary/30"
              }`}
              data-testid={`time-${w.replace(/\s/g, "-")}`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Special instructions */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">
          Special Instructions (optional)
        </Label>
        <Textarea
          value={specialInstructions}
          onChange={e => onInstructionsChange(e.target.value)}
          placeholder="e.g. Leave with doorman, ring buzzer #3..."
          className="min-h-[80px] text-sm rounded-xl"
          data-testid="input-instructions"
        />
      </div>
    </div>
  );
}
