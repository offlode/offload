import { useEffect, useRef, useState } from "react";
import { MapPin, Calendar, Clock, AlertCircle, Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

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
  const autocompleteRef = useRef<HTMLInputElement>(null);
  const [hasGoogleMaps, setHasGoogleMaps] = useState(false);
  const [notifyRequested, setNotifyRequested] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [checkingArea, setCheckingArea] = useState(false);

  // Store latest refs for callbacks used inside the Google Maps listener
  const serviceTypeRef = useRef(serviceType);
  const onServiceAreaChangeRef = useRef(onServiceAreaChange);
  const onAddressChangeRef = useRef(onAddressChange);
  useEffect(() => { serviceTypeRef.current = serviceType; }, [serviceType]);
  useEffect(() => { onServiceAreaChangeRef.current = onServiceAreaChange; }, [onServiceAreaChange]);
  useEffect(() => { onAddressChangeRef.current = onAddressChange; }, [onAddressChange]);

  async function checkServiceArea(lat: number, lng: number, zip: string) {
    setCheckingArea(true);
    setNotifyRequested(false);
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        zip,
        service_type: serviceTypeRef.current,
      });
      const res = await apiRequest(`/api/service-area/check?${params}`);
      const result = await res.json();
      onServiceAreaChangeRef.current(result.available === true);
    } catch {
      // On error, allow proceeding (null = not checked)
      onServiceAreaChangeRef.current(null);
    } finally {
      setCheckingArea(false);
    }
  }

  async function handleNotifyMe() {
    setNotifyLoading(true);
    try {
      await apiRequest("/api/service-area-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, addressPlaceId }),
      });
      setNotifyRequested(true);
    } catch {
      // silently fail
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

            // Extract lat/lng and zip for service area check
            const lat = place.geometry?.location?.lat();
            const lng = place.geometry?.location?.lng();
            let zip = "";
            if (place.address_components) {
              for (const comp of place.address_components) {
                if (comp.types?.includes("postal_code")) {
                  zip = comp.long_name || comp.short_name;
                  break;
                }
              }
            }
            if (lat != null && lng != null) {
              checkServiceArea(lat, lng, zip);
            }
          }
        });
        setHasGoogleMaps(true);
      } catch {
        // Google Maps not available — fall back to plain text
      }
    }
  }, []);

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
          onChange={e => onAddressChange(e.target.value, addressPlaceId)}
          placeholder="Enter your address"
          className="h-12 rounded-xl"
          data-testid="input-address"
        />
        {!hasGoogleMaps && address && !addressPlaceId && (
          <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            We'll verify your address
          </p>
        )}
        {checkingArea && (
          <p className="text-xs text-muted-foreground mt-1">Checking service area...</p>
        )}
        {serviceAreaStatus === false && !checkingArea && (
          <div className="mt-2 rounded-xl bg-red-500/10 border border-red-500/30 p-3">
            <p className="text-sm text-red-500 font-medium flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              We don't service your area yet
            </p>
            {notifyRequested ? (
              <p className="text-xs text-muted-foreground mt-2 ml-5.5">
                We'll notify you when we expand to your area.
              </p>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 ml-5.5 text-xs"
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
          {dateOptions.slice(0, 6).map(opt => (
            <button
              key={opt.value}
              onClick={() => onDateChange(opt.value)}
              className={`p-2.5 rounded-xl text-xs font-medium text-center transition-all ${
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
              className={`p-2.5 rounded-xl text-xs font-medium text-center transition-all ${
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
