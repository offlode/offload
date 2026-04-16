import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  ChevronDown, ChevronRight, Clock, Search, Filter,
  MapPin, Package, Truck, Download, CheckSquare, Square,
  ArrowRight, User as UserIcon, Phone, Calendar
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { AdminLayout } from "./layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order, Vendor, OrderEvent, User } from "@shared/schema";

const allStatuses = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "driver_assigned", label: "Driver Assigned" },
  { value: "pickup_in_progress", label: "Pickup In Progress" },
  { value: "picked_up", label: "Picked Up" },
  { value: "at_laundromat", label: "At Laundromat" },
  { value: "washing", label: "Washing" },
  { value: "wash_complete", label: "Wash Complete" },
  { value: "packing", label: "Packing" },
  { value: "ready_for_delivery", label: "Ready For Delivery" },
  { value: "out_for_delivery", label: "Out For Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const statusColors: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  confirmed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  driver_assigned: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  pickup_in_progress: "bg-primary/10 text-primary border-primary/20",
  picked_up: "bg-primary/10 text-primary border-primary/20",
  at_laundromat: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  washing: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  wash_complete: "bg-primary/10 text-primary border-primary/20",
  packing: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  ready_for_delivery: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  out_for_delivery: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  delivered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  disputed: "bg-red-500/10 text-red-400 border-red-500/20",
};

const validTransitions: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["driver_assigned", "cancelled"],
  driver_assigned: ["pickup_in_progress", "cancelled"],
  pickup_in_progress: ["picked_up"],
  picked_up: ["at_laundromat"],
  at_laundromat: ["washing"],
  washing: ["wash_complete"],
  wash_complete: ["packing"],
  packing: ["ready_for_delivery"],
  ready_for_delivery: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
};

const statusOrder = [
  "pending", "confirmed", "driver_assigned", "pickup_in_progress", "picked_up",
  "at_laundromat", "washing", "wash_complete", "packing", "ready_for_delivery",
  "out_for_delivery", "delivered",
];

function StatusProgress({ currentStatus }: { currentStatus: string }) {
  const idx = statusOrder.indexOf(currentStatus);
  if (idx === -1) return null;
  const progress = ((idx + 1) / statusOrder.length) * 100;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
        {idx + 1}/{statusOrder.length}
      </span>
    </div>
  );
}

