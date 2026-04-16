import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Truck, Star, Phone, Clock, CheckCircle2,
  UserCheck, UserX, Car, Route, Plus, Search, DollarSign,
  BarChart2
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AdminLayout } from "./layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Driver, Order } from "@shared/schema";

const driverStatusColors: Record<string, { bg: string; dot: string }> = {
  available: { bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-500" },
  busy: { bg: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-500" },
  offline: { bg: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground/40" },
  on_delivery: { bg: "bg-blue-500/10 text-blue-400 border-blue-500/20", dot: "bg-blue-500" },
};

interface DriverStats {
  totalTrips: number;
  completedTrips: number;
  avgRating: number;
  earnings: number;
}

function DriverCard({ driver, orders }: { driver: Driver; orders: Order[] }) {
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<string>("available");
  const { toast } = useToast();
  const driverOrders = orders.filter(o => o.driverId === driver.id);
  const activeOrders = driverOrders.filter(o => !["delivered", "cancelled"].includes(o.status));
  const statusInfo = driverStatusColors[driver.status || "offline"] || driverStatusColors.offline;

  const { data: stats } = useQuery<DriverStats>({
    queryKey: ["/api/drivers", driver.id, "stats"],
    queryFn: async () => {
      const res = await apiRequest(`/api/drivers/${driver.id}/stats`);
      return res.json();
    },
  });

  const earnings = stats?.earnings
    ?? driverOrders.filter(o => o.status === "delivered").reduce((sum, o) => sum + (o.deliveryFee || 0), 0);

  const toggleMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await apiRequest(`/api/drivers/${driver.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      return res.json();
    },
    onSuccess: (_data, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metrics"] });
      setStatusDialogOpen(false);
      toast({
        title: "Driver updated",
        description: `${driver.name} is now ${newStatus}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openStatusChange = (status: string) => {
    setTargetStatus(status);
    setStatusDialogOpen(true);
  };

  return (
    <>
      <Card className="p-4" data-testid={`admin-driver-${driver.id}`}>
        <div className="flex items-start gap-4">
          {/* Avatar with status dot */}
          <div className="relative shrink-0">
            <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
              {driver.name?.charAt(0) || "D"}
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card ${statusInfo.dot}`} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Top row */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold">{driver.name}</p>
                  <Badge variant="outline" className={`text-[10px] ${statusInfo.bg}`} data-testid={`driver-status-${driver.id}`}>
                    {driver.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Car className="w-3 h-3" /> {driver.vehicleType || "—"} · {driver.licensePlate || "—"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {driver.phone}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <DollarSign className="w-3 h-3 text-emerald-400" />
                    <span className="text-sm font-bold" data-testid={`driver-earnings-${driver.id}`}>
                      ${earnings.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Earnings</p>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 mb-3 text-xs">
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {stats?.avgRating ?? driver.rating}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <CheckCircle2 className="w-3 h-3" /> {stats?.completedTrips ?? driver.completedTrips} trips
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Route className="w-3 h-3" /> {activeOrders.length} active
              </span>
              {stats && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <BarChart2 className="w-3 h-3" /> {stats.totalTrips} total
                </span>
              )}
            </div>

            {/* Active assignments */}
            {activeOrders.length > 0 && (
              <div className="mb-3 p-2 rounded-lg bg-muted/30 border border-border">
                <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">Current Assignments</p>
                <div className="space-y-1">
                  {activeOrders.map(o => (
                    <div key={o.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Route className="w-3 h-3 text-primary" />
                        <span className="font-medium">{o.orderNumber}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] h-5">
                        {o.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {driver.status !== "available" && (
                <Button
                  size="sm"
                  variant="default"
                  className="text-xs h-7"
                  onClick={() => openStatusChange("available")}
                  data-testid={`action-set-available-${driver.id}`}
                >
                  <UserCheck className="w-3 h-3 mr-1" /> Set Available
                </Button>
              )}
              {driver.status !== "offline" && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="text-xs h-7"
                  onClick={() => openStatusChange("offline")}
                  data-testid={`action-set-offline-${driver.id}`}
                >
                  <UserX className="w-3 h-3 mr-1" /> Set Offline
                </Button>
              )}
              {driver.status !== "busy" && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-xs h-7"
                  onClick={() => openStatusChange("busy")}
                  data-testid={`action-set-busy-${driver.id}`}
                >
                  <Clock className="w-3 h-3 mr-1" /> Set Busy
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Confirmation dialog */}
      <AlertDialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Set {driver.name} to {targetStatus}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {targetStatus === "offline"
                ? "This driver will no longer receive new pickup assignments."
                : targetStatus === "available"
                ? "This driver will be available to receive pickup assignments."
                : "This driver will be marked as busy."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-toggle-driver">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toggleMutation.mutate(targetStatus)}
              className={targetStatus === "offline" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              data-testid="button-confirm-toggle-driver"
            >
              {toggleMutation.isPending ? "Updating..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function AdminDrivers() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();

  const { data: drivers, isLoading } = useQuery<Driver[]>({
    queryKey: ["/api/drivers"],
  });
  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  // Form state
  const [form, setForm] = useState({
    name: "", phone: "", vehicleType: "SUV", licensePlate: "",
  });
  const [driverFieldErrors, setDriverFieldErrors] = useState<{field: string; message: string}[]>([]);

  const clearDriverError = (field: string) => {
    setDriverFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const handleCreateDriver = () => {
    const errors: {field: string; message: string}[] = [];
    if (!form.name.trim()) errors.push({ field: "driverName", message: "Name is required" });
    if (!form.phone.trim()) errors.push({ field: "driverPhone", message: "Phone number is required" });
    if (errors.length > 0) {
      setDriverFieldErrors(errors);
      // Scroll to first error
      const el = document.querySelector(`[data-field="${errors[0].field}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setDriverFieldErrors([]);
    createMutation.mutate();
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/drivers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          vehicleType: form.vehicleType,
          licensePlate: form.licensePlate,
          status: "available",
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metrics"] });
      setCreateDialogOpen(false);
      setForm({ name: "", phone: "", vehicleType: "SUV", licensePlate: "" });
      toast({ title: "Driver added", description: `${form.name} has been registered` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    return (drivers || []).filter(d => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (d.name?.toLowerCase().includes(q)) || (d.phone?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [drivers, searchQuery, statusFilter]);

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold" data-testid="text-admin-drivers">Driver Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Monitor driver availability, assignments, and performance
            </p>
          </div>
          <Button
            size="sm"
            className="text-xs h-8 gap-1.5"
            onClick={() => setCreateDialogOpen(true)}
            data-testid="button-add-driver"
          >
            <Plus className="w-3.5 h-3.5" /> Add Driver
          </Button>
        </div>

        {/* Summary */}
        {drivers && (
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3 flex items-center gap-3">
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
              </div>
              <div>
                <p className="text-lg font-bold">{drivers.filter(d => d.status === "available").length}</p>
                <p className="text-[10px] text-muted-foreground">Available</p>
              </div>
            </Card>
            <Card className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-lg font-bold">{drivers.filter(d => d.status === "busy" || d.status === "on_delivery").length}</p>
                <p className="text-[10px] text-muted-foreground">Busy</p>
              </div>
            </Card>
            <Card className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <Truck className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-lg font-bold">{drivers.length}</p>
                <p className="text-[10px] text-muted-foreground">Total</p>
              </div>
            </Card>
          </div>
        )}

        {/* Search + Filter */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search drivers by name or phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
              data-testid="input-search-drivers"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-9" data-testid="select-driver-status-filter">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="busy">Busy</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="on_delivery">On Delivery</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Drivers List */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map(driver => (
              <DriverCard key={driver.id} driver={driver} orders={orders} />
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Truck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No drivers found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {searchQuery || statusFilter !== "all" ? "Try adjusting your filters" : "Add your first driver to get started"}
            </p>
          </Card>
        )}
      </div>

      {/* Create Driver Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Driver</DialogTitle>
            <DialogDescription>
              Register a new delivery driver. A user account will be created automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input
                value={form.name}
                onChange={e => { setForm(f => ({ ...f, name: e.target.value })); clearDriverError("driverName"); }}
                placeholder="Full name"
                className={`mt-1 ${driverFieldErrors.some(e => e.field === "driverName") ? "border-red-500 ring-1 ring-red-500/30" : ""}`}
                data-testid="input-driver-name"
                data-field="driverName"
              />
              {driverFieldErrors.find(e => e.field === "driverName") && (
                <p className="text-xs text-red-500 mt-1">{driverFieldErrors.find(e => e.field === "driverName")?.message}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Phone *</Label>
              <Input
                value={form.phone}
                onChange={e => { setForm(f => ({ ...f, phone: e.target.value })); clearDriverError("driverPhone"); }}
                placeholder="Phone number"
                className={`mt-1 ${driverFieldErrors.some(e => e.field === "driverPhone") ? "border-red-500 ring-1 ring-red-500/30" : ""}`}
                data-testid="input-driver-phone"
                data-field="driverPhone"
              />
              {driverFieldErrors.find(e => e.field === "driverPhone") && (
                <p className="text-xs text-red-500 mt-1">{driverFieldErrors.find(e => e.field === "driverPhone")?.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Vehicle Type</Label>
                <Select value={form.vehicleType} onValueChange={v => setForm(f => ({ ...f, vehicleType: v }))}>
                  <SelectTrigger className="mt-1" data-testid="select-driver-vehicle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUV">SUV</SelectItem>
                    <SelectItem value="Sedan">Sedan</SelectItem>
                    <SelectItem value="Van">Van</SelectItem>
                    <SelectItem value="Truck">Truck</SelectItem>
                    <SelectItem value="Motorcycle">Motorcycle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">License Plate</Label>
                <Input
                  value={form.licensePlate}
                  onChange={e => setForm(f => ({ ...f, licensePlate: e.target.value }))}
                  placeholder="e.g. FL-XYZ789"
                  className="mt-1"
                  data-testid="input-driver-plate"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCreateDialogOpen(false)}
                data-testid="button-cancel-create-driver"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateDriver}
                disabled={createMutation.isPending}
                data-testid="button-submit-create-driver"
              >
                {createMutation.isPending ? "Creating..." : "Add Driver"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
