import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft,
  Phone,
  MapPin,
  Clock,
  Package,
  CheckCircle2,
  Navigation,
  AlertTriangle,
  Camera,
  MapPinned,
} from "lucide-react";
import DriverLayout from "./layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { getSocket, joinOrderRoom, leaveOrderRoom } from "@/lib/socket";
import { PhotoCapture } from "@/components/photo-capture";
import type { Order, OrderEvent, User } from "@shared/schema";

function parseBags(bags: string): { type: string; quantity: number; price: number }[] {
  try {
    return JSON.parse(bags);
  } catch {
    return [];
  }
}

function formatBagType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
}

const statusLabels: Record<string, string> = {
  driver_assigned: "PICKUP",
  driver_en_route_pickup: "EN ROUTE",
  arrived_pickup: "ARRIVED",
  pickup_in_progress: "PICKUP",
  picked_up: "IN TRANSIT",
  driver_en_route_facility: "TO FACILITY",
  at_facility: "AT FACILITY",
  at_laundromat: "AT FACILITY",
  ready_for_delivery: "READY",
  driver_en_route_delivery: "DELIVERING",
  arrived_delivery: "ARRIVED",
  out_for_delivery: "DELIVERY",
  delivered: "COMPLETED",
};

// Map event types to timeline steps
const timelineSteps = [
  { key: "order_placed", label: "Pickup Scheduled" },
  { key: "driver_assigned", label: "Driver Assigned" },
  { key: "driver_en_route_pickup", label: "En Route to Pickup" },
  { key: "arrived_pickup", label: "Arrived at Pickup" },
  { key: "pickup_confirmed", label: "Pickup Completed" },
];

// Action button config per status — FSM-aware transitions
type ActionConfig = {
  label: string;
  nextStatus: string;
  useFsmEndpoint?: boolean;
  requiresBagConfirm?: boolean;
  description?: string;
};

const actionMap: Record<string, ActionConfig> = {
  driver_assigned: {
    label: "Start Route to Pickup",
    nextStatus: "driver_en_route_pickup",
    useFsmEndpoint: true,
    description: "Driver started route to pickup",
  },
  driver_en_route_pickup: {
    label: "Arrived at Pickup",
    nextStatus: "arrived_pickup",
    useFsmEndpoint: true,
    description: "Arrived at customer location",
  },
  arrived_pickup: {
    label: "Confirm Pickup",
    nextStatus: "picked_up",
    useFsmEndpoint: true,
    requiresBagConfirm: true,
    description: "Bags picked up and confirmed",
  },
  picked_up: {
    label: "En Route to Facility",
    nextStatus: "driver_en_route_facility",
    useFsmEndpoint: true,
    description: "Driving to laundry facility",
  },
  driver_en_route_facility: {
    label: "Arrived at Facility",
    nextStatus: "at_facility",
    useFsmEndpoint: true,
    description: "Arrived at facility",
  },
  // Legacy compat
  pickup_in_progress: {
    label: "Confirm Pickup",
    nextStatus: "picked_up",
    requiresBagConfirm: true,
    description: "Bags picked up and confirmed",
  },
  ready_for_delivery: {
    label: "Start Delivery Route",
    nextStatus: "driver_en_route_delivery",
    useFsmEndpoint: true,
    description: "Started delivery route",
  },
  driver_en_route_delivery: {
    label: "Arrived at Delivery",
    nextStatus: "arrived_delivery",
    useFsmEndpoint: true,
    description: "Arrived at customer for delivery",
  },
  arrived_delivery: {
    label: "Confirm Delivery",
    nextStatus: "delivered",
    useFsmEndpoint: true,
    description: "Order delivered to customer",
  },
  out_for_delivery: {
    label: "Confirm Delivery",
    nextStatus: "delivered",
    description: "Order delivered to customer",
  },
};

