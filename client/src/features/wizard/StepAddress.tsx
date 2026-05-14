import { useEffect, useRef, useState } from "react";
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

function getAddressComponent(
  components: Array<{ long_name?: string; short_name?: string; types?: string[] }> | undefined,
  type: string,
  preferShort = false,
): string {
  const component = components?.find(comp => comp.types?.includes(type));
  if (!component) return "";
  return (preferShort ? component.short_name : component.long_name) || component.long_name || component.short_name || "";
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
  const [hasGoogleMaps, setHasGoogleMaps] = useState(false);
  const [notifyRequested, setNotifyRequested] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [checkingArea, setCheckingArea] = useState(false);
  const [addressMeta, setAddressMeta] = useState<AddressMeta>(EMPTY_ADDRESS_META);

  // Store latest refs for callbacks used inside the Google Maps listener
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

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !autocompleteRef.current) return;

    const g = window as any;

    // Check if google maps Places is available
    if (g.google?.maps?.places) {
      initAutocomplete();
      return;
    }

    // Load the script if not already loaded
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      existing.addEventListener("load", initAutocomplete);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = initAutocomplete;
    document.head.appendChild(script);

    function initAutocomplete() {
      if (!autocompleteRef.current) return;
      try {
        const gm = (window as any).google;
        const ac = new gm.maps.places.Autocomplete(autocompleteRef.current, {
          types: ["address"],
          componentRestrictions: { country: "us" },
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (place.formatted_address && place.place_id) {
            onAddressChangeRef.current(place.formatted_address, place.place_id);

            // Extract lat/lng and address details for service area check
            const lat = place.geometry?.location?.lat();
            const lng = place.geometry?.location?.lng();
            const zip = getAddressComponent(place.address_components, "postal_code");
            const city =
              getAddressComponent(place.address_components, "locality") ||
              getAddressComponent(place.address_components, "sublocality") ||
              getAddressComponent(place.address_components, "administrative_area_level_2");
            const state = getAddressComponent(place.address_components, "administrative_area_level_1", true);
            if (zip || (lat != null && lng != null)) {
              checkServiceArea({
                zip,
                city,
                state,
                lat: lat ?? null,
                lng: lng ?? null,
              });
            }
          }
        });
        setHasGoogleMaps(true);
      } catch {
        // Google Maps not available — fall back to plain text
      }
    }
  }, []);

  useEffect(() => {
    if (addressPlaceId) return;
    const zip = extractZip(address);
    const { city, state } = parseCityStateFromAddress(address);
    if (!address) {
      setAddressMeta(EMPTY_ADDRESS_META);
      onServiceAreaChangeRef.current(null);
      return;
    }
    if (!zip) {
      setAddressMeta({ ...EMPTY_ADDRESS_META, city, state });
      onServiceAreaChangeRef.current(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      checkServiceArea({ zip, city, state, lat: null, lng: null });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [address, addressPlaceId]);

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
        <h2 className="text-lg font-bold mb-1">Pickup Details</h2>
        <p className="text-sm text-muted-foreground">
          Where and when should we pick up your laundry?
        </p>
      </div>

      {/* Address */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> Pickup Address
        </Label>
        <Input
          ref={autocompleteRef}
          value={address}
          onChange={e => {
            onAddressChange(e.target.value, "");
            onServiceAreaChange(null);
          }}
          placeholder="Enter your address"
          className="h-12 rounded-xl"
          data-testid="input-address"
        />
        {!hasGoogleMaps && address && !addressPlaceId && (
          <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Enter a 5-digit ZIP so we can verify your service area
          </p>
        )}
        {checkingArea && (
          <p className="text-xs text-muted-foreground mt-1">Checking service area...</p>
        )}
        {serviceAreaStatus === false && !checkingArea && (
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

      {/* Date picker */}
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
