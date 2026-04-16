import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Tag, Plus, Edit2, ToggleLeft, ToggleRight, Percent,
  DollarSign, Truck, Calendar, Users, Hash
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AdminLayout } from "./layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PromoCode } from "@shared/schema";

const promoFormSchema = z.object({
  code: z.string().min(3, "Code must be at least 3 characters").toUpperCase(),
  type: z.enum(["percentage", "fixed", "free_delivery"]),
  value: z.coerce.number().min(0, "Value must be positive"),
  minOrderAmount: z.coerce.number().min(0).default(0),
  maxUses: z.coerce.number().min(0).default(0),
  expiresAt: z.string().optional(),
});

type PromoFormValues = z.infer<typeof promoFormSchema>;

const TYPE_ICONS: Record<string, React.ReactNode> = {
  percentage: <Percent className="w-3.5 h-3.5" />,
  fixed: <DollarSign className="w-3.5 h-3.5" />,
  free_delivery: <Truck className="w-3.5 h-3.5" />,
};

const TYPE_LABELS: Record<string, string> = {
  percentage: "% Off",
  fixed: "$ Fixed",
  free_delivery: "Free Delivery",
};

function formatPromoValue(type: string, value: number) {
  if (type === "percentage") return `${value}% off`;
  if (type === "fixed") return `$${value} off`;
  return "Free delivery";
}

function PromoStatusBadge({ isActive, expiresAt }: { isActive: number; expiresAt?: string | null }) {
  const expired = expiresAt ? new Date(expiresAt) < new Date() : false;
  if (expired) return <Badge variant="secondary" className="text-[10px]">Expired</Badge>;
  if (isActive) return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium">
      Active
    </span>
  );
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
      Inactive
    </span>
  );
}

