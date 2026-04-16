import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Waves, Clock, ChevronRight, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { Order } from "@shared/schema";

// FSM-aware active statuses for staff
const ACTIVE_STATUSES = ["at_facility", "processing", "washing", "drying", "folding", "wash_complete", "packing"];

const nextStatusMap: Record<string, { status: string; label: string; useFsm?: boolean }> = {
  at_facility: { status: "processing", label: "Start Processing", useFsm: true },
  processing: { status: "washing", label: "Start Washing", useFsm: true },
  washing: { status: "drying", label: "Move to Dryer", useFsm: true },
  drying: { status: "folding", label: "Start Folding", useFsm: true },
  folding: { status: "ready_for_delivery", label: "Ready for Delivery", useFsm: true },
  // Legacy compat
  wash_complete: { status: "packing", label: "Start Packing" },
  packing: { status: "ready_for_delivery", label: "Mark Ready" },
};

const statusBadgeMap: Record<string, { label: string; color: string }> = {
  at_facility: { label: "At Facility", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  processing: { label: "Processing", color: "bg-sky-500/15 text-sky-400 border-sky-500/20" },
  washing: { label: "Washing", color: "bg-primary/15 text-primary border-primary/20" },
  drying: { label: "Drying", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20" },
  folding: { label: "Folding", color: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
  wash_complete: { label: "Wash Complete", color: "bg-primary/15 text-primary border-primary/20" },
  packing: { label: "Packing", color: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
  ready_for_delivery: { label: "Ready", color: "bg-green-500/15 text-green-400 border-green-500/20" },
};

export default function StaffActivePage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const vendorId = user?.vendorId || 1;

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders", `vendorId=${vendorId}`],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders?vendorId=${vendorId}`);
      return res.json();
    },
  });

  // Filter active statuses client-side
  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const washingOrders = orders.filter((o) => o.status === "washing");
  const recentlyCompleted = orders.filter((o) => o.status === "wash_complete");
  const packingOrders = orders.filter((o) => o.status === "packing");

  const advanceStatusMutation = useMutation({
    mutationFn: async ({
      orderId,
      status,
      useFsm,
    }: {
      orderId: number;
      status: string;
      useFsm?: boolean;
    }) => {
      if (useFsm) {
        await apiRequest(`/api/orders/${orderId}/transition`, {
          method: "POST",
          body: JSON.stringify({
            newStatus: status,
            actorRole: "laundromat",
            actorId: user?.id,
          }),
        });
      } else {
        await apiRequest(`/api/orders/${orderId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status, actorRole: "vendor" }),
        });
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", `vendorId=${vendorId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      const labels: Record<string, string> = {
        processing: "Processing started!",
        washing: "Washing started!",
        drying: "Moved to dryer!",
        folding: "Folding started!",
        ready_for_delivery: "Order is ready for delivery!",
        wash_complete: "Marked as wash complete",
        packing: "Started packing",
      };
      toast({ title: labels[status] || "Status updated" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to update status",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function OrderCard({ order }: { order: Order }) {
    const badge = statusBadgeMap[order.status];
    const next = nextStatusMap[order.status];
    const isPending = advanceStatusMutation.isPending;

    return (
      <div
        data-testid={`card-active-${order.id}`}
        className="p-4 rounded-2xl bg-card border border-border"
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              #{order.orderNumber}
            </p>
            <p className="text-xs text-muted-foreground">
              Customer #{order.customerId}
            </p>
          </div>
          {badge && (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badge.color}`}
            >
              {order.status === "washing" && <Waves className="w-3 h-3" />}
              {badge.label}
            </span>
          )}
        </div>

        {/* Progress indicator for washing */}
        {order.status === "washing" && (
          <div className="mt-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">In progress...</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary animate-pulse w-2/3" />
            </div>
          </div>
        )}

        {/* Intake weight display */}
        {order.intakeWeight && (
          <p className="text-xs text-muted-foreground mb-3">
            Intake weight: {order.intakeWeight} lbs
          </p>
        )}

        <div className="flex gap-2 mt-2">
          {next && (
            <button
              data-testid={`button-advance-${order.id}`}
              type="button"
              disabled={isPending}
              onClick={() =>
                advanceStatusMutation.mutate({
                  orderId: order.id,
                  status: next.status,
                  useFsm: next.useFsm,
                })
              }
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition-colors disabled:opacity-50"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              {next.label}
            </button>
          )}
          <button
            data-testid={`button-view-active-${order.id}`}
            type="button"
            onClick={() => navigate(`/orders/${order.id}`)}
            className="flex items-center justify-center gap-1 h-9 px-3 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/80 transition-colors"
          >
            Details
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-4">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
        <h1
          data-testid="text-page-title"
          className="text-lg font-bold text-foreground mb-1"
        >
          Active Washing
        </h1>
        <p className="text-sm text-muted-foreground">
          Monitor ongoing wash cycles
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
              <Waves className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No active wash cycles</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Start washing from the Orders tab
            </p>
          </div>
        ) : (
          <>
            {/* Currently Washing */}
            {washingOrders.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  In Progress ({washingOrders.length})
                </h2>
                {washingOrders.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            )}

            {/* Wash Complete / Needs Packing */}
            {recentlyCompleted.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Wash Complete ({recentlyCompleted.length})
                </h2>
                {recentlyCompleted.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            )}

            {/* Packing */}
            {packingOrders.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Packing ({packingOrders.length})
                </h2>
                {packingOrders.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
