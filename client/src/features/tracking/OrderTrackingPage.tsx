import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import {
  ArrowLeft, Phone, MessageCircle, MapPin, Package,
  Check, Clock, Truck, User, ChevronDown, ChevronUp, Shield,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, useEffect } from "react";
import { ORDER_PROGRESS_LABELS, ORDER_PROGRESS_ORDER, TERMINAL_STATUSES, friendlyStatus } from "@/lib/order-status";
import { useAuth } from "@/contexts/auth-context";
import { queryClient } from "@/lib/queryClient";
import { getSocket, joinOrderRoom, leaveOrderRoom } from "@/lib/socket";
import EmbeddedTrackingMap from "@/components/embedded-tracking-map";

interface OrderProgressStep {
  label: string;
  fsmState: string;
  completed: boolean;
  timestamp: string | null;
}

interface OrderProgress {
  orderId: number;
  currentStatus: string;
  steps: OrderProgressStep[];
}

interface DriverInfo {
  id: number;
  name: string;
  phone?: string;
  avatar?: string;
  rating?: number;
  vehicleInfo?: string;
  location?: { lat: number; lng: number };
}

interface VendorInfo {
  id: number;
  name: string;
  phone?: string;
  address?: string;
  certified?: boolean;
}

interface OrderDetail {
  id: number;
  orderNumber: string;
  status: string;
  bags: string;
  serviceType: string;
  deliverySpeed: string;
  separated: boolean;
  clothingTypes: string[];
  specialInstructions: string;
  total: number;
  address: string;
  createdAt: string;
  driver?: DriverInfo;
  vendor?: VendorInfo;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function OrderTrackingPage() {
  const [, orderParams] = useRoute("/orders/:id");
  const [, trackingParams] = useRoute("/tracking/:id");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const orderId = orderParams?.id || trackingParams?.id;
  const [summaryOpen, setSummaryOpen] = useState(false);

  const isTerminal = (status?: string) =>
    !!status && (TERMINAL_STATUSES as readonly string[]).includes(status);

  // Fetch order details
  const { data: order, isLoading, isError, refetch } = useQuery<OrderDetail>({
    queryKey: [`/api/orders/${orderId}`],
    enabled: !!orderId,
  });

  // P0-8: Fetch progress with 20s polling, stop on terminal states
  const { data: progress } = useQuery<OrderProgress>({
    queryKey: [`/api/orders/${orderId}/progress`],
    enabled: !!orderId,
    refetchInterval: isTerminal(order?.status) ? false : 20_000,
  });

  // P1-D2: WebSocket for real-time updates (merged from pages/tracking.tsx)
  useEffect(() => {
    if (!user || !orderId) return;
    const socket = getSocket(user.id, user.role);
    joinOrderRoom(Number(orderId));

    const handleStatusChange = () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/progress`] });
    };

    socket.on("order_status_changed", handleStatusChange);
    return () => {
      socket.off("order_status_changed", handleStatusChange);
      leaveOrderRoom(Number(orderId));
    };
  }, [user, orderId]);

  // Map backend progress steps, or fall back to client-side mapping from canonical labels
  const progressLabels: { key: string; label: string; completed: boolean; current: boolean; timestamp?: string }[] =
    progress?.steps && progress.steps.length > 0
      ? (() => {
          const firstNonCompleted = progress.steps.findIndex(s => !s.completed);
          // If all steps are completed, mark the last step as current
          const currentIdx = firstNonCompleted === -1 ? progress.steps.length - 1 : firstNonCompleted;
          return progress.steps.map((step, idx) => ({
            key: step.fsmState,
            label: step.label,
            completed: step.completed,
            current: idx === currentIdx,
            timestamp: step.timestamp || undefined,
          }));
        })()
      : ORDER_PROGRESS_ORDER.map(key => {
          const orderStatusIdx = ORDER_PROGRESS_ORDER.indexOf(order?.status as any);
          const thisIdx = ORDER_PROGRESS_ORDER.indexOf(key);
          const isTerminalState = orderStatusIdx === ORDER_PROGRESS_ORDER.length - 1;
          return {
            key,
            label: ORDER_PROGRESS_LABELS[key] || key,
            completed: orderStatusIdx >= 0 && (thisIdx < orderStatusIdx || (isTerminalState && thisIdx <= orderStatusIdx)),
            current: thisIdx === orderStatusIdx,
          };
        });

  const currentLabel = friendlyStatus(progress?.currentStatus || order?.status || "order_placed");

  if (isLoading) {
    return (
      <div className="pb-24 max-w-lg mx-auto">
        <div className="px-5 pt-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="pb-24 max-w-lg mx-auto px-5 pt-12 text-center">
        <p className="text-sm font-medium mb-1">Something went wrong</p>
        <p className="text-xs text-muted-foreground mb-4">We couldn't load this order. Please try again.</p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={() => refetch()} data-testid="button-retry-order">
            Retry
          </Button>
          <Button variant="ghost" onClick={() => navigate("/orders")}>
            Back to Orders
          </Button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="pb-24 max-w-lg mx-auto px-5 pt-12 text-center">
        <p className="text-sm text-muted-foreground">Order not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/orders")}>
          Back to Orders
        </Button>
      </div>
    );
  }

  const bags = (() => {
    try { return JSON.parse(order.bags || "[]"); } catch { return []; }
  })();

  return (
    <div className="pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/orders")} className="h-11 w-11 -ml-2 rounded-lg hover:bg-muted transition-colors flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">{order.orderNumber}</p>
            <p className="text-xs text-muted-foreground">Order Tracking</p>
          </div>
        </div>
      </div>

      {/* Status banner */}
      <div className="px-5 mt-4 mb-4">
        <Card className="p-4 bg-primary/5 border-primary/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <Badge className="bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-0.5">
                {currentLabel}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                Updated {order.createdAt ? formatDate(order.createdAt) : "recently"}
              </p>
              {(order as any).eta && (
                <p className="text-xs text-muted-foreground mt-1">ETA: {new Date((order as any).eta).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Driver card */}
      {order.driver && (
        <div className="px-5 mb-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                {order.driver.avatar ? (
                  <img src={order.driver.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{order.driver.name}</p>
                <p className="text-xs text-muted-foreground">
                  Your Driver
                  {order.driver.rating && ` · ${order.driver.rating} ★`}
                </p>
                {order.driver.vehicleInfo && (
                  <p className="text-xs text-muted-foreground">{order.driver.vehicleInfo}</p>
                )}
              </div>
              <div className="flex gap-2">
                {order.driver.phone && (
                  <a href={`tel:${order.driver.phone}`}>
                    <Button variant="outline" size="icon" className="h-11 w-11 rounded-full" data-testid="button-call-driver">
                      <Phone className="w-4 h-4" />
                    </Button>
                  </a>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-full"
                  onClick={() => navigate("/chat")}
                  data-testid="button-message-driver"
                >
                  <MessageCircle className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Vendor card */}
      {order.vendor && (
        <div className="px-5 mb-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold">{order.vendor.name}</p>
                  {order.vendor.certified && (
                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0">
                      Certified
                    </Badge>
                  )}
                </div>
                {order.vendor.address && (
                  <p className="text-xs text-muted-foreground">{order.vendor.address}</p>
                )}
              </div>
              {order.vendor.phone && (
                <a href={`tel:${order.vendor.phone}`}>
                  <Button variant="outline" size="icon" className="h-11 w-11 rounded-full" data-testid="button-call-vendor">
                    <Phone className="w-4 h-4" />
                  </Button>
                </a>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Tracking map */}
      <div className="px-5 mb-4">
        <EmbeddedTrackingMap
          driverPos={order.driver?.location ?? null}
          pickup={{ lat: 0, lng: 0, address: order.address || "" }}
          delivery={{ lat: 0, lng: 0, address: order.address || "" }}
          isDriverPhase={!!(order.driver && ["driver_assigned", "en_route_pickup", "arrived_pickup", "en_route_delivery", "arrived_delivery"].includes(order.status))}
        />
      </div>

      {/* Order progress timeline */}
      <div className="px-5 mb-4">
        <h3 className="text-sm font-semibold mb-3">Order Progress</h3>
        <Card className="p-4">
          <div className="space-y-0">
            {progressLabels.map((step, idx) => {
              const isLast = idx === progressLabels.length - 1;
              return (
                <div key={step.key} className="flex gap-3">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      step.completed
                        ? "bg-emerald-500 text-white"
                        : step.current
                        ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {step.completed ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : step.current ? (
                        <Clock className="w-3 h-3" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      )}
                    </div>
                    {!isLast && (
                      <div className={`w-0.5 h-6 ${
                        step.completed ? "bg-emerald-500" : "bg-border"
                      }`} />
                    )}
                  </div>

                  {/* Label */}
                  <div className="pb-4">
                    <p className={`text-sm ${
                      step.current ? "font-bold text-primary" : step.completed ? "font-medium" : "text-muted-foreground"
                    }`}>
                      {step.label}
                    </p>
                    {step.timestamp && (
                      <p className="text-[10px] text-muted-foreground">{formatDate(step.timestamp)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Order summary (collapsible) */}
      <div className="px-5 mb-4">
        <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full mb-2">
              <h3 className="text-sm font-semibold">Order Summary</h3>
              {summaryOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="p-4 space-y-3">
              {/* Bags */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Bags</p>
                {bags.length > 0 ? bags.map((b: any, i: number) => (
                  <p key={i} className="text-sm">
                    {b.quantity || 1}x {b.type || b.bagSize || b.size || "bag"}
                  </p>
                )) : (
                  <p className="text-sm text-muted-foreground">Not specified</p>
                )}
              </div>

              {/* Preferences */}
              {order.separated && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Separation</p>
                  <p className="text-sm">Separated by type</p>
                  {order.clothingTypes?.length > 0 && (
                    <p className="text-xs text-muted-foreground">{order.clothingTypes.join(", ")}</p>
                  )}
                </div>
              )}

              {/* Instructions */}
              {order.specialInstructions && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Special Instructions</p>
                  <p className="text-sm">{order.specialInstructions}</p>
                </div>
              )}

              {/* Total */}
              <div className="border-t border-border pt-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">Total</p>
                  <p className="text-lg font-bold text-primary">${(order.total || 0).toFixed(2)}</p>
                </div>
              </div>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
