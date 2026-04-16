import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Zap,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Play,
  Package,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Order } from "@shared/schema";

// Priority levels derived from AI scoring
type Priority = "urgent" | "high" | "normal";

type QueueItem = Order & {
  priority: Priority;
  aiScore: number;
  slaRemainingMinutes: number;
  customerTier: string;
};

type QueueResponse = {
  items: QueueItem[];
  capacity: number;
  currentLoad: number;
};

type TabKey = "all" | "urgent" | "inprogress" | "ready";

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "urgent", label: "Urgent" },
  { key: "inprogress", label: "In Progress" },
  { key: "ready", label: "Ready" },
];

const PRIORITY_CONFIG: Record<
  Priority,
  { label: string; badge: string; border: string; dot: string; icon: React.ElementType }
> = {
  urgent: {
    label: "Urgent",
    badge: "bg-red-500/20 text-red-400 border-red-500/30",
    border: "border-red-500/25",
    dot: "bg-red-400",
    icon: AlertTriangle,
  },
  high: {
    label: "High",
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    border: "border-amber-500/25",
    dot: "bg-amber-400",
    icon: TrendingUp,
  },
  normal: {
    label: "Normal",
    badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    border: "border-emerald-500/25",
    dot: "bg-emerald-400",
    icon: CheckCircle2,
  },
};

const STATUS_NEXT: Record<string, string> = {
  at_laundromat: "washing",
  washing: "wash_complete",
  wash_complete: "packing",
  packing: "ready_for_delivery",
};

const STATUS_DISPLAY: Record<string, string> = {
  at_laundromat: "At Laundromat",
  washing: "Washing",
  wash_complete: "Wash Complete",
  packing: "Packing",
  ready_for_delivery: "Ready",
  picked_up: "Picked Up",
};

