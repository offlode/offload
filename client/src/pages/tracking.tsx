import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft, MapPin, Navigation, Clock, Phone, Package,
  CheckCircle2, Truck, Building, Droplets, Wind, Shirt,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { getSocket, joinOrderRoom, leaveOrderRoom } from "@/lib/socket";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  scheduled: "Scheduled",
  driver_assigned: "Driver Assigned",
  driver_en_route_pickup: "Driver En Route",
  arrived_pickup: "Driver Arrived",
  picked_up: "Picked Up",
  driver_en_route_facility: "En Route to Facility",
  at_facility: "At Facility",
  processing: "Processing",
  washing: "Washing",
  drying: "Drying",
  folding: "Folding",
  ready_for_delivery: "Ready for Delivery",
  driver_en_route_delivery: "Out for Delivery",
  arrived_delivery: "Driver Arrived",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_ICONS: Record<string, typeof MapPin> = {
  driver_en_route_pickup: Truck,
  arrived_pickup: MapPin,
  picked_up: Package,
  driver_en_route_facility: Truck,
  at_facility: Building,
  processing: Package,
  washing: Droplets,
  drying: Wind,
  folding: Shirt,
  ready_for_delivery: Package,
  driver_en_route_delivery: Truck,
  arrived_delivery: MapPin,
  delivered: CheckCircle2,
};

interface TrackingData {
  orderId: number;
  status: string;
  progress: number;
  isDriverPhase: boolean;
  driverLocation: { lat: number; lng: number } | null;
  driverInfo: { id: number; name: string; phone: string; vehicleInfo: string; photo: string } | null;
  pickup: { lat: number; lng: number; address: string };
  delivery: { lat: number; lng: number; address: string };
  eta: string | null;
  history: Array<{ fromStatus: string; toStatus: string; timestamp: string; notes?: string }>;
}

export default function TrackingPage() {
  const [, params] = useRoute("/tracking/:id");
  const orderId = params?.id ? Number(params.id) : 0;
  const { user } = useAuth();
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);

  const { data: tracking, isLoading } = useQuery<TrackingData>({
    queryKey: [`/api/orders/${orderId}/tracking`],
    enabled: orderId > 0,
    refetchInterval: 10000,
  });

  // Real-time driver location via WebSocket
  useEffect(() => {
    if (!user || !orderId) return;
    const socket = getSocket(user.id, user.role);
    joinOrderRoom(orderId);

    const handleLocation = (data: { lat: number; lng: number }) => {
      setDriverPos({ lat: data.lat, lng: data.lng });
    };

    const handleStatusChange = () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/tracking`] });
    };

    socket.on("driver_location", handleLocation);
    socket.on("order_status_changed", handleStatusChange);

    return () => {
      socket.off("driver_location", handleLocation);
      socket.off("order_status_changed", handleStatusChange);
      leaveOrderRoom(orderId);
    };
  }, [user, orderId]);

  // Use WS location if available, otherwise API data
  const currentDriverPos = driverPos || tracking?.driverLocation;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!tracking) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-4">
        <Package className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">Order not found</p>
        <Link href="/orders">
          <button className="text-primary text-sm" data-testid="link-back">Back to Orders</button>
        </Link>
      </div>
    );
  }

  const StatusIcon = STATUS_ICONS[tracking.status] || Package;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Link href={`/orders/${orderId}`}>
            <button className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-card transition-colors" data-testid="btn-back">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <h1 className="text-lg font-semibold">Live Tracking</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Map Placeholder */}
        <div
          data-testid="map-container"
          className="w-full aspect-video rounded-2xl bg-card border border-border relative overflow-hidden"
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/10 to-primary/5">
            <Navigation className="w-10 h-10 text-primary/50" />
            <p className="text-sm text-muted-foreground font-medium">Map View</p>
            {currentDriverPos && (
              <p className="text-xs text-muted-foreground">
                Driver: {currentDriverPos.lat.toFixed(4)}, {currentDriverPos.lng.toFixed(4)}
              </p>
            )}
            {!tracking.isDriverPhase && (
              <p className="text-xs text-muted-foreground/60">
                Map available during driver phases
              </p>
            )}
          </div>
        </div>

        {/* Status Banner */}
        <div className="p-4 rounded-2xl bg-card border border-border" data-testid="status-banner">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <StatusIcon className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-base font-semibold">{STATUS_LABELS[tracking.status] || tracking.status}</p>
              {tracking.eta && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  ETA: {tracking.eta}
                </p>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500"
                style={{ width: `${tracking.progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-right">{tracking.progress}% complete</p>
          </div>
        </div>

        {/* Driver Info (visible during driver phases) */}
        {tracking.driverInfo && tracking.isDriverPhase && (
          <div className="p-4 rounded-2xl bg-card border border-border" data-testid="driver-card">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg">
                {tracking.driverInfo.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{tracking.driverInfo.name}</p>
                {tracking.driverInfo.vehicleInfo && (
                  <p className="text-xs text-muted-foreground">{tracking.driverInfo.vehicleInfo}</p>
                )}
              </div>
              {tracking.driverInfo.phone && (
                <a href={`tel:${tracking.driverInfo.phone}`}>
                  <button className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center" data-testid="btn-call-driver">
                    <Phone className="w-4 h-4 text-green-400" />
                  </button>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Address Cards */}
        <div className="grid grid-cols-1 gap-3">
          <div className="p-3 rounded-xl bg-card border border-border" data-testid="pickup-address">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pickup</p>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-sm">{tracking.pickup.address || "—"}</p>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-card border border-border" data-testid="delivery-address">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Delivery</p>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{tracking.delivery.address || "—"}</p>
            </div>
          </div>
        </div>

        {/* Status History Timeline */}
        {tracking.history.length > 0 && (
          <div className="p-4 rounded-2xl bg-card border border-border" data-testid="status-history">
            <h3 className="text-sm font-semibold mb-3">Status History</h3>
            <div className="space-y-0">
              {tracking.history.map((h, i) => {
                const isLast = i === tracking.history.length - 1;
                return (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      </div>
                      {!isLast && <div className="w-0.5 h-6 bg-border" />}
                    </div>
                    <div className={isLast ? "" : "pb-1"}>
                      <p className="text-sm font-medium">{STATUS_LABELS[h.toStatus] || h.toStatus}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(h.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
