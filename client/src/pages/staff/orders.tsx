import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Package, ChevronRight, Scale, Waves } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import type { Order } from "@shared/schema";

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" },
  confirmed: { label: "Confirmed", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  driver_assigned: { label: "Driver Assigned", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  driver_en_route_pickup: { label: "Driver Picking Up", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  pickup_in_progress: { label: "Pickup", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  picked_up: { label: "Picked Up", color: "bg-sky-500/15 text-sky-400 border-sky-500/20" },
  at_laundromat: { label: "At Laundromat", color: "bg-green-500/15 text-green-400 border-green-500/20" },
  washing: { label: "Washing", color: "bg-primary/15 text-primary border-primary/20" },
  wash_complete: { label: "Wash Complete", color: "bg-primary/15 text-primary border-primary/20" },
  packing: { label: "Packing", color: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
  ready_for_delivery: { label: "Ready", color: "bg-green-500/15 text-green-400 border-green-500/20" },
  out_for_delivery: { label: "Delivering", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  delivered: { label: "Delivered", color: "bg-green-500/15 text-green-400 border-green-500/20" },
  cancelled: { label: "Cancelled", color: "bg-red-500/15 text-red-400 border-red-500/20" },
};

const WASHING_STATUSES = ["at_laundromat", "washing", "wash_complete", "packing", "ready_for_delivery"];

export default function StaffOrdersPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const vendorId = user?.vendorId || 1;
  const [tab, setTab] = useState<"orders" | "washing">("orders");

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders", `vendorId=${vendorId}`],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders?vendorId=${vendorId}`);
      return res.json();
    },
  });

  // Filter to orders that are relevant for staff (at laundromat through delivery)
  const staffOrders = orders.filter((o) =>
    [
      "at_laundromat",
      "washing",
      "wash_complete",
      "packing",
      "ready_for_delivery",
      "picked_up",
    ].includes(o.status)
  );

  const allOrders = orders.filter((o) => o.status !== "cancelled");
  const washingOrders = orders.filter((o) => WASHING_STATUSES.includes(o.status));
  const displayOrders = tab === "washing" ? washingOrders : allOrders;

  return (
    <div className="min-h-screen bg-background pb-4">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
        <h1
          data-testid="text-page-title"
          className="text-xl font-extrabold text-white tracking-tight mb-1"
        >
          Offload Staff
        </h1>
        <p className="text-sm text-muted-foreground">Manage incoming orders</p>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-4">
        {/* Tabs */}
        <div className="flex gap-2" data-testid="staff-tabs">
          <button
            data-testid="tab-orders"
            onClick={() => setTab("orders")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              tab === "orders"
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All Orders ({allOrders.length})
          </button>
          <button
            data-testid="tab-washing"
            onClick={() => setTab("washing")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              tab === "washing"
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Washing ({washingOrders.length})
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div
            data-testid="stat-active"
            className="p-3 rounded-2xl bg-card border border-border text-center"
          >
            <p className="text-xl font-bold text-foreground">
              {staffOrders.length}
            </p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
          <div
            data-testid="stat-washing"
            className="p-3 rounded-2xl bg-card border border-border text-center"
          >
            <p className="text-xl font-bold text-foreground">
              {orders.filter((o) => o.status === "washing").length}
            </p>
            <p className="text-xs text-muted-foreground">Washing</p>
          </div>
          <div
            data-testid="stat-ready"
            className="p-3 rounded-2xl bg-card border border-border text-center"
          >
            <p className="text-xl font-bold text-foreground">
              {orders.filter((o) => o.status === "ready_for_delivery").length}
            </p>
            <p className="text-xs text-muted-foreground">Ready</p>
          </div>
        </div>

        {/* Orders needing action */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : displayOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
              <Package className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {tab === "washing" ? "No orders in the wash" : "No orders yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {tab === "washing" ? "In the Wash" : "All Orders"}
            </h2>
            {displayOrders.map((order) => {
              const config = statusConfig[order.status] || {
                label: order.status,
                color: "bg-muted text-muted-foreground",
              };
              const needsWeigh = order.status === "at_laundromat" && !order.intakeWeight;
              const canWash = order.status === "at_laundromat" && !!order.intakeWeight;

              // Derive customer display from order
              const customerDisplay = `Customer #${order.customerId}`;

              // Parse bags for count
              let bagCount = 0;
              try {
                const bags = JSON.parse(order.bags);
                bagCount = bags.reduce(
                  (sum: number, b: { quantity?: number }) => sum + (b.quantity || 1),
                  0
                );
              } catch {}

              const scheduledTime = order.scheduledPickup
                ? new Date(order.scheduledPickup).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })
                : null;

              return (
                <div
                  key={order.id}
                  data-testid={`card-order-${order.id}`}
                  className="p-4 rounded-2xl bg-card border border-border"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        #{order.orderNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {customerDisplay}
                      </p>
                      {bagCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {bagCount} bag{bagCount !== 1 ? "s" : ""}
                        </p>
                      )}
                      {scheduledTime && (
                        <p className="text-xs text-muted-foreground">
                          Scheduled: {scheduledTime}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${config.color}`}
                    >
                      {config.label}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3">
                    {needsWeigh && (
                      <button
                        data-testid={`button-weigh-${order.id}`}
                        type="button"
                        onClick={() => navigate(`/staff/weigh/${order.id}`)}
                        className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-blue-500/15 text-blue-400 text-xs font-semibold hover:bg-blue-500/25 transition-colors"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        Weigh & Photo
                      </button>
                    )}
                    {canWash && (
                      <button
                        data-testid={`button-wash-${order.id}`}
                        type="button"
                        onClick={() => navigate(`/staff/wash/${order.id}`)}
                        className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition-colors"
                      >
                        <Waves className="w-3.5 h-3.5" />
                        Start Washing
                      </button>
                    )}
                    <button
                      data-testid={`button-view-${order.id}`}
                      type="button"
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="flex items-center justify-center gap-1 h-9 px-3 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/80 transition-colors"
                    >
                      View
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
