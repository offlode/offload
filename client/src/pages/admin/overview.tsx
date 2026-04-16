import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  DollarSign, Package, Store, Truck, AlertTriangle,
  TrendingUp, Clock, CheckCircle2, XCircle, Plus,
  RefreshCw, Activity, ArrowRight, ShieldAlert, Star
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "./layout";
import { apiRequest } from "@/lib/queryClient";
import type { Order, OrderEvent } from "@shared/schema";

interface Metrics {
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  totalVendors: number;
  activeVendors: number;
  totalDrivers: number;
  availableDrivers: number;
  openDisputes: number;
  statusCounts: Record<string, number>;
  revenueByVendor: Record<string, number>;
  slaBreached: number;
  slaAtRisk: number;
  avgRating: number;
  totalVendorPayouts: number;
  totalDriverPayouts: number;
  platformRevenue: number;
}

function MetricCard({
  label, value, icon, iconColor, subtext, index
}: {
  label: string; value: string; icon: React.ReactNode;
  iconColor: string; subtext?: string; index?: number;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), (index || 0) * 60);
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <Card
      className={`p-4 transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
      data-testid={`metric-${label.toLowerCase().replace(/\s/g, '-')}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg ${iconColor} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {subtext && <p className="text-[10px] text-muted-foreground mt-1">{subtext}</p>}
    </Card>
  );
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-amber-500" },
  confirmed: { label: "Confirmed", color: "bg-blue-500" },
  driver_assigned: { label: "Driver Assigned", color: "bg-blue-400" },
  pickup_in_progress: { label: "Pickup", color: "bg-primary" },
  picked_up: { label: "Picked Up", color: "bg-primary/80" },
  at_laundromat: { label: "At Laundromat", color: "bg-cyan-500" },
  washing: { label: "Washing", color: "bg-cyan-400" },
  wash_complete: { label: "Wash Done", color: "bg-primary" },
  packing: { label: "Packing", color: "bg-sky-500" },
  ready_for_delivery: { label: "Ready", color: "bg-sky-400" },
  out_for_delivery: { label: "Delivering", color: "bg-orange-500" },
  delivered: { label: "Delivered", color: "bg-emerald-500" },
  cancelled: { label: "Cancelled", color: "bg-red-500" },
  disputed: { label: "Disputed", color: "bg-red-400" },
};