export default function DriverOrderDetail() {
  const [, params] = useRoute("/driver/order/:id");
  const orderId = params?.id ? Number(params.id) : 0;
  const { toast } = useToast();
  const { user } = useAuth();
  const [showBagConfirm, setShowBagConfirm] = useState(false);
  const [bagCountConfirmed, setBagCountConfirmed] = useState(false);

  const {
    data: order,
    isLoading: loadingOrder,
    refetch: refetchOrder,
  } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders/${orderId}`);
      return res.json();
    },
    enabled: orderId > 0,
  });

  const { data: events = [] } = useQuery<OrderEvent[]>({
    queryKey: ["/api/orders", orderId, "events"],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders/${orderId}/events`);
      return res.json();
    },
    enabled: orderId > 0,
  });

  const { data: customer } = useQuery<User>({
    queryKey: ["/api/users", order?.customerId],
    queryFn: async () => {
      const res = await apiRequest(`/api/users/${order!.customerId}`);
      return res.json();
    },
    enabled: !!order?.customerId,
  });

  // Socket.io real-time updates
  useEffect(() => {
    if (!user || !orderId) return;
    const socket = getSocket(user.id, user.role);
    joinOrderRoom(orderId);

    const handleStatusChange = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "events"] });
      refetchOrder();
    };

    socket.on("order_status_changed", handleStatusChange);

    return () => {
      socket.off("order_status_changed", handleStatusChange);
      leaveOrderRoom(orderId);
    };
  }, [user, orderId, refetchOrder]);

  // GPS Location Sharing — send location every 15s during active driver phases
  const [gpsActive, setGpsActive] = useState(false);
  const [lastGps, setLastGps] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!order || !user) return;
    const activePhases = ["driver_en_route_pickup", "arrived_pickup", "picked_up", "driver_en_route_facility", "driver_en_route_delivery", "arrived_delivery"];
    if (!activePhases.includes(order.status)) {
      setGpsActive(false);
      return;
    }

    setGpsActive(true);
    let watchId: number;

    // Get driver record to find driverId
    const sendLocation = (lat: number, lng: number) => {
      setLastGps({ lat, lng });
      apiRequest(`/api/drivers/${order.driverId}/location`, {
        method: "POST",
        body: JSON.stringify({ lat, lng, orderId: order.id }),
      }).catch(() => {}); // Best-effort
    };

    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude),
        () => {},
        { enableHighAccuracy: true, maximumAge: 10000 }
      );
    }

    return () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [order?.status, order?.driverId, order?.id, user]);

  const advanceMutation = useMutation({
    mutationFn: async ({ status, description, useFsm }: { status: string; description?: string; useFsm?: boolean }) => {
      if (useFsm) {
        // Use the new FSM transition endpoint
        await apiRequest(`/api/orders/${orderId}/transition`, {
          method: "POST",
          body: JSON.stringify({
            newStatus: status,
            actorRole: "driver",
            actorId: user?.id,
            notes: description,
          }),
        });
      } else {
        // Legacy endpoint
        await apiRequest(`/api/orders/${orderId}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status,
            actorRole: "driver",
            description,
          }),
        });
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      const labels: Record<string, string> = {
        driver_en_route_pickup: "En route to pickup!",
        arrived_pickup: "Arrived at pickup!",
        picked_up: "Pickup confirmed!",
        driver_en_route_facility: "Heading to facility!",
        at_facility: "Arrived at facility!",
        driver_en_route_delivery: "Delivery started!",
        arrived_delivery: "Arrived for delivery!",
        delivered: "Order delivered!",
        // Legacy
        pickup_in_progress: "Pickup started!",
        at_laundromat: "Arrived at laundromat",
        out_for_delivery: "Out for delivery!",
      };
      toast({ title: labels[status] || "Status updated" });
      setShowBagConfirm(false);
      setBagCountConfirmed(false);
      refetchOrder();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to update status",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (loadingOrder) {
    return (
      <DriverLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DriverLayout>
    );
  }

  if (!order) {
    return (
      <DriverLayout>
        <div className="flex flex-col items-center justify-center h-screen px-5">
          <Package className="w-12 h-12 text-gray-600 mb-3" />
          <p className="text-gray-400">Order not found</p>
          <Link href="/driver">
            <button className="mt-4 text-primary text-sm" data-testid="btn-back-to-dashboard">
              Back to Dashboard
            </button>
          </Link>
        </div>
      </DriverLayout>
    );
  }

  const bags = parseBags(order.bags);
  const totalBags = bags.reduce((sum, b) => sum + (b.quantity || 1), 0);
  const label = statusLabels[order.status] || order.status.toUpperCase().replace(/_/g, " ");
  const customerName = customer?.name || `Customer #${order.customerId}`;
  const street = order.pickupAddress.split(",")[0];

  // Which timeline steps are completed based on events
  const completedEventTypes = new Set(events.map((e) => e.eventType));

  // Get action for current status
  const currentAction = actionMap[order.status];

  const scheduledTime = order.scheduledPickup
    ? new Date(order.scheduledPickup).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "—";

  const handleAction = () => {
    if (!currentAction) return;

    if (currentAction.requiresBagConfirm && !showBagConfirm) {
      setShowBagConfirm(true);
      return;
    }

    advanceMutation.mutate({
      status: currentAction.nextStatus,
      description: currentAction.description,
      useFsm: currentAction.useFsmEndpoint,
    });
  };

  return (
    <DriverLayout>
      <div className="px-5 pt-6 pb-8 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/driver">
            <button
              data-testid="btn-back"
              className="w-9 h-9 rounded-full bg-card flex items-center justify-center border border-white/5"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
          </Link>
          <h1 className="text-lg font-bold text-white">Order Details</h1>
        </div>

        {/* Status Row */}
        <div className="flex items-center gap-2" data-testid="status-row">
          <span className="rounded-full px-3 py-1 text-xs font-medium bg-primary/20 text-primary">
            {label}
          </span>
          {order.slaStatus === "at_risk" && (
            <span className="rounded-full px-3 py-1 text-xs font-medium bg-orange-500/20 text-orange-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              AT RISK
            </span>
          )}
          {order.slaStatus === "breached" && (
            <span className="rounded-full px-3 py-1 text-xs font-medium bg-red-500/20 text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              OVERDUE
            </span>
          )}
        </div>

        {/* Customer Info Card */}
        <div
          className="bg-card rounded-2xl p-4 border border-white/5"
          data-testid="customer-info-card"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg">
              {customerName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold" data-testid="text-customer-name">
                {customerName}
              </p>
              <p className="text-gray-500 text-xs truncate">{street}</p>
            </div>
            {customer?.phone && (
              <a href={`tel:${customer.phone}`}>
                <button
                  data-testid="btn-call-customer"
                  className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center"
                >
                  <Phone className="w-4 h-4 text-green-400" />
                </button>
              </a>
            )}
            {!customer?.phone && (
              <button
                data-testid="btn-call-customer"
                className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center"
              >
                <Phone className="w-4 h-4 text-green-400" />
              </button>
            )}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              {order.orderNumber}
            </span>
            <span>{totalBags} bag{totalBags > 1 ? "s" : ""}</span>
            <span className="capitalize">{order.deliveryType || "contactless"}</span>
          </div>
        </div>

        {/* Route Information Card */}
        <div
          className="bg-card rounded-2xl p-4 border border-white/5"
          data-testid="route-info-card"
        >
          <h3 className="text-white font-semibold text-sm mb-3">Route Information</h3>

          {/* Pickup address */}
          <div className="flex items-start gap-2 mb-3">
            <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-0.5">Pickup</p>
              <p className="text-white text-sm font-medium">{order.pickupAddress}</p>
              {order.addressNotes && (
                <p className="text-gray-500 text-xs mt-0.5">{order.addressNotes}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Scheduled</p>
              <p className="text-white font-semibold text-sm flex items-center gap-1">
                <Clock className="w-3 h-3 text-gray-500" />
                {scheduledTime}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Delivery Speed</p>
              <p className="text-white font-semibold text-sm">{order.deliverySpeed || "48h"}</p>
            </div>
          </div>

          <Link href={`/driver/navigation/${order.id}`}>
            <button
              data-testid="btn-view-location"
              className="w-full py-2.5 rounded-full border border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
            >
              <Navigation className="w-4 h-4" />
              View Location
            </button>
          </Link>
        </div>

        {/* Bag Confirmation Dialog (for pickup confirmation) */}
        {showBagConfirm && (
          <div
            data-testid="bag-confirm-dialog"
            className="bg-card rounded-2xl p-4 border border-primary/30"
          >
            <h3 className="text-white font-semibold text-sm mb-3">Confirm Bag Count</h3>
            <p className="text-gray-400 text-sm mb-4">
              Please confirm you have <span className="text-white font-semibold">{totalBags} bag{totalBags > 1 ? "s" : ""}</span> ready for pickup.
            </p>
            <div className="space-y-2">
              {bags.map((bag, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-gray-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                  {bag.quantity}x {formatBagType(bag.type)} Bag
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                data-testid="btn-cancel-confirm"
                type="button"
                onClick={() => { setShowBagConfirm(false); setBagCountConfirmed(false); }}
                className="flex-1 py-2.5 rounded-full border border-white/10 text-gray-400 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                data-testid="btn-confirm-bags"
                type="button"
                onClick={() => {
                  setBagCountConfirmed(true);
                  advanceMutation.mutate({
                    status: currentAction!.nextStatus,
                    description: currentAction!.description,
                  });
                }}
                disabled={advanceMutation.isPending}
                className="flex-1 py-2.5 rounded-full bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {advanceMutation.isPending ? "Confirming..." : "Yes, Confirm Pickup"}
              </button>
            </div>
          </div>
        )}

        {/* Order Progress Timeline */}
        <div
          className="bg-card rounded-2xl p-4 border border-white/5"
          data-testid="order-timeline"
        >
          <h3 className="text-white font-semibold text-sm mb-4">Order Progress</h3>
          <div className="space-y-0">
            {timelineSteps.map((step, i) => {
              const isCompleted = completedEventTypes.has(step.key);
              const isLast = i === timelineSteps.length - 1;

              return (
                <div key={step.key} className="flex gap-3">
                  {/* Line + Circle */}
                  <div className="flex flex-col items-center">
                    <div
                      data-testid={`timeline-step-${step.key}`}
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isCompleted
                          ? "bg-green-500"
                          : "bg-[#333] border border-gray-600"
                      }`}
                    >
                      {isCompleted && (
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      )}
                    </div>
                    {!isLast && (
                      <div
                        className={`w-0.5 h-8 ${
                          isCompleted ? "bg-green-500" : "bg-gray-700"
                        }`}
                      />
                    )}
                  </div>
                  {/* Label */}
                  <div className={isLast ? "" : "pb-2"}>
                    <p
                      className={`text-sm font-medium ${
                        isCompleted ? "text-white" : "text-gray-500"
                      }`}
                    >
                      {step.label}
                    </p>
                    {isCompleted && (() => {
                      const ev = events.find(e => e.eventType === step.key);
                      return ev ? (
                        <p className="text-gray-500 text-xs mt-0.5">
                          {new Date(ev.timestamp).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </p>
                      ) : <p className="text-gray-500 text-xs mt-0.5">Completed</p>;
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Order Summary Card */}
        <div
          className="bg-card rounded-2xl p-4 border border-white/5"
          data-testid="order-summary"
        >
          <h3 className="text-white font-semibold text-sm mb-3">Order Summary</h3>
          <div className="space-y-2">
            <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Bags:</p>
            {bags.map((bag, idx) => {
              let washLabel = "";
              if (order.preferences) {
                try {
                  const prefs = JSON.parse(order.preferences);
                  if (prefs.washType === "heavy_duty") washLabel = " - Heavy Duty Wash";
                  else if (prefs.washType === "signature") washLabel = " - Signature Wash";
                  else if (prefs.washType) washLabel = ` - ${prefs.washType.charAt(0).toUpperCase() + prefs.washType.slice(1)} Wash`;
                } catch {}
              }
              return (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-gray-300">
                    {bag.quantity}x {formatBagType(bag.type)} Bag{washLabel}
                  </span>
                </div>
              );
            })}
            {order.customerNotes && (
              <div className="pt-2">
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">
                  Customer Notes:
                </p>
                <p className="text-gray-300 text-sm">{order.customerNotes}</p>
              </div>
            )}
            <div className="border-t border-white/5 pt-2 mt-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Total:</span>
                <span className="text-white font-semibold">
                  ${order.total?.toFixed(2)}
                </span>
              </div>
              {order.driverPayout != null && order.driverPayout > 0 && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-400">Your payout:</span>
                  <span className="text-green-400 font-semibold">
                    ${order.driverPayout.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* GPS Location Indicator */}
        {gpsActive && (
          <div
            data-testid="gps-indicator"
            className="flex items-center gap-3 p-3 rounded-2xl bg-green-500/10 border border-green-500/20"
          >
            <MapPinned className="w-5 h-5 text-green-400 animate-pulse flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-green-300 font-medium">Location sharing active</p>
              {lastGps && (
                <p className="text-xs text-green-400/60">
                  {lastGps.lat.toFixed(4)}, {lastGps.lng.toFixed(4)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Photo Capture — required at key transitions */}
        {order.status === "arrived_pickup" && (
          <div data-testid="photo-section-pickup" className="space-y-2">
            <h3 className="text-white font-semibold text-sm">Pickup Photo (required)</h3>
            <PhotoCapture orderId={orderId} type="pickup_proof" label="Photo of bags at pickup" />
          </div>
        )}
        {order.status === "arrived_delivery" && (
          <div data-testid="photo-section-delivery" className="space-y-2">
            <h3 className="text-white font-semibold text-sm">Delivery Photo (required)</h3>
            <PhotoCapture orderId={orderId} type="delivery_proof" label="Photo of delivery" />
          </div>
        )}

        {/* Action Button */}
        {currentAction && !showBagConfirm && (
          <button
            data-testid="btn-primary-action"
            type="button"
            onClick={handleAction}
            disabled={advanceMutation.isPending}
            className="w-full py-3.5 rounded-full bg-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {advanceMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Updating...
              </span>
            ) : (
              currentAction.label
            )}
          </button>
        )}

        {order.status === "delivered" && (
          <div
            data-testid="banner-delivered"
            className="flex items-center gap-3 p-4 rounded-2xl bg-green-500/10 border border-green-500/20"
          >
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            <p className="text-sm text-green-300 font-medium">Order delivered!</p>
          </div>
        )}
      </div>
    </DriverLayout>
  );
}
