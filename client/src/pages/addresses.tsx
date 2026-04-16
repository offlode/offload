import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft, MapPin, Plus, Pencil, Trash2, Home, Briefcase,
  MapPinned, Check, Star
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import type { Address } from "@shared/schema";

const LABEL_ICONS: Record<string, typeof Home> = {
  Home: Home,
  Work: Briefcase,
};

const emptyAddr = { label: "", street: "", apt: "", city: "", state: "", zip: "", notes: "" };

export default function AddressesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id;
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyAddr);

  const { data: addresses, isLoading } = useQuery<Address[]>({
    queryKey: ["/api/addresses", userId],
    queryFn: async () => {
      const res = await apiRequest(`/api/addresses?userId=${userId}`);
      return res.json();
    },
    enabled: !!userId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/addresses", {
        method: "POST",
        body: JSON.stringify({ userId, ...form, isDefault: 0 }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/addresses", userId] });
      closeForm();
      toast({ title: "Address added", description: "New address saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/addresses/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ userId, ...form }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/addresses", userId] });
      closeForm();
      toast({ title: "Address updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/addresses/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/addresses", userId] });
      setDeleteId(null);
      toast({ title: "Address removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/addresses/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ userId, isDefault: 1 }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/addresses", userId] });
      toast({ title: "Default address updated" });
    },
  });

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyAddr);
  };

  const openEdit = (addr: Address) => {
    setEditingId(addr.id);
    setForm({
      label: addr.label,
      street: addr.street,
      apt: addr.apt || "",
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      notes: addr.notes || "",
    });
    setFormOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyAddr);
    setFormOpen(true);
  };

  const isValid = form.label.trim() && form.street.trim() && form.city.trim() && form.state.trim() && form.zip.trim();

  return (
    <div className="pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button onClick={() => navigate("/profile")} data-testid="button-back" className="hover:text-primary transition-colors active:scale-95">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Saved Addresses</h1>
          <p className="text-xs text-muted-foreground">{addresses?.length || 0} addresses</p>
        </div>
        <Button size="sm" onClick={openNew} data-testid="button-add-address" className="gap-1.5">
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </div>

      <div className="px-5 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))
        ) : addresses && addresses.length > 0 ? (
          addresses.map(addr => {
            const Icon = LABEL_ICONS[addr.label] || MapPinned;
            return (
              <Card
                key={addr.id}
                className="p-4 transition-all duration-200 hover:border-primary/30"
                data-testid={`address-card-${addr.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold">{addr.label}</p>
                      {addr.isDefault ? (
                        <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-400">Default</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{addr.street}{addr.apt ? `, ${addr.apt}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{addr.city}, {addr.state} {addr.zip}</p>
                    {addr.notes && <p className="text-xs text-muted-foreground/60 mt-1 italic">{addr.notes}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 ml-13">
                  {!addr.isDefault && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => setDefaultMutation.mutate(addr.id)}
                      disabled={setDefaultMutation.isPending}
                      data-testid={`button-set-default-${addr.id}`}
                    >
                      <Star className="w-3 h-3" />
                      Set Default
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => openEdit(addr)}
                    data-testid={`button-edit-${addr.id}`}
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs gap-1.5 text-red-400 hover:text-red-300"
                    onClick={() => setDeleteId(addr.id)}
                    data-testid={`button-delete-${addr.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </Card>
            );
          })
        ) : (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-primary/60" />
            </div>
            <p className="text-sm font-medium mb-1">No addresses saved</p>
            <p className="text-xs text-muted-foreground mb-4">Add your first address to get started.</p>
            <Button size="sm" onClick={openNew} data-testid="button-add-first">Add Address</Button>
          </Card>
        )}
      </div>

      {/* Add/Edit Sheet */}
      <Sheet open={formOpen} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit Address" : "Add New Address"}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Label</Label>
              <Input
                placeholder="e.g., Home, Work, Gym"
                value={form.label}
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                data-testid="input-addr-label"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Street Address</Label>
              <Input
                placeholder="123 Main St"
                value={form.street}
                onChange={e => setForm(p => ({ ...p, street: e.target.value }))}
                data-testid="input-addr-street"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Apt / Suite (optional)</Label>
              <Input
                placeholder="Apt 4B"
                value={form.apt}
                onChange={e => setForm(p => ({ ...p, apt: e.target.value }))}
                data-testid="input-addr-apt"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">City</Label>
                <Input
                  placeholder="Miami"
                  value={form.city}
                  onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                  data-testid="input-addr-city"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">State</Label>
                <Input
                  placeholder="FL"
                  value={form.state}
                  onChange={e => setForm(p => ({ ...p, state: e.target.value }))}
                  data-testid="input-addr-state"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">ZIP</Label>
                <Input
                  placeholder="33132"
                  value={form.zip}
                  onChange={e => setForm(p => ({ ...p, zip: e.target.value }))}
                  data-testid="input-addr-zip"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
              <Textarea
                placeholder="e.g., Gate code 1234, use side entrance"
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                className="min-h-[60px] resize-none"
                data-testid="input-addr-notes"
              />
            </div>
            <Button
              className="w-full"
              disabled={!isValid || createMutation.isPending || updateMutation.isPending}
              onClick={() => editingId ? updateMutation.mutate() : createMutation.mutate()}
              data-testid="button-save-address"
            >
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editingId ? "Update Address" : "Save Address"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this address?</AlertDialogTitle>
            <AlertDialogDescription>
              This address will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-confirm"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