const eventTypeLabels: Record<string, string> = {
  order_placed: "Order placed",
  order_confirmed: "Order confirmed",
  driver_assigned: "Driver assigned",
  pickup_started: "Pickup started",
  pickup_confirmed: "Pickup confirmed",
  arrived_laundromat: "Arrived at laundromat",
  intake_completed: "Intake completed",
  wash_started: "Wash started",
  wash_completed: "Wash completed",
  packing_completed: "Packing completed",
  ready_for_delivery: "Ready for delivery",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

export default function AdminOverview() {
  const { data: metrics, isLoading, dataUpdatedAt } = useQuery<Metrics>({
    queryKey: ["/api/admin/metrics"],
  });
  const { data: orders } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  // Get recent events from the most recent orders
  const recentOrderIds = (orders || []).slice(0, 5).map(o => o.id);
  const { data: allEvents } = useQuery<OrderEvent[]>({
    queryKey: ["/api/orders", recentOrderIds[0], "events"],
    queryFn: async () => {
      if (!recentOrderIds.length) return [];
      const results: OrderEvent[] = [];
      for (const oid of recentOrderIds) {
        try {
          const res = await apiRequest(`/api/orders/${oid}/events`);
          const events = await res.json();
          results.push(...events);
        } catch { /* skip */ }
      }
      return results.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ).slice(0, 5);
    },
    enabled: recentOrderIds.length > 0,
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold" data-testid="text-admin-title">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real-time operations overview
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <RefreshCw className="w-3 h-3" />
                Updated {lastUpdated}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <Link href="/admin/orders">
            <Button size="sm" className="text-xs h-8 gap-1.5" data-testid="button-quick-create-order">
              <Plus className="w-3.5 h-3.5" /> Create Order
            </Button>
          </Link>
          <Link href="/admin/vendors">
            <Button size="sm" variant="secondary" className="text-xs h-8 gap-1.5" data-testid="button-quick-add-vendor">
              <Store className="w-3.5 h-3.5" /> Add Vendor
            </Button>
          </Link>
          <Link href="/admin/drivers">
            <Button size="sm" variant="secondary" className="text-xs h-8 gap-1.5" data-testid="button-quick-add-driver">
              <Truck className="w-3.5 h-3.5" /> Add Driver
            </Button>
          </Link>
        </div>

        {/* KPI Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : metrics ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                label="Total Revenue"
                value={`$${metrics.totalRevenue.toLocaleString()}`}
                icon={<DollarSign className="w-[18px] h-[18px] text-emerald-400" />}
                iconColor="bg-emerald-500/10"
                index={0}
              />
              <MetricCard
                label="Platform Revenue"
                value={`$${metrics.platformRevenue.toLocaleString()}`}
                icon={<TrendingUp className="w-[18px] h-[18px] text-primary" />}
                iconColor="bg-primary/10"
                subtext={`After $${metrics.totalVendorPayouts.toLocaleString()} vendor + $${metrics.totalDriverPayouts.toLocaleString()} driver payouts`}
                index={1}
              />
              <MetricCard
                label="Total Orders"
                value={metrics.totalOrders.toString()}
                icon={<Package className="w-[18px] h-[18px] text-blue-400" />}
                iconColor="bg-blue-500/10"
                subtext={`${metrics.activeOrders} active`}
                index={2}
              />
              <MetricCard
                label="Avg Order Value"
                value={`$${metrics.avgOrderValue.toFixed(2)}`}
                icon={<TrendingUp className="w-[18px] h-[18px] text-primary" />}
                iconColor="bg-primary/10"
                index={3}
              />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                label="Active Vendors"
                value={`${metrics.activeVendors}/${metrics.totalVendors}`}
                icon={<Store className="w-[18px] h-[18px] text-cyan-400" />}
                iconColor="bg-cyan-500/10"
                index={4}
              />
              <MetricCard
                label="Available Drivers"
                value={`${metrics.availableDrivers}/${metrics.totalDrivers}`}
                icon={<Truck className="w-[18px] h-[18px] text-orange-400" />}
                iconColor="bg-orange-500/10"
                index={5}
              />
              <MetricCard
                label="Completed"
                value={metrics.completedOrders.toString()}
                icon={<CheckCircle2 className="w-[18px] h-[18px] text-emerald-400" />}
                iconColor="bg-emerald-500/10"
                index={6}
              />
              <MetricCard
                label="Cancelled"
                value={metrics.cancelledOrders.toString()}
                icon={<XCircle className="w-[18px] h-[18px] text-red-400" />}
                iconColor="bg-red-500/10"
                index={7}
              />
            </div>

            {/* SLA + Disputes + Rating row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                label="SLA Breached"
                value={metrics.slaBreached.toString()}
                icon={<ShieldAlert className="w-[18px] h-[18px] text-red-400" />}
                iconColor="bg-red-500/10"
                index={8}
              />
              <MetricCard
                label="SLA At Risk"
                value={metrics.slaAtRisk.toString()}
                icon={<Clock className="w-[18px] h-[18px] text-amber-400" />}
                iconColor="bg-amber-500/10"
                index={9}
              />
              <MetricCard
                label="Open Disputes"
                value={metrics.openDisputes.toString()}
                icon={<AlertTriangle className="w-[18px] h-[18px] text-amber-400" />}
                iconColor="bg-amber-500/10"
                index={10}
              />
              <MetricCard
                label="Avg Rating"
                value={metrics.avgRating > 0 ? `${metrics.avgRating}/5` : "—"}
                icon={<Star className="w-[18px] h-[18px] text-yellow-400" />}
                iconColor="bg-yellow-500/10"
                index={11}
              />
            </div>

            {/* Pipeline + Revenue + Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Order Pipeline */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Order Pipeline</h3>
                  <Link href="/admin/orders">
                    <button className="text-[10px] text-primary hover:underline flex items-center gap-0.5" data-testid="link-view-all-orders">
                      View all <ArrowRight className="w-3 h-3" />
                    </button>
                  </Link>
                </div>
                <div className="space-y-2">
                  {Object.entries(metrics.statusCounts).map(([status, count]) => {
                    const info = statusLabels[status] || { label: status, color: "bg-muted" };
                    const percentage = metrics.totalOrders > 0 ? (count / metrics.totalOrders) * 100 : 0;
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <div className="w-20 text-xs text-muted-foreground truncate">{info.label}</div>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${info.color} rounded-full transition-all duration-700`}
                            style={{ width: `${Math.max(percentage, 3)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium w-6 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Revenue by Vendor */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold mb-4">Revenue by Vendor</h3>
                <div className="space-y-3">
                  {Object.entries(metrics.revenueByVendor).length > 0 ? (
                    Object.entries(metrics.revenueByVendor).map(([vendor, revenue]) => {
                      const maxRevenue = Math.max(...Object.values(metrics.revenueByVendor));
                      const barWidth = maxRevenue > 0 ? (revenue / maxRevenue) * 100 : 0;
                      return (
                        <div key={vendor}>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-medium truncate max-w-[140px]">{vendor}</p>
                            <p className="text-xs font-semibold">${revenue.toFixed(2)}</p>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary/60 rounded-full transition-all duration-700"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">No revenue data yet</p>
                  )}
                </div>
              </Card>

              {/* Recent Activity Feed */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {(allEvents || []).length > 0 ? (
                    (allEvents || []).map(ev => {
                      const order = (orders || []).find(o => o.id === ev.orderId);
                      return (
                        <div key={ev.id} className="flex items-start gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium">
                              {eventTypeLabels[ev.eventType] || ev.eventType.replace(/_/g, " ")}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {order?.orderNumber || `Order #${ev.orderId}`} ·{" "}
                              {new Date(ev.timestamp).toLocaleString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-4">
                      <Activity className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No recent activity</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
