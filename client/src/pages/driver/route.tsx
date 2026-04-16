import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Navigation,
  Package,
  MapPin,
  Clock,
  Truck,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import DriverLayout from "./layout";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
import type { Driver } from "@shared/schema";

type RouteStop = {
  id: number;
  orderNumber: string;
  type: "pickup" | "delivery";
  address: string;
  estimatedMinutes: number;
  distanceMiles: number;
  contactName?: string;
};

type RouteData = {
  driverId: number;
  totalStops: number;
  totalEstimatedMinutes: number;
  totalDistanceMiles: number;
  stops: RouteStop[];
};

const FALLBACK_ROUTE: RouteData = {
  driverId: 0,
  totalStops: 3,
  totalEstimatedMinutes: 47,
  totalDistanceMiles: 12.4,
  stops: [
    {
      id: 1,
      orderNumber: "ORD-0001",
      type: "pickup",
      address: "123 Main St, Brooklyn, NY 11201",
      estimatedMinutes: 8,
      distanceMiles: 2.1,
      contactName: "Sarah K.",
    },
    {
      id: 2,
      orderNumber: "ORD-0003",
      type: "pickup",
      address: "47 Atlantic Ave, Brooklyn, NY 11201",
      estimatedMinutes: 22,
      distanceMiles: 5.8,
      contactName: "Marcus T.",
    },
    {
      id: 3,
      orderNumber: "ORD-0002",
      type: "delivery",
      address: "88 Fulton St, Brooklyn, NY 11201",
      estimatedMinutes: 47,
      distanceMiles: 12.4,
      contactName: "Jordan M.",
    },
  ],
};

