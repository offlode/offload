/**
 * /track and /track/:orderId — Order tracking entry point
 *
 * - If an orderId param is present, redirect to /tracking/:orderId (existing full page).
 * - If no orderId, show the user's active orders so they can pick one to track,
 *   or enter an order ID manually.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import {
  MapPin, Package, Clock, Search, ArrowRight, Truck, Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
import type { Order } from "@shared/schema";

const ACTIVE_STATUSES = [
  "confirmed", "driver_assigned", "pickup_in_progress", "picked_up",
  "at_laundromat", "washing", "wash_complete", "packing",
  "ready_for_delivery", "out_for_delivery",
];

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  driver_assigned: "Driver Assigned",
  pickup_in_progress: "Picking Up",
  picked_up: "Picked Up",
  at_laundromat: "At Laundromat",
  washing: "Being Washed",
  wash_complete: "Wash Complete",
  packing: "Packing",
  ready_for_delivery: "Ready for Delivery",
  out_for_delivery: "Out for Delivery",
};

export default function TrackEntryPage() {
  const [, paramsWithId] = useRoute("/track/:orderId");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [manualId, setManualId] = useState("");

  // If a direct orderId is in the URL, redirect immediately to the full tracking page
  if (paramsWithId?.orderId) {
    navigate(`/tracking/${paramsWithId.orderId}`, { replace: true });
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const userId = user?.id;

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: [`/api/orders?customerId=${userId}`],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders?customerId=${userId}`);
      return res.json();
    },
    enabled: !!userId,
  });

  const activeOrders = orders?.filter((o) => ACTIVE_STATUSES.includes(o.status)) || [];

  function handleManualTrack() {
    const id = manualId.trim();
    if (!id) return;
    // Strip # prefix if customer pastes the order number like #ORD-123
    const numericId = id.replace(/^#/, "").replace(/^ORD-/i, "");
    navigate(`/tracking/${numericId}`);
  }

  return (
    <div className="pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-xl font-bold" data-testid="text-track-title">Track Your Order</h1>
        <p className="text-sm text-muted-foreground mt-1">
          See real-time status and driver location for your laundry.
        </p>
      </div>

      {/* Manual Order ID entry */}
      <div className="px-5 mb-6">
        <Card className="p-4">
          <p className="text-sm font-semibold mb-3">Enter Order ID</p>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. 42 or ORD-42"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualTrack()}
              data-testid="input-manual-order-id"
            />
            <Button
              onClick={handleManualTrack}
              disabled={!manualId.trim()}
              data-testid="button-track-manual"
            >
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </div>

      {/* Active orders list */}
      {userId && (
        <div className="px-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Active Orders
          </h2>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : activeOrders.length > 0 ? (
            <div className="space-y-3">
              {activeOrders.map((order) => (
                <Link key={order.id} href={`/tracking/${order.id}`}>
                  <Card
                    className="p-4 cursor-pointer hover:border-primary/30 transition-all active:scale-[0.99]"
                    data-testid={`track-order-card-${order.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Truck className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{order.orderNumber}</p>
                        <Badge
                          variant="secondary"
                          className="text-[10px] mt-1 bg-blue-500/15 text-blue-400"
                        >
                          {STATUS_LABELS[order.status] || order.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-primary">
                        <MapPin className="w-3.5 h-3.5" />
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    {order.scheduledPickup && (
                      <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1 ml-12">
                        <Clock className="w-3 h-3" />
                        Pickup:{" "}
                        {new Date(order.scheduledPickup).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="p-10 text-center">
              <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold mb-1">No active orders</p>
              <p className="text-xs text-muted-foreground mb-4">
                Once you place an order, you'll be able to track it here.
              </p>
              <Link href="/schedule">
                <Button size="sm" data-testid="button-schedule-from-track">
                  Schedule Pickup
                </Button>
              </Link>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