function OrderRow({ order, vendors, selected, onToggleSelect }: {
  order: Order;
  vendors: Vendor[];
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");
  const { toast } = useToast();
  const vendor = vendors.find(v => v.id === order.vendorId);
  const bags = JSON.parse(order.bags || "[]");
  const colorClass = statusColors[order.status] || "bg-muted text-muted-foreground";

  const { data: events } = useQuery<OrderEvent[]>({
    queryKey: ["/api/orders", order.id, "events"],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders/${order.id}/events`);
      return res.json();
    },
    enabled: expanded,
  });

  const { data: customer } = useQuery<User>({
    queryKey: ["/api/users", order.customerId],
    queryFn: async () => {
      const res = await apiRequest(`/api/users/${order.customerId}`);
      return res.json();
    },
    enabled: expanded,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ status, description }: { status: string; description: string }) => {
      const res = await apiRequest(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, description, actorRole: "admin" }),
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", order.id, "events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metrics"] });
      toast({
        title: "Status updated",
        description: `Order advanced to ${variables.status.replace(/_/g, " ")}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const nextStatuses = validTransitions[order.status] || [];
  const nextLogicalStatus = nextStatuses.find(s => s !== "cancelled");

  return (
    <Card className="overflow-hidden" data-testid={`admin-order-${order.id}`}>
      <div className="flex items-center">
        <button
          className="p-4 flex items-center shrink-0"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          data-testid={`checkbox-order-${order.id}`}
        >
          {selected ? (
            <CheckSquare className="w-4 h-4 text-primary" />
          ) : (
            <Square className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 p-4 pl-0 flex items-center gap-3 text-left hover:bg-muted/20 transition-colors"
          data-testid={`button-expand-order-${order.id}`}
        >
          <div className="shrink-0">
            {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-5 gap-4 items-center">
            <div>
              <p className="text-sm font-semibold">{order.orderNumber}</p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(order.createdAt || "").toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vendor</p>
              <p className="text-sm font-medium truncate">{vendor?.name || "Unassigned"}</p>
            </div>
            <div>
              <Badge variant="outline" className={`text-[10px] ${colorClass}`}>
                {order.status.replace(/_/g, " ")}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {bags.map((b: any) => `${b.quantity}x ${b.type}`).join(", ")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">${order.total?.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground">{order.deliverySpeed}</p>
            </div>
          </div>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border">
          {/* Status progress bar */}
          {order.status !== "cancelled" && order.status !== "disputed" && (
            <div className="px-4 pt-3">
              <StatusProgress currentStatus={order.status} />
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 pt-3 pb-4">
            <TabsList className="h-8 mb-3">
              <TabsTrigger value="summary" className="text-xs h-7" data-testid={`tab-summary-${order.id}`}>Summary</TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs h-7" data-testid={`tab-timeline-${order.id}`}>Timeline</TabsTrigger>
              <TabsTrigger value="actions" className="text-xs h-7" data-testid={`tab-actions-${order.id}`}>Actions</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-0 space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div>
                  <p className="text-muted-foreground mb-1">Customer</p>
                  {customer ? (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="w-3 h-3 text-muted-foreground" />
                        <span className="font-medium">{customer.name}</span>
                      </div>
                      {customer.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-muted-foreground" />
                          <span>{customer.phone}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Loading...</span>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Pickup Address</p>
                  <div className="flex items-start gap-1.5">
                    <MapPin className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                    <p className="font-medium">{order.pickupAddress}</p>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Delivery</p>
                  <p className="font-medium capitalize">{order.deliveryType?.replace(/_/g, " ")}</p>
                  <p className="text-muted-foreground">{order.deliverySpeed} speed</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Pricing</p>
                  <div className="space-y-0.5">
                    <p>Subtotal: ${order.subtotal?.toFixed(2)}</p>
                    <p>Tax: ${order.tax?.toFixed(2)}</p>
                    <p>Fee: ${order.deliveryFee?.toFixed(2)}</p>
                    <p className="font-semibold text-foreground">Total: ${order.total?.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="mt-0">
              {events && events.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {events.map((ev, i) => (
                    <div key={ev.id} className="flex items-start gap-2.5 text-xs">
                      <div className="flex flex-col items-center shrink-0">
                        <div className={`w-2 h-2 rounded-full ${i === events.length - 1 ? "bg-primary" : "bg-muted-foreground/40"}`} />
                        {i < events.length - 1 && (
                          <div className="w-px h-4 bg-border" />
                        )}
                      </div>
                      <div className="flex-1 pb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">{ev.eventType?.replace(/_/g, " ")}</span>
                          {ev.actorRole && (
                            <Badge variant="outline" className="text-[9px] h-4">
                              {ev.actorRole}
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground">
                          {ev.description}
                        </p>
                        <p className="text-muted-foreground/60 text-[10px]">
                          {new Date(ev.timestamp || "").toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No events recorded</p>
              )}
            </TabsContent>

            <TabsContent value="actions" className="mt-0 space-y-3">
              {nextStatuses.length > 0 ? (
                <>
                  {nextLogicalStatus && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Quick advance to next step:</p>
                      <Button
                        size="sm"
                        className="text-xs h-8 gap-1.5"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({
                          status: nextLogicalStatus,
                          description: `Admin advanced to ${nextLogicalStatus.replace(/_/g, " ")}`,
                        })}
                        data-testid={`action-next-step-${order.id}`}
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Advance to {nextLogicalStatus.replace(/_/g, " ")}
                      </Button>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">All available transitions:</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {nextStatuses.map(s => (
                        <Button
                          key={s}
                          size="sm"
                          variant={s === "cancelled" ? "destructive" : "secondary"}
                          className="text-xs h-7"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({
                            status: s,
                            description: `Admin advanced to ${s.replace(/_/g, " ")}`,
                          })}
                          data-testid={`action-status-${s}-${order.id}`}
                        >
                          {s.replace(/_/g, " ")}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No status transitions available for "{order.status.replace(/_/g, " ")}" orders
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </Card>
  );
}

export default function AdminOrders() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });
  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const filtered = useMemo(() => {
    return (orders || []).filter(o => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !o.orderNumber.toLowerCase().includes(q) &&
          !o.pickupAddress?.toLowerCase().includes(q)
        ) return false;
      }
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (new Date(o.createdAt) < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(o.createdAt) > to) return false;
      }
      return true;
    });
  }, [orders, statusFilter, search, dateFrom, dateTo]);

  const toggleSelect = (id: number) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrders.size === filtered.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filtered.map(o => o.id)));
    }
  };

  const handleExport = () => {
    const exportData = filtered.filter(o =>
      selectedOrders.size === 0 || selectedOrders.has(o.id)
    );

    const csvHeaders = "Order Number,Status,Total,Delivery Speed,Pickup Address,Created At\n";
    const csvRows = exportData.map(o =>
      `"${o.orderNumber}","${o.status}","${o.total?.toFixed(2)}","${o.deliverySpeed}","${o.pickupAddress}","${o.createdAt}"`
    ).join("\n");
    const csvContent = csvHeaders + csvRows;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `offload-orders-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExportDialogOpen(false);
    toast({ title: "Exported", description: `${exportData.length} orders exported to CSV` });
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold" data-testid="text-admin-orders">Orders Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              View, track, and manage all orders across the platform
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedOrders.size > 0 && (
              <Badge variant="secondary" className="text-xs">
                {selectedOrders.size} selected
              </Badge>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="text-xs h-8 gap-1.5"
              onClick={() => setExportDialogOpen(true)}
              data-testid="button-export-orders"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by order number or address..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
              data-testid="input-search-orders"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48 h-9" data-testid="select-status-filter">
              <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {allStatuses.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-9 w-36 text-xs"
                placeholder="From"
                data-testid="input-date-from"
              />
            </div>
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-9 w-36 text-xs"
              placeholder="To"
              data-testid="input-date-to"
            />
          </div>
        </div>

        {/* Bulk select header */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-select-all-orders"
            >
              {selectedOrders.size === filtered.length ? (
                <CheckSquare className="w-4 h-4 text-primary" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              Select all ({filtered.length})
            </button>
          </div>
        )}

        {/* Orders List */}
        {ordersLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-2">
            {filtered.map(order => (
              <OrderRow
                key={order.id}
                order={order}
                vendors={vendors}
                selected={selectedOrders.has(order.id)}
                onToggleSelect={() => toggleSelect(order.id)}
              />
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No orders found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search || statusFilter !== "all" || dateFrom || dateTo
                ? "Try adjusting your filters"
                : "No orders have been placed yet"
              }
            </p>
          </Card>
        )}
      </div>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Export Orders</DialogTitle>
            <DialogDescription>
              {selectedOrders.size > 0
                ? `Export ${selectedOrders.size} selected orders to CSV`
                : `Export all ${filtered.length} filtered orders to CSV`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExportDialogOpen(false)}
              data-testid="button-cancel-export"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              data-testid="button-confirm-export"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> Download CSV
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