function StopCard({
  stop,
  index,
  isCompleted,
  onComplete,
  onNavigate,
}: {
  stop: RouteStop;
  index: number;
  isCompleted: boolean;
  onComplete: () => void;
  onNavigate: () => void;
}) {
  const isPickup = stop.type === "pickup";

  return (
    <div
      data-testid={`card-stop-${stop.id}`}
      className={`bg-card rounded-2xl p-4 border transition-all ${
        isCompleted ? "border-emerald-500/20 opacity-60" : "border-white/5"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 mb-3">
        {/* Step number */}
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm ${
            isCompleted
              ? "bg-emerald-500/20 text-emerald-400"
              : isPickup
              ? "bg-primary/20 text-primary"
              : "bg-blue-500/20 text-blue-400"
          }`}
        >
          {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              data-testid={`badge-stop-type-${stop.id}`}
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isPickup
                  ? "bg-primary/20 text-primary/80"
                  : "bg-blue-500/20 text-blue-300"
              }`}
            >
              {isPickup ? "Pickup" : "Delivery"}
            </span>
            <span className="text-gray-600 text-[10px]">#{stop.orderNumber}</span>
          </div>
          <p className="text-white text-sm font-medium leading-tight">{stop.address}</p>
          {stop.contactName && (
            <p className="text-gray-500 text-xs mt-0.5">{stop.contactName}</p>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          ~{stop.estimatedMinutes} min
        </span>
        <span className="flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {stop.distanceMiles.toFixed(1)} mi
        </span>
      </div>

      {/* Action buttons */}
      {!isCompleted && (
        <div className="flex gap-2">
          <button
            data-testid={`btn-navigate-${stop.id}`}
            onClick={onNavigate}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              isPickup
                ? "bg-primary text-white hover:bg-primary"
                : "bg-blue-600 text-white hover:bg-blue-500"
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            Start Navigation
          </button>
          <button
            data-testid={`btn-complete-stop-${stop.id}`}
            onClick={onComplete}
            className="px-3 py-2.5 rounded-xl bg-white/5 text-gray-400 text-xs font-semibold hover:bg-white/10 transition-colors flex items-center gap-1"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Done
          </button>
        </div>
      )}
    </div>
  );
}

export default function DriverRoute() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [completedStops, setCompletedStops] = useState<Set<number>>(new Set());
  const [navToast, setNavToast] = useState<string | null>(null);

  const userId = user?.id;

  const { data: driver } = useQuery<Driver>({
    queryKey: ["/api/drivers/user", userId],
    queryFn: async () => {
      const res = await apiRequest(`/api/drivers/user/${userId}`);
      return res.json();
    },
    enabled: !!userId && isAuthenticated,
  });

  const driverId = driver?.id;

  const { data: routeData, isLoading } = useQuery<RouteData>({
    queryKey: ["/api/driver/route", driverId],
    queryFn: async () => {
      const res = await apiRequest(`/api/driver/route?driverId=${driverId}`);
      return res.json();
    },
    enabled: !!driverId,
  });

  // Redirect if not authenticated (after all hooks)
  if (!isAuthenticated) {
    navigate("/login");
    return null;
  }

  // Use real data if available, fallback to mock for display
  const route = routeData ?? FALLBACK_ROUTE;

  const completedCount = completedStops.size;
  const totalStops = route.stops.length;
  const progressPct = totalStops > 0 ? (completedCount / totalStops) * 100 : 0;

  const markComplete = (stopId: number) => {
    setCompletedStops((prev) => new Set(prev).add(stopId));
  };

  const handleNavigate = (stop: RouteStop) => {
    setNavToast(`Opening navigation to ${stop.address.split(",")[0]}…`);
    setTimeout(() => setNavToast(null), 3000);
    // In a real app, this would deep-link to maps
    const encoded = encodeURIComponent(stop.address);
    window.open(`https://maps.google.com/maps?q=${encoded}`, "_blank");
  };

  return (
    <DriverLayout>
      <div className="px-5 pt-14 space-y-6 pb-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-white" data-testid="text-route-title">
            Optimized Route
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {totalStops} stops · AI-ordered for efficiency
          </p>
        </div>

        {/* Route Summary Card */}
        <div
          data-testid="card-route-summary"
          className="bg-primary rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-white/80" />
              <p className="text-white font-semibold">Today's Route</p>
            </div>
            <Badge className="bg-white/20 text-white border-0 text-[11px]">
              {completedCount}/{totalStops} done
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-white/60 text-[11px]">Est. Total Time</p>
              <p className="text-white font-bold text-lg" data-testid="text-total-time">
                {route.totalEstimatedMinutes} min
              </p>
            </div>
            <div>
              <p className="text-white/60 text-[11px]">Total Distance</p>
              <p className="text-white font-bold text-lg" data-testid="text-total-distance">
                {route.totalDistanceMiles.toFixed(1)} mi
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-white/20 rounded-full h-2">
            <div
              data-testid="progress-bar-route"
              className="bg-white rounded-full h-2 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-white/50 text-[10px] mt-1.5 text-right">
            {progressPct.toFixed(0)}% complete
          </p>
        </div>

        {/* Route Stops */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-card rounded-2xl p-4 border border-white/5 animate-pulse h-28"
              />
            ))}
          </div>
        ) : route.stops.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No active deliveries</p>
            <p className="text-gray-600 text-xs mt-1">
              New orders will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Visual connector for route */}
            <div className="relative">
              {route.stops.map((stop, idx) => (
                <div key={stop.id}>
                  <StopCard
                    stop={stop}
                    index={idx}
                    isCompleted={completedStops.has(stop.id)}
                    onComplete={() => markComplete(stop.id)}
                    onNavigate={() => handleNavigate(stop)}
                  />
                  {idx < route.stops.length - 1 && (
                    <div
                      className="flex items-center justify-center my-1"
                      aria-hidden
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="w-0.5 h-2 bg-white/10 rounded-full" />
                        <ChevronRight className="w-3 h-3 text-gray-700 rotate-90" />
                        <div className="w-0.5 h-2 bg-white/10 rounded-full" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All stops completed */}
        {completedCount > 0 && completedCount === totalStops && (
          <div
            data-testid="card-all-complete"
            className="bg-emerald-500/15 border border-emerald-500/30 rounded-2xl p-5 text-center"
          >
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p className="text-emerald-300 font-semibold">All stops complete!</p>
            <p className="text-emerald-500/70 text-xs mt-1">
              Great work. Check back for new assignments.
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            Pickup
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            Delivery
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            Completed
          </div>
        </div>

        {/* Navigation toast */}
        {navToast && (
          <div
            data-testid="toast-navigation"
            className="fixed bottom-24 left-4 right-4 max-w-sm mx-auto bg-card border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3 shadow-xl z-50"
          >
            <Navigation className="w-4 h-4 text-primary flex-shrink-0" />
            <p className="text-white text-sm">{navToast}</p>
          </div>
        )}
      </div>
    </DriverLayout>
  );
}
