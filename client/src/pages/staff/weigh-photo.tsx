import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Camera, Info, Scale, DollarSign, AlertTriangle, Bluetooth } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { BleScale } from "@/components/ble-scale";
import { PhotoCapture } from "@/components/photo-capture";
import type { Order } from "@shared/schema";
import type { FieldError } from "@/lib/inline-validation";
import { scrollToFirstError, fieldBorderClass } from "@/lib/inline-validation";
import { InlineFieldError } from "@/components/field-error";

export default function WeighPhotoPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/staff/weigh/:id");
  const orderId = Number(params?.id);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders/${orderId}`);
      return res.json();
    },
    enabled: !!orderId,
  });

  // Parse bags from order
  const bags: { type: string; quantity: number; price: number }[] = order?.bags
    ? (() => { try { return JSON.parse(order.bags); } catch { return []; } })()
    : [];

  // Estimated weights per bag type
  const estimatedWeights: Record<string, number> = {
    small: 8,
    medium: 15,
    large: 25,
    extra_large: 35,
  };

  // Track actual weights for each bag
  const [actualWeights, setActualWeights] = useState<Record<number, string>>({});
  const [dirtyWeight, setDirtyWeight] = useState("");
  const [cleanWeight, setCleanWeight] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoTaken, setPhotoTaken] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  const clearError = (field: string) => {
    setFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const updateWeight = (index: number, value: string) => {
    setActualWeights((prev) => ({ ...prev, [index]: value }));
  };

  // Tier-based pricing calculations
  const hasTierPricing = !!(order?.tierName && order?.tierMaxWeight && order?.tierFlatPrice);
  const tierMaxWeight = order?.tierMaxWeight || 0;
  const tierFlatPrice = order?.tierFlatPrice || 0;
  const overageRate = 2.50;

  const parsedCleanWeight = parseFloat(cleanWeight) || 0;
  const parsedDirtyWeight = parseFloat(dirtyWeight) || 0;
  const overageWeight = hasTierPricing ? Math.max(0, parsedCleanWeight - tierMaxWeight) : 0;
  const overageCharge = Math.round(overageWeight * overageRate * 100) / 100;
  const weightDiff = parsedDirtyWeight > 0 && parsedCleanWeight > 0
    ? Math.round((parsedDirtyWeight - parsedCleanWeight) * 100) / 100
    : null;

  const confirmMutation = useMutation({
    mutationFn: async () => {
      // If we have tier-based pricing, use dirty/clean weight flow
      if (hasTierPricing) {
        // Record dirty weight if provided
        if (parsedDirtyWeight > 0) {
          await apiRequest(`/api/orders/${orderId}/record-dirty-weight`, {
            method: "POST",
            body: JSON.stringify({
              weight: parsedDirtyWeight,
              actorId: user?.id,
            }),
          });
        }

        // Record clean weight if provided — this auto-calculates overage
        if (parsedCleanWeight > 0) {
          await apiRequest(`/api/orders/${orderId}/record-clean-weight`, {
            method: "POST",
            body: JSON.stringify({
              weight: parsedCleanWeight,
              actorId: user?.id,
            }),
          });
        }

        // Also record intake via legacy endpoint for compatibility
        const totalWeight = parsedDirtyWeight || parsedCleanWeight || Object.values(actualWeights).reduce(
          (sum, w) => sum + (parseFloat(w) || 0), 0
        );

        await apiRequest(`/api/orders/${orderId}/intake`, {
          method: "POST",
          body: JSON.stringify({
            weight: totalWeight,
            photoUrl: photoUrl || undefined,
            actorId: user?.id,
          }),
        });
      } else {
        // Legacy per-bag weight flow
        const totalWeight = Object.values(actualWeights).reduce(
          (sum, w) => sum + (parseFloat(w) || 0), 0
        );

        await apiRequest(`/api/orders/${orderId}/intake`, {
          method: "POST",
          body: JSON.stringify({
            weight: totalWeight,
            photoUrl: photoUrl || undefined,
            actorId: user?.id,
          }),
        });
      }

      // Advance status to "washing"
      await apiRequest(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "washing",
          actorRole: "vendor",
          description: "Intake complete, washing started",
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Intake recorded! Washing started." });
      navigate("/staff");
    },
    onError: (err: any) => {
      toast({
        title: "Failed to confirm intake",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Expand bags by quantity (for legacy flow)
  const expandedBags: { type: string; bagIndex: number }[] = [];
  bags.forEach((bag) => {
    for (let q = 0; q < (bag.quantity || 1); q++) {
      expandedBags.push({ type: bag.type, bagIndex: expandedBags.length });
    }
  });

  // Validation: for tier-based orders, need at least dirty weight
  // For legacy, need all bag weights filled
  const isValid = hasTierPricing
    ? (parsedDirtyWeight > 0 || parsedCleanWeight > 0)
    : (expandedBags.length > 0 && expandedBags.every((_, i) => {
        const w = actualWeights[i];
        return w && parseFloat(w) > 0;
      }));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <p className="text-muted-foreground">Order not found</p>
      </div>
    );
  }

  const customerName = `Customer #${order.customerId}`;

  let preferences: Record<string, string> = {};
  try {
    if (order.preferences) preferences = JSON.parse(order.preferences);
  } catch {}

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button
            data-testid="button-back"
            type="button"
            onClick={() => navigate("/staff")}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-card transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">Weigh & Photo</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Order Info Card */}
        <div data-testid="card-order-info" className="p-4 rounded-2xl bg-card border border-border">
          <p className="text-sm text-muted-foreground">Customer</p>
          <p className="text-base font-semibold text-foreground">{customerName}</p>
          <p className="text-sm text-muted-foreground mt-1">Order #{order.orderNumber}</p>
          {order.customerNotes && (
            <p className="text-xs text-muted-foreground mt-2 italic">Note: {order.customerNotes}</p>
          )}
          {preferences.washType && (
            <p className="text-xs text-primary mt-1">
              Wash type: {preferences.washType.charAt(0).toUpperCase() + preferences.washType.slice(1).replace(/_/g, " ")}
            </p>
          )}
        </div>

        {/* Tier Info Banner (for tier-based orders) */}
        {hasTierPricing && (
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-primary">
                {order.tierName?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} — ${tierFlatPrice.toFixed(2)} flat rate
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Up to {tierMaxWeight} lbs included. Overage: ${overageRate.toFixed(2)}/lb over {tierMaxWeight} lbs.
            </p>
          </div>
        )}

        {/* Info Banner */}
        <div data-testid="banner-info" className="flex gap-3 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-300 leading-relaxed">
            {hasTierPricing
              ? "Record the dirty weight at pickup and the clean weight after washing. The system will auto-calculate any overage charges."
              : "Please weigh each bag and record the actual weight. Take a clear photo of the bags as proof."}
          </p>
        </div>

        {/* Tier-Based: Dirty & Clean Weight Fields */}
        {hasTierPricing && (
          <div>
            <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
              <Scale className="w-4 h-4 text-primary" />
              Weight Recording
            </h2>
            <div className="space-y-3">
              {/* Dirty Weight */}
              <div data-testid="card-dirty-weight" className="p-4 rounded-2xl bg-card border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Dirty Weight (at pickup)</p>
                    <p className="text-xs text-muted-foreground">Weigh laundry before washing</p>
                  </div>
                </div>
                <div className="relative">
                  <input
                    data-testid="input-dirty-weight"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Enter dirty weight"
                    value={dirtyWeight}
                    onChange={e => { setDirtyWeight(e.target.value); clearError("dirtyWeight"); }}
                    className={`w-full h-11 px-4 pr-12 rounded-xl bg-background border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("dirtyWeight", fieldErrors)}`}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">lbs</span>
                </div>
              </div>

              {/* Clean Weight */}
              <div data-testid="card-clean-weight" className="p-4 rounded-2xl bg-card border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Clean Weight (after wash)</p>
                    <p className="text-xs text-muted-foreground">Weigh laundry after wash & dry</p>
                  </div>
                </div>
                <div className="relative">
                  <input
                    data-testid="input-clean-weight"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Enter clean weight"
                    value={cleanWeight}
                    onChange={e => { setCleanWeight(e.target.value); clearError("dirtyWeight"); }}
                    className={`w-full h-11 px-4 pr-12 rounded-xl bg-background border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("dirtyWeight", fieldErrors)}`}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">lbs</span>
                </div>
              </div>

              {/* Real-time Pricing Impact */}
              {parsedCleanWeight > 0 && (
                <div data-testid="card-pricing-impact" className="p-4 rounded-2xl bg-card border border-border">
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    Pricing Impact
                  </h3>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tier flat rate</span>
                      <span>${tierFlatPrice.toFixed(2)}</span>
                    </div>
                    {overageWeight > 0 && (
                      <div className="flex justify-between text-amber-400">
                        <span>Overage ({overageWeight.toFixed(1)} lbs x ${overageRate.toFixed(2)})</span>
                        <span>+${overageCharge.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold border-t border-border pt-1">
                      <span>Estimated Final</span>
                      <span className="text-primary">${(tierFlatPrice + overageCharge).toFixed(2)}</span>
                    </div>
                  </div>

                  {overageWeight > 0 && (
                    <div className="mt-2 flex gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-400">
                        Order is {overageWeight.toFixed(1)} lbs over the {tierMaxWeight} lb limit
                      </p>
                    </div>
                  )}

                  {weightDiff !== null && weightDiff > 0 && (
                    <div className="mt-2 flex gap-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                      <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-300">
                        Weight difference: -{weightDiff.toFixed(1)} lbs (moisture & lint loss after washing)
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Legacy: Per-Bag Weights */}
        {!hasTierPricing && (
          <div>
            <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
              <Scale className="w-4 h-4 text-primary" />
              Bags to Weigh
            </h2>
            <div className="space-y-3">
              {expandedBags.map((bag, index) => {
                const estimated = estimatedWeights[bag.type] || 15;
                const typeName = bag.type.charAt(0).toUpperCase() + bag.type.slice(1).replace("_", " ");
                return (
                  <div key={index} data-testid={`card-bag-${index}`} className="p-4 rounded-2xl bg-card border border-border">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{typeName} Bag</p>
                        <p className="text-xs text-muted-foreground">Est. {estimated} lbs</p>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-xs text-muted-foreground">
                        <Scale className="w-3 h-3" />
                        Bag {index + 1}
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        data-testid={`input-weight-${index}`}
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="Actual weight"
                        value={actualWeights[index] || ""}
                        onChange={(e) => updateWeight(index, e.target.value)}
                        className="w-full h-11 px-4 pr-12 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">lbs</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* BLE Scale Integration */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <Bluetooth className="w-4 h-4 text-primary" />
            Bluetooth Scale (Optional)
          </h2>
          <div className="space-y-3">
            <BleScale
              orderId={orderId}
              weightType="dirty"
              actorId={user?.id}
              onWeightRecorded={(w) => {
                if (hasTierPricing) setDirtyWeight(String(w));
              }}
            />
            <BleScale
              orderId={orderId}
              weightType="clean"
              actorId={user?.id}
              onWeightRecorded={(w) => {
                if (hasTierPricing) setCleanWeight(String(w));
              }}
            />
          </div>
        </div>

        {/* Photo Evidence — Before & After */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" />
            Photo Evidence
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <PhotoCapture
              orderId={orderId}
              type="intake_before"
              label="Before Washing"
              onCapture={() => {
                setPhotoTaken(true);
                setPhotoUrl(`photo_before_${orderId}`);
              }}
            />
            <PhotoCapture
              orderId={orderId}
              type="intake_after"
              label="After Washing"
              onCapture={() => {
                setPhotoTaken(true);
              }}
            />
          </div>
        </div>

        {/* Confirm Button */}
        <InlineFieldError field="weight" errors={fieldErrors} />
        <button
          data-testid="button-confirm-weights"
          type="button"
          onClick={() => {
            if (!isValid) {
              const errors: FieldError[] = [];
              if (hasTierPricing) {
                if (parsedDirtyWeight <= 0 && parsedCleanWeight <= 0) {
                  errors.push({ field: "dirtyWeight", message: "Enter at least the dirty or clean weight" });
                }
              } else {
                errors.push({ field: "weight", message: "Please enter weight for all bags" });
              }
              setFieldErrors(errors);
              scrollToFirstError(errors);
              return;
            }
            setFieldErrors([]);
            confirmMutation.mutate();
          }}
          disabled={confirmMutation.isPending}
          className="w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {confirmMutation.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Confirming...
            </span>
          ) : (
            "Confirm Weights & Start Washing"
          )}
        </button>
      </div>
    </div>
  );
}
