import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Package, Plus, MapPin, ClipboardList, ArrowRight,
  Clock, CheckCircle2, Truck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
import type { Order } from "@shared/schema";

const FRIENDLY_STATUS: Record<string, string> = {
  pending: "Pending",
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
  delivered: "Delivered",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  confirmed: "bg-blue-500/15 text-blue-400",
  driver_assigned: "bg-blue-500/15 text-blue-400",
  pickup_in_progress: "bg-blue-500/15 text-blue-400",
  picked_up: "bg-cyan-500/15 text-cyan-400",
  at_laundromat: "bg-primary/15 text-primary",
  washing: "bg-primary/15 text-primary",
  wash_complete: "bg-primary/15 text-primary",
  packing: "bg-primary/15 text-primary",
  ready_for_delivery: "bg-sky-500/15 text-sky-400",
  out_for_delivery: "bg-blue-500/15 text-blue-400",
  delivered: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-red-500/15 text-red-400",
  disputed: "bg-orange-500/15 text-orange-400",
};

function friendlyStatus(s: string) {
  return FRIENDLY_STATUS[s] || s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const userId = user?.id;

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: [`/api/orders?customerId=${userId}`],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders?customerId=${userId}`);
      return res.json();
    },
    enabled: !!userId,
  });

  const activeOrders = orders?.filter(
    (o) => !["delivered", "cancelled", "disputed"].includes(o.status)
  ) || [];
  const mostRecent = orders?.[0] ?? null;
  const upcomingCount = activeOrders.length;

  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  return (
    <div className="pb-24 max-w-lg mx-auto">
      {/* Greeting */}
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold" data-testid="text-dashboard-greeting">
          {getGreeting()}, {firstName} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {upcomingCount > 0
            ? `You have ${upcomingCount} active order${upcomingCount !== 1 ? "s" : ""}`
            : "No active orders right now"}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="px-5 mb-5">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
          Quick Actions
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Link href="/schedule">
            <Card className="p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/30 transition-all active:scale-95" data-testid="quick-action-new-order">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs font-medium text-center">New Order</span>
            </Card>
          </Link>
          <Link href="/orders">
            <Card className="p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/30 transition-all active:scale-95" data-testid="quick-action-orders">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs font-medium text-center">My Orders</span>
            </Card>
          </Link>
          <Link href="/addresses">
            <Card className="p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/30 transition-all active:scale-95" data-testid="quick-action-addresses">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs font-medium text-center">Addresses</span>
            </Card>
          </Link>
        </div>
      </div>

      {/* Active Orders */}
      {(isLoading || activeOrders.length > 0) && (
        <div className="px-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Active Orders
            </h2>
            <Link href="/orders">
              <span className="text-xs text-primary flex items-center gap-0.5">
                View all <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ) : (
            <div className="space-y-3">
              {activeOrders.slice(0, 3).map((order) => (
                <Link key={order.id} href={`/orders/${order.id}`}>
                  <Card className="p-4 cursor-pointer hover:border-primary/30 transition-all active:scale-[0.99]" data-testid={`dashboard-order-${order.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                          <Truck className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{order.orderNumber}</p>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] mt-1 ${STATUS_STYLES[order.status] || "bg-muted"}`}
                          >
                            {friendlyStatus(order.status)}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">${order.total?.toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3" />
                          {order.scheduledPickup
                            ? new Date(order.scheduledPickup).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                            : "—"}
                        </p>
                      </div>
                    </div>
                    {/* Mini track link */}
                    <Link href={`/tracking/${order.id}`}>
                      <span className="mt-2 text-[11px] text-primary flex items-center gap-1 hover:underline">
                        <MapPin className="w-3 h-3" /> Track order
                      </span>
                    </Link>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Most Recent Order (if no active orders) */}
      {!isLoading && activeOrders.length === 0 && mostRecent && (
        <div className="px-5 mb-5">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
            Most Recent Order
          </h2>
          <Link href={`/orders/${mostRecent.id}`}>
            <Card className="p-4 cursor-pointer hover:border-primary/30 transition-all" data-testid="dashboard-recent-order">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{mostRecent.orderNumber}</p>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] mt-1 ${STATUS_STYLES[mostRecent.status] || "bg-muted"}`}
                  >
                    {friendlyStatus(mostRecent.status)}
                  </Badge>
                </div>
                <p className="text-sm font-bold shrink-0">${mostRecent.total?.toFixed(2)}</p>
              </div>
            </Card>
          </Link>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !orders?.length && (
        <div className="px-5">
          <Card className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-primary/60" />
            </div>
            <p className="text-base font-semibold mb-1">No orders yet</p>
            <p className="text-sm text-muted-foreground mb-5">
              Place your first laundry pickup and we'll take care of the rest.
            </p>
            <Link href="/schedule">
              <Button data-testid="button-place-first-order">
                <Plus className="w-4 h-4 mr-2" />
                Place First Order
              </Button>
            </Link>
          </Card>
        </div>
      )}
    </div>
  );
}
