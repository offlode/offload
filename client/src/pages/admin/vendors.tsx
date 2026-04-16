import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Store, Star, MapPin, Phone, Mail, Shield, ShieldOff,
  Activity, Zap, Award, Plus, Search, Droplets, Sparkles, Shirt,
  TrendingUp, BarChart2
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
import type { Vendor } from "@shared/schema";
import type { FieldError } from "@/lib/inline-validation";
import { scrollToFirstError, fieldBorderClass } from "@/lib/inline-validation";
import { InlineFieldError } from "@/components/field-error";

const tierColors: Record<string, string> = {
  elite: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  premium: "bg-primary/10 text-primary border-primary/20",
  standard: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const tierStars: Record<string, number> = { elite: 3, premium: 2, standard: 1 };

const capabilityIcons: Record<string, React.ReactNode> = {
  standard: <Droplets className="w-3 h-3" />,
  signature: <Sparkles className="w-3 h-3" />,
  custom: <Shirt className="w-3 h-3" />,
};

interface VendorStats {
  totalOrders: number;
  completedOrders: number;
  avgRating: number;
  revenue: number;
}

function VendorCard({ vendor, onStatusChange }: {
  vendor: Vendor;
  onStatusChange: () => void;
}) {
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [capacityDialogOpen, setCapacityDialogOpen] = useState(false);
  const [newCapacity, setNewCapacity] = useState(String(vendor.capacity || 50));
  const { toast } = useToast();

  const capacity = vendor.capacity || 1;
  const load = vendor.currentLoad || 0;
  const loadPercent = Math.min((load / capacity) * 100, 100);
  const capabilities = vendor.capabilities ? JSON.parse(vendor.capabilities as string) : [];

  const { data: stats } = useQuery<VendorStats>({
    queryKey: ["/api/vendors", vendor.id, "stats"],
    queryFn: async () => {
      const res = await apiRequest(`/api/vendors/${vendor.id}/stats`);
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const newStatus = vendor.status === "active" ? "suspended" : "active";
      const res = await apiRequest(`/api/vendors/${vendor.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metrics"] });
      setStatusDialogOpen(false);
      onStatusChange();
      toast({
        title: "Vendor updated",
        description: `${vendor.name} is now ${vendor.status === "active" ? "suspended" : "active"}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const capacityMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/vendors/${vendor.id}`, {
        method: "PATCH",
        body: JSON.stringify({ capacity: parseInt(newCapacity) || capacity }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      setCapacityDialogOpen(false);
      toast({ title: "Capacity updated", description: `${vendor.name} capacity set to ${newCapacity}` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const stars = tierStars[vendor.performanceTier || "standard"] || 1;
  const revenue = stats?.revenue ?? 0;
  const completedOrders = stats?.completedOrders ?? 0;

  return (
    <>
      <Card className="p-4" data-testid={`admin-vendor-${vendor.id}`}>
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Store className="w-5 h-5 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Top row */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold">{vendor.name}</p>
                  {vendor.certified === 1 && (
                    <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {vendor.city}
                  </span>
                  {vendor.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {vendor.phone}
                    </span>
                  )}
                  {vendor.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {vendor.email}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold">${revenue.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground">{completedOrders} completed</p>
              </div>
            </div>

            {/* Middle row: badges, rating, capacity */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <Badge variant="outline" className={`text-[10px] ${tierColors[vendor.performanceTier || ""] || "bg-muted"}`}>
                <span className="flex items-center gap-0.5">
                  {[...Array(stars)].map((_, i) => (
                    <Star key={i} className="w-2.5 h-2.5 fill-current" />
                  ))}
                  <span className="ml-1 capitalize">{vendor.performanceTier}</span>
                </span>
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] ${vendor.status === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}
                data-testid={`vendor-status-${vendor.id}`}
              >
                {vendor.status}
              </Badge>
              <span className="flex items-center gap-1 text-xs">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {stats?.avgRating ?? vendor.rating}{" "}
                <span className="text-muted-foreground">({vendor.reviewCount})</span>
              </span>
              {stats && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <BarChart2 className="w-3 h-3" />
                  {stats.totalOrders} total orders
                </span>
              )}
            </div>

            {/* Capacity bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">Capacity</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{load}/{capacity} bags</span>
                  <button
                    onClick={() => setCapacityDialogOpen(true)}
                    className="text-[10px] text-primary hover:underline"
                    data-testid={`btn-edit-capacity-${vendor.id}`}
                  >
                    Edit
                  </button>
                </div>
              </div>
              <Progress
                value={loadPercent}
                className="h-2"
              />
            </div>

            {/* Revenue info from stats */}
            {stats && stats.revenue > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <span>Vendor earned: </span>
                <span className="font-semibold text-foreground">${stats.revenue.toFixed(2)}</span>
              </div>
            )}

            {/* Capabilities and actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 flex-wrap">
                {capabilities.map((cap: string) => (
                  <Badge key={cap} variant="secondary" className="text-[10px] capitalize gap-1">
                    {capabilityIcons[cap] || null}
                    {cap}
                  </Badge>
                ))}
              </div>
              <Button
                size="sm"
                variant={vendor.status === "active" ? "destructive" : "default"}
                className="text-xs h-7 shrink-0"
                onClick={() => setStatusDialogOpen(true)}
                data-testid={`action-toggle-vendor-${vendor.id}`}
              >
                {vendor.status === "active" ? (
                  <><ShieldOff className="w-3 h-3 mr-1" /> Suspend</>
                ) : (
                  <><Shield className="w-3 h-3 mr-1" /> Activate</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Status Confirmation dialog */}
      <AlertDialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {vendor.status === "active" ? "Suspend" : "Activate"} {vendor.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {vendor.status === "active"
                ? "This vendor will no longer receive new orders while suspended."
                : "This vendor will be able to receive new orders again."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-toggle-vendor">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toggleMutation.mutate()}
              className={vendor.status === "active" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              data-testid="button-confirm-toggle-vendor"
            >
              {toggleMutation.isPending ? "Updating..." : vendor.status === "active" ? "Suspend" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Capacity Edit Dialog */}
      <Dialog open={capacityDialogOpen} onOpenChange={setCapacityDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Capacity — {vendor.name}</DialogTitle>
            <DialogDescription>
              Set the maximum number of bags this vendor can handle per day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Max Capacity (bags/day)</Label>
              <Input
                type="number"
                value={newCapacity}
                onChange={e => setNewCapacity(e.target.value)}
                className="mt-1"
                data-testid={`input-new-capacity-${vendor.id}`}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCapacityDialogOpen(false)}
                data-testid="button-cancel-capacity"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => capacityMutation.mutate()}
                disabled={capacityMutation.isPending}
                data-testid="button-save-capacity"
              >
                {capacityMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AdminVendors() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const { toast } = useToast();

  const { data: vendors, isLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  // Form state
  const [form, setForm] = useState({
    name: "", address: "", city: "", phone: "", email: "",
    capacity: "50", performanceTier: "standard",
    capabilities: "standard",
  });
  const [vendorFieldErrors, setVendorFieldErrors] = useState<FieldError[]>([]);

  const clearVendorError = (field: string) => {
    setVendorFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const handleCreateVendor = () => {
    const errors: FieldError[] = [];
    if (!form.name.trim()) errors.push({ field: "vendorName", message: "Vendor name is required" });
    if (!form.address.trim()) errors.push({ field: "vendorAddress", message: "Address is required" });
    if (!form.city.trim()) errors.push({ field: "vendorCity", message: "City is required" });
    if (errors.length > 0) {
      setVendorFieldErrors(errors);
      scrollToFirstError(errors);
      return;
    }
    setVendorFieldErrors([]);
    createMutation.mutate();
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/vendors", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          address: form.address,
          city: form.city,
          phone: form.phone,
          email: form.email,
          capacity: parseInt(form.capacity) || 50,
          performanceTier: form.performanceTier,
          capabilities: JSON.stringify(form.capabilities.split(",").map(s => s.trim()).filter(Boolean)),
          status: "active",
          certified: 1,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metrics"] });
      setCreateDialogOpen(false);
      setForm({ name: "", address: "", city: "", phone: "", email: "", capacity: "50", performanceTier: "standard", capabilities: "standard" });
      toast({ title: "Vendor created", description: `${form.name} has been added` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    return (vendors || []).filter(v => {
      if (tierFilter !== "all" && v.performanceTier !== tierFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q);
      }
      return true;
    });
  }, [vendors, searchQuery, tierFilter]);

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold" data-testid="text-admin-vendors">Vendor Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Monitor performance, capacity, and certification status
            </p>
          </div>
          <Button
            size="sm"
            className="text-xs h-8 gap-1.5"
            onClick={() => setCreateDialogOpen(true)}
            data-testid="button-add-vendor"
          >
            <Plus className="w-3.5 h-3.5" /> Add Vendor
          </Button>
        </div>

        {/* Summary */}
        {vendors && (
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-bold">{vendors.filter(v => v.status === "active").length}</p>
                <p className="text-[10px] text-muted-foreground">Active</p>
              </div>
            </Card>
            <Card className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Award className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-lg font-bold">{vendors.filter(v => v.certified === 1).length}</p>
                <p className="text-[10px] text-muted-foreground">Certified</p>
              </div>
            </Card>
            <Card className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold">{vendors.filter(v => v.performanceTier === "elite").length}</p>
                <p className="text-[10px] text-muted-foreground">Elite Tier</p>
              </div>
            </Card>
          </div>
        )}

        {/* Search + Filter */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search vendors by name or city..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
              data-testid="input-search-vendors"
            />
          </div>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-40 h-9" data-testid="select-tier-filter">
              <SelectValue placeholder="Filter tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="elite">Elite</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Vendor List */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map(vendor => (
              <VendorCard
                key={vendor.id}
                vendor={vendor}
                onStatusChange={() => {}}
              />
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Store className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No vendors found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {searchQuery || tierFilter !== "all" ? "Try adjusting your filters" : "Add your first vendor to get started"}
            </p>
          </Card>
        )}
      </div>

      {/* Create Vendor Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Vendor</DialogTitle>
            <DialogDescription>
              Register a new laundromat vendor to the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Vendor Name *</Label>
              <Input
                value={form.name}
                onChange={e => { setForm(f => ({ ...f, name: e.target.value })); clearVendorError("vendorName"); }}
                placeholder="e.g. Fresh & Clean Laundry"
                className={`mt-1 ${fieldBorderClass("vendorName", vendorFieldErrors)}`}
                data-testid="input-vendor-name"
                data-field="vendorName"
              />
              <InlineFieldError field="vendorName" errors={vendorFieldErrors} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Address *</Label>
                <Input
                  value={form.address}
                  onChange={e => { setForm(f => ({ ...f, address: e.target.value })); clearVendorError("vendorAddress"); }}
                  placeholder="Street address"
                  className={`mt-1 ${fieldBorderClass("vendorAddress", vendorFieldErrors)}`}
                  data-testid="input-vendor-address"
                  data-field="vendorAddress"
                />
                <InlineFieldError field="vendorAddress" errors={vendorFieldErrors} />
              </div>
              <div>
                <Label className="text-xs">City *</Label>
                <Input
                  value={form.city}
                  onChange={e => { setForm(f => ({ ...f, city: e.target.value })); clearVendorError("vendorCity"); }}
                  placeholder="e.g. Miami"
                  className={`mt-1 ${fieldBorderClass("vendorCity", vendorFieldErrors)}`}
                  data-testid="input-vendor-city"
                  data-field="vendorCity"
                />
                <InlineFieldError field="vendorCity" errors={vendorFieldErrors} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Phone</Label>
                <Input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="Phone number"
                  className="mt-1"
                  data-testid="input-vendor-phone"
                />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="Email address"
                  className="mt-1"
                  data-testid="input-vendor-email"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Max Capacity (bags/day)</Label>
                <Input
                  type="number"
                  value={form.capacity}
                  onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                  className="mt-1"
                  data-testid="input-vendor-capacity"
                />
              </div>
              <div>
                <Label className="text-xs">Performance Tier</Label>
                <Select value={form.performanceTier} onValueChange={v => setForm(f => ({ ...f, performanceTier: v }))}>
                  <SelectTrigger className="mt-1" data-testid="select-vendor-tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="elite">Elite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Capabilities (comma-separated)</Label>
              <Input
                value={form.capabilities}
                onChange={e => setForm(f => ({ ...f, capabilities: e.target.value }))}
                placeholder="standard, signature, custom"
                className="mt-1"
                data-testid="input-vendor-capabilities"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCreateDialogOpen(false)}
                data-testid="button-cancel-create-vendor"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateVendor}
                disabled={createMutation.isPending}
                data-testid="button-submit-create-vendor"
              >
                {createMutation.isPending ? "Creating..." : "Create Vendor"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