export default function AdminPromos() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);

  const { data: promos, isLoading } = useQuery<PromoCode[]>({
    queryKey: ["/api/admin/promos"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: PromoFormValues) => {
      const res = await apiRequest("/api/admin/promos", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          isActive: 1,
          usedCount: 0,
          createdAt: new Date().toISOString(),
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promos"] });
      toast({ title: "Promo code created successfully" });
      setShowCreate(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to create promo code", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<PromoCode> }) => {
      const res = await apiRequest(`/api/admin/promos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promos"] });
      toast({ title: "Promo code updated" });
      setEditingPromo(null);
      editForm.reset();
    },
    onError: () => {
      toast({ title: "Failed to update promo code", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: number }) => {
      const res = await apiRequest(`/api/admin/promos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promos"] });
    },
  });

  const form = useForm<PromoFormValues>({
    resolver: zodResolver(promoFormSchema),
    defaultValues: {
      code: "",
      type: "percentage",
      value: 10,
      minOrderAmount: 0,
      maxUses: 0,
      expiresAt: "",
    },
  });

  const editForm = useForm<PromoFormValues>({
    resolver: zodResolver(promoFormSchema),
    defaultValues: {
      code: "",
      type: "percentage",
      value: 10,
      minOrderAmount: 0,
      maxUses: 0,
      expiresAt: "",
    },
  });

  function openEdit(promo: PromoCode) {
    setEditingPromo(promo);
    editForm.reset({
      code: promo.code,
      type: promo.type as "percentage" | "fixed" | "free_delivery",
      value: promo.value,
      minOrderAmount: promo.minOrderAmount ?? 0,
      maxUses: promo.maxUses ?? 0,
      expiresAt: promo.expiresAt ?? "",
    });
  }

  // Simulated data
  const simPromos: PromoCode[] = [
    {
      id: 1, code: "WELCOME20", type: "percentage", value: 20,
      minOrderAmount: 30, maxUses: 500, usedCount: 142, isActive: 1,
      expiresAt: "2024-12-31T00:00:00Z", createdAt: "2024-01-01T00:00:00Z",
    },
    {
      id: 2, code: "FLAT10OFF", type: "fixed", value: 10,
      minOrderAmount: 40, maxUses: 200, usedCount: 87, isActive: 1,
      expiresAt: "2024-06-30T00:00:00Z", createdAt: "2024-01-05T00:00:00Z",
    },
    {
      id: 3, code: "FREEDEL", type: "free_delivery", value: 0,
      minOrderAmount: 50, maxUses: 100, usedCount: 100, isActive: 0,
      expiresAt: "2024-03-01T00:00:00Z", createdAt: "2024-01-10T00:00:00Z",
    },
    {
      id: 4, code: "SUMMER15", type: "percentage", value: 15,
      minOrderAmount: 0, maxUses: 0, usedCount: 34, isActive: 1,
      expiresAt: null, createdAt: "2024-01-12T00:00:00Z",
    },
  ];

  const displayPromos = promos ?? simPromos;

  const PromoForm = ({ formObj, onSubmit, isPending }: {
    formObj: typeof form;
    onSubmit: (v: PromoFormValues) => void;
    isPending: boolean;
  }) => (
    <Form {...formObj}>
      <form onSubmit={formObj.handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={formObj.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Code</FormLabel>
                <FormControl>
                  <Input
                    placeholder="SAVE20"
                    className="h-8 text-xs uppercase"
                    data-testid="input-promo-code"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />
          <FormField
            control={formObj.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-promo-type">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                    <SelectItem value="free_delivery">Free Delivery</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={formObj.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Value</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    data-testid="input-promo-value"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />
          <FormField
            control={formObj.control}
            name="minOrderAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Min Order ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    data-testid="input-promo-min-order"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={formObj.control}
            name="maxUses"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Max Uses (0 = unlimited)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    data-testid="input-promo-max-uses"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />
          <FormField
            control={formObj.control}
            name="expiresAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Expiry Date</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    data-testid="input-promo-expiry"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter className="pt-2">
          <Button type="submit" size="sm" disabled={isPending} data-testid="button-save-promo">
            {isPending ? "Saving..." : "Save Promo"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" data-testid="text-promos-title">Promo Codes</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {displayPromos.length} codes · {displayPromos.filter(p => p.isActive).length} active
            </p>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setShowCreate(true)}
            data-testid="button-create-promo"
          >
            <Plus className="w-3.5 h-3.5" /> Create Promo
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total Codes", value: displayPromos.length.toString(), icon: <Tag className="w-[18px] h-[18px] text-primary" />, bg: "bg-primary/10" },
            { label: "Active", value: displayPromos.filter(p => p.isActive).length.toString(), icon: <ToggleRight className="w-[18px] h-[18px] text-emerald-500" />, bg: "bg-emerald-500/10" },
            { label: "Total Redemptions", value: displayPromos.reduce((s, p) => s + (p.usedCount ?? 0), 0).toString(), icon: <Users className="w-[18px] h-[18px] text-blue-400" />, bg: "bg-blue-500/10" },
            { label: "Unlimited Codes", value: displayPromos.filter(p => !p.maxUses).length.toString(), icon: <Hash className="w-[18px] h-[18px] text-amber-400" />, bg: "bg-amber-500/10" },
          ].map((item) => (
            <Card key={item.label} className="p-4" data-testid={`kpi-promo-${item.label.toLowerCase().replace(/\s/g, "-")}`}>
              <div className={`w-9 h-9 rounded-lg ${item.bg} flex items-center justify-center mb-3`}>
                {item.icon}
              </div>
              <p className="text-xl font-bold">{item.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
            </Card>
          ))}
        </div>

        {/* Promos Table */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">All Promo Codes</h3>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="table-promos">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left pb-2 font-medium">Code</th>
                    <th className="text-left pb-2 font-medium">Type</th>
                    <th className="text-right pb-2 font-medium">Value</th>
                    <th className="text-right pb-2 font-medium">Min Order</th>
                    <th className="text-right pb-2 font-medium">Usage</th>
                    <th className="text-left pb-2 font-medium">Status</th>
                    <th className="text-right pb-2 font-medium">Expiry</th>
                    <th className="text-right pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayPromos.map((promo) => (
                    <tr key={promo.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-promo-${promo.id}`}>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                            {TYPE_ICONS[promo.type]}
                          </div>
                          <span className="font-mono font-bold tracking-wide">{promo.code}</span>
                        </div>
                      </td>
                      <td className="py-3 text-muted-foreground">{TYPE_LABELS[promo.type]}</td>
                      <td className="py-3 text-right font-semibold">{formatPromoValue(promo.type, promo.value)}</td>
                      <td className="py-3 text-right">
                        {(promo.minOrderAmount ?? 0) > 0 ? `$${promo.minOrderAmount}` : "—"}
                      </td>
                      <td className="py-3 text-right">
                        <span className="font-medium">{promo.usedCount ?? 0}</span>
                        {(promo.maxUses ?? 0) > 0 && (
                          <span className="text-muted-foreground">/{promo.maxUses}</span>
                        )}
                        {!(promo.maxUses) && <span className="text-muted-foreground"> / ∞</span>}
                      </td>
                      <td className="py-3">
                        <PromoStatusBadge isActive={promo.isActive ?? 0} expiresAt={promo.expiresAt} />
                      </td>
                      <td className="py-3 text-right text-muted-foreground">
                        {promo.expiresAt
                          ? new Date(promo.expiresAt).toLocaleDateString()
                          : "Never"}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => toggleMutation.mutate({ id: promo.id, isActive: promo.isActive ? 0 : 1 })}
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            title={promo.isActive ? "Deactivate" : "Activate"}
                            data-testid={`button-toggle-promo-${promo.id}`}
                          >
                            {promo.isActive
                              ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" />
                              : <ToggleLeft className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => openEdit(promo)}
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            data-testid={`button-edit-promo-${promo.id}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Create Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-md" data-testid="dialog-create-promo">
            <DialogHeader>
              <DialogTitle className="text-base">Create Promo Code</DialogTitle>
            </DialogHeader>
            <PromoForm
              formObj={form}
              onSubmit={(v) => createMutation.mutate(v)}
              isPending={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editingPromo} onOpenChange={(open) => !open && setEditingPromo(null)}>
          <DialogContent className="max-w-md" data-testid="dialog-edit-promo">
            <DialogHeader>
              <DialogTitle className="text-base">Edit Promo Code</DialogTitle>
            </DialogHeader>
            <PromoForm
              formObj={editForm}
              onSubmit={(v) => editingPromo && updateMutation.mutate({ id: editingPromo.id, data: v })}
              isPending={updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
