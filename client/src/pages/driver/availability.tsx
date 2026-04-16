import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Car,
  MapPin,
  Plus,
  X,
  CheckCircle2,
  Clock,
  Moon,
  Sun,
  Loader2,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import DriverLayout from "./layout";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Driver } from "@shared/schema";

const STATUS_OPTIONS = [
  {
    key: "available",
    label: "Available",
    description: "Ready to take trips",
    color: "border-emerald-500 bg-emerald-500/10",
    dot: "bg-emerald-400",
    textColor: "text-emerald-400",
  },
  {
    key: "busy",
    label: "Busy",
    description: "On a trip",
    color: "border-amber-500 bg-amber-500/10",
    dot: "bg-amber-400",
    textColor: "text-amber-400",
  },
  {
    key: "offline",
    label: "Offline",
    description: "Not accepting trips",
    color: "border-gray-600 bg-gray-700/30",
    dot: "bg-gray-500",
    textColor: "text-gray-400",
  },
] as const;

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
  { key: "sun", label: "S" },
];

function parseZones(json: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(json ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function DriverAvailability() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const userId = user?.id;

  const { data: driver, isLoading } = useQuery<Driver>({
    queryKey: ["/api/drivers/user", userId],
    queryFn: async () => {
      const res = await apiRequest(`/api/drivers/user/${userId}`);
      return res.json();
    },
    enabled: !!userId && isAuthenticated,
  });

  const driverId = driver?.id;

  // Local state — synced from driver data
  const [status, setStatus] = useState<"available" | "busy" | "offline">("offline");
  const [zones, setZones] = useState<string[]>([]);
  const [newZip, setNewZip] = useState("");
  const [maxTrips, setMaxTrips] = useState(15);
  const [selectedDays, setSelectedDays] = useState<DayKey[]>(["mon", "tue", "wed", "thu", "fri"]);
  const [timeStart, setTimeStart] = useState("08:00");
  const [timeEnd, setTimeEnd] = useState("20:00");

  // Sync state when driver loads
  useEffect(() => {
    if (driver) {
      setStatus((driver.status as "available" | "busy" | "offline") ?? "offline");
      setZones(parseZones(driver.preferredZones));
      setMaxTrips(driver.maxTripsPerDay ?? 15);
    }
  }, [driver]);

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Driver>) => {
      const res = await apiRequest(`/api/drivers/${driverId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers/user", userId] });
      toast({ title: "Preferences saved" });
    },
    onError: () => {
      toast({ title: "Failed to save", description: "Please try again", variant: "destructive" });
    },
  });

  // Redirect if not authenticated (after all hooks)
  if (!isAuthenticated) {
    navigate("/login");
    return null;
  }

  const toggleStatus = (newStatus: "available" | "busy" | "offline") => {
    setStatus(newStatus);
    updateMutation.mutate({ status: newStatus });
  };

  const addZone = () => {
    const zip = newZip.trim();
    if (!zip || zones.includes(zip)) return;
    const updated = [...zones, zip];
    setZones(updated);
    setNewZip("");
    updateMutation.mutate({ preferredZones: JSON.stringify(updated) });
  };

  const removeZone = (zip: string) => {
    const updated = zones.filter((z) => z !== zip);
    setZones(updated);
    updateMutation.mutate({ preferredZones: JSON.stringify(updated) });
  };

  const saveMaxTrips = () => {
    updateMutation.mutate({ maxTripsPerDay: maxTrips });
  };

  const toggleDay = (day: DayKey) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const currentStatusConfig =
    STATUS_OPTIONS.find((s) => s.key === status) ?? STATUS_OPTIONS[2];

  return (
    <DriverLayout>
      <div className="px-5 pt-14 space-y-6 pb-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-white" data-testid="text-availability-title">
            Availability
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage your status and preferences</p>
        </div>

        {/* Online/Offline Big Toggle */}
        <div
          data-testid="card-status-toggle"
          className="bg-card rounded-2xl p-5 border border-white/5"
        >
          <p className="text-gray-400 text-xs font-medium mb-4 uppercase tracking-wider">
            Current Status
          </p>

          {/* Status display */}
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-3 h-3 rounded-full ${currentStatusConfig.dot} animate-pulse`} />
            <div>
              <p className={`font-semibold text-base ${currentStatusConfig.textColor}`}>
                {currentStatusConfig.label}
              </p>
              <p className="text-gray-500 text-xs">{currentStatusConfig.description}</p>
            </div>
            {updateMutation.isPending && (
              <Loader2 className="w-4 h-4 text-gray-500 animate-spin ml-auto" />
            )}
          </div>

          {/* Status Buttons */}
          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                data-testid={`btn-status-${opt.key}`}
                onClick={() => toggleStatus(opt.key)}
                className={`py-3 rounded-xl border-2 text-xs font-semibold transition-all ${
                  status === opt.key
                    ? opt.color
                    : "border-white/5 bg-card text-gray-500 hover:border-white/10"
                } ${status === opt.key ? opt.textColor : ""}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Vehicle Info */}
        {driver && (
          <div
            data-testid="card-vehicle-info"
            className="bg-card rounded-2xl p-4 border border-white/5 flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Car className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm">
                {driver.vehicleType ?? "Vehicle"}
              </p>
              <p className="text-gray-500 text-xs mt-0.5">
                {driver.licensePlate ? `License: ${driver.licensePlate}` : "No plate set"}
              </p>
            </div>
            <div className="flex items-center gap-1 text-emerald-400 text-xs">
              <CheckCircle2 className="w-4 h-4" />
              Active
            </div>
          </div>
        )}

        {/* Preferred Zones */}
        <div data-testid="card-preferred-zones" className="bg-card rounded-2xl p-4 border border-white/5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-primary" />
            <p className="text-white font-semibold text-sm">Preferred Zones</p>
          </div>

          {/* Zip tag list */}
          {zones.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {zones.map((zip) => (
                <div
                  key={zip}
                  data-testid={`tag-zone-${zip}`}
                  className="flex items-center gap-1.5 bg-primary/15 text-primary/80 rounded-full px-3 py-1 text-xs font-medium"
                >
                  {zip}
                  <button
                    data-testid={`btn-remove-zone-${zip}`}
                    onClick={() => removeZone(zip)}
                    className="hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add zip */}
          <div className="flex gap-2">
            <input
              data-testid="input-new-zip"
              type="text"
              inputMode="numeric"
              value={newZip}
              onChange={(e) => setNewZip(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addZone()}
              placeholder="Add ZIP code…"
              maxLength={5}
              className="flex-1 bg-card border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-primary/50 transition-colors"
            />
            <button
              data-testid="btn-add-zone"
              onClick={addZone}
              className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center hover:bg-primary/30 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Max Trips Per Day */}
        <div data-testid="card-max-trips" className="bg-card rounded-2xl p-4 border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <p className="text-white font-semibold text-sm">Max Trips / Day</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-lg" data-testid="text-max-trips-value">
                {maxTrips}
              </span>
              <button
                data-testid="btn-save-max-trips"
                onClick={saveMaxTrips}
                disabled={updateMutation.isPending}
                className="text-[11px] bg-primary/20 text-primary/80 px-2 py-1 rounded-lg hover:bg-primary/30 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
          <Slider
            data-testid="slider-max-trips"
            min={1}
            max={30}
            step={1}
            value={[maxTrips]}
            onValueChange={([v]) => setMaxTrips(v)}
            className="w-full"
          />
          <div className="flex justify-between text-gray-600 text-[10px] mt-2">
            <span>1</span>
            <span>15</span>
            <span>30</span>
          </div>
        </div>

        {/* Schedule Preferences */}
        <div data-testid="card-schedule" className="bg-card rounded-2xl p-4 border border-white/5">
          <p className="text-white font-semibold text-sm mb-4">Schedule Preferences</p>

          {/* Day toggles */}
          <p className="text-gray-500 text-xs mb-2">Active Days</p>
          <div className="flex justify-between mb-5">
            {DAYS.map(({ key, label }) => (
              <button
                key={key}
                data-testid={`btn-day-${key}`}
                onClick={() => toggleDay(key)}
                className={`w-9 h-9 rounded-xl text-xs font-bold transition-all ${
                  selectedDays.includes(key)
                    ? "bg-primary text-white"
                    : "bg-card text-gray-600 hover:text-gray-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Time range */}
          <p className="text-gray-500 text-xs mb-2">Time Range</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Sun className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <input
                data-testid="input-time-start"
                type="time"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
                className="flex-1 bg-card border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            <span className="text-gray-600 text-xs">to</span>
            <div className="flex items-center gap-2 flex-1">
              <Moon className="w-4 h-4 text-sky-400 flex-shrink-0" />
              <input
                data-testid="input-time-end"
                type="time"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
                className="flex-1 bg-card border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>
        </div>
      </div>
    </DriverLayout>
  );
}