function slaCountdown(minutes: number): string {
  if (minutes <= 0) return "OVERDUE";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function inferPriority(order: Order): Priority {
  const sla = order.slaStatus;
  if (sla === "breached" || order.deliverySpeed === "express_3h") return "urgent";
  if (sla === "at_risk" || order.deliverySpeed === "same_day") return "high";
  return "normal";
}

function slaRemainingMinutes(order: Order): number {
  if (!order.slaDeadline) return 999;
  const deadline = new Date(order.slaDeadline).getTime();
  const now = Date.now();
  return Math.round((deadline - now) / 60000);
}

// Enrich raw orders with priority info
function enrichOrders(orders: Order[]): QueueItem[] {
  return orders
    .map((o) => ({
      ...o,
      priority: inferPriority(o),
      aiScore: o.aiMatchScore ?? 50,
      slaRemainingMinutes: slaRemainingMinutes(o),
      customerTier: "standard",
    }))
    .sort((a, b) => {
      const pOrder: Record<Priority, number> = { urgent: 0, high: 1, normal: 2 };
      if (pOrder[a.priority] !== pOrder[b.priority]) {
        return pOrder[a.priority] - pOrder[b.priority];
      }
      return a.slaRemainingMinutes - b.slaRemainingMinutes;
    });
}

function filterItems(items: QueueItem[], tab: TabKey): QueueItem[] {
  switch (tab) {
    case "urgent":
      return items.filter((i) => i.priority === "urgent");
    case "inprogress":
      return items.filter((i) => ["washing", "packing"].includes(i.status));
    case "ready":
      return items.filter((i) => i.status === "ready_for_delivery");
    default:
      return items;
  }
}

export default function StaffQueue() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const vendorId = user?.vendorId ?? 1;

  const { data: rawOrders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders", `vendorId=${vendorId}`],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders?vendorId=${vendorId}`);
      return res.json();
    },
  });

  // Also try the dedicated queue endpoint
  const { data: queueData } = useQuery<QueueResponse>({
    queryKey: ["/api/staff/queue", vendorId],
    queryFn: async () => {
      const res = await apiRequest(`/api/staff/queue?vendorId=${vendorId}`);
      return res.json();
    },
    enabled: !!vendorId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      const res = await apiRequest(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Order updated" });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  // Use queue API items if available, otherwise enrich raw orders
  const allQueueItems: QueueItem[] = queueData?.items ?? enrichOrders(
    rawOrders.filter((o) =>
      ["at_laundromat", "washing", "wash_complete", "packing", "ready_for_delivery", "picked_up"].includes(o.status)
    )
  );

  const displayItems = filterItems(allQueueItems, activeTab);
  const capacity = queueData?.capacity ?? 50;
  const currentLoad = queueData?.currentLoad ?? allQueueItems.length;
  const capacityPct = Math.min((currentLoad / capacity) * 100, 100);
  const capacityColor =
    capacityPct > 80 ? "bg-red-400" : capacityPct > 60 ? "bg-amber-400" : "bg-emerald-400";

  const urgentCount = allQueueItems.filter((i) => i.priority === "urgent").length;

  return (
    <div className="min-h-screen bg-background pb-4">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <h1
              data-testid="text-queue-title"
              className="text-xl font-bold text-foreground"
            >
              AI Queue
            </h1>
          </div>
          {urgentCount > 0 && (
            <div
              data-testid="badge-urgent-count"
              className="flex items-center gap-1 bg-red-500/15 text-red-400 text-xs font-bold px-2.5 py-1 rounded-full"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {urgentCount} urgent
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Smart order prioritization
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-4">
        {/* Capacity Indicator */}
        <div data-testid="card-capacity" className="p-4 rounded-2xl bg-card border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-foreground">Capacity</p>
            <p className="text-sm text-muted-foreground">
              <span data-testid="text-current-load" className="font-bold text-foreground">
                {currentLoad}
              </span>{" "}
              / {capacity} orders
            </p>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5">
            <div
              data-testid="capacity-bar"
              className={`h-2.5 rounded-full transition-all duration-500 ${capacityColor}`}
              style={{ width: `${capacityPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {capacityPct >= 80
              ? "Near capacity — prioritize completions"
              : capacityPct >= 60
              ? "Moderate load"
              : "Good capacity available"}
          </p>
        </div>

        {/* Filter Tabs */}
        <div
          data-testid="tabs-queue-filter"
          className="flex gap-2 overflow-x-auto scrollbar-none"
        >
          {TAB_LABELS.map(({ key, label }) => {
            const count =
              key === "all"
                ? allQueueItems.length
                : filterItems(allQueueItems, key).length;
            return (
              <button
                key={key}
                data-testid={`tab-queue-${key}`}
                onClick={() => setActiveTab(key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeTab === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                {count > 0 && (
                  <span
                    className={`text-[11px] rounded-full w-5 h-5 flex items-center justify-center font-bold ${
                      activeTab === key
                        ? "bg-white/25 text-white"
                        : "bg-background text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Queue Items */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
              <Package className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No orders in this category</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayItems.map((item) => {
              const pConfig = PRIORITY_CONFIG[item.priority];
              const PriorityIcon = pConfig.icon;
              const nextStatus = STATUS_NEXT[item.status];
              const slaMin = item.slaRemainingMinutes;
              const slaColor =
                slaMin <= 0
                  ? "text-red-400"
                  : slaMin < 60
                  ? "text-amber-400"
                  : "text-emerald-400";

              let bagCount = 0;
              try {
                const bags = JSON.parse(item.bags);
                bagCount = bags.reduce(
                  (s: number, b: { quantity?: number }) => s + (b.quantity || 1),
                  0
                );
              } catch {}

              return (
                <div
                  key={item.id}
                  data-testid={`card-queue-${item.id}`}
                  className={`p-4 rounded-2xl bg-card border ${pConfig.border} transition-all`}
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          data-testid={`badge-priority-${item.id}`}
                          className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${pConfig.badge}`}
                        >
                          <PriorityIcon className="w-2.5 h-2.5" />
                          {pConfig.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.serviceType?.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        #{item.orderNumber}
                      </p>
                      {bagCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {bagCount} bag{bagCount !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>

                    {/* SLA Countdown */}
                    <div className="text-right">
                      <div
                        data-testid={`badge-status-${item.id}`}
                        className="text-[10px] font-medium text-muted-foreground mb-0.5"
                      >
                        {STATUS_DISPLAY[item.status] ?? item.status}
                      </div>
                      <div
                        data-testid={`text-sla-${item.id}`}
                        className={`text-sm font-bold flex items-center gap-1 justify-end ${slaColor}`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        {slaCountdown(slaMin)}
                      </div>
                      <p className="text-[10px] text-muted-foreground">SLA deadline</p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3">
                    {nextStatus && (
                      <button
                        data-testid={`btn-start-${item.id}`}
                        onClick={() =>
                          updateStatusMutation.mutate({
                            orderId: item.id,
                            status: nextStatus,
                          })
                        }
                        disabled={updateStatusMutation.isPending}
                        className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition-colors disabled:opacity-50"
                      >
                        {updateStatusMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        {item.status === "at_laundromat"
                          ? "Start Processing"
                          : item.status === "packing"
                          ? "Mark Ready"
                          : "Advance"}
                      </button>
                    )}
                    {item.status === "ready_for_delivery" && (
                      <button
                        data-testid={`btn-complete-${item.id}`}
                        onClick={() =>
                          updateStatusMutation.mutate({
                            orderId: item.id,
                            status: "out_for_delivery",
                          })
                        }
                        disabled={updateStatusMutation.isPending}
                        className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Send for Delivery
                      </button>
                    )}
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
