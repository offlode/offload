import { useState, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, AlertTriangle, Clock, Scale, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import type { Order } from "@shared/schema";
import type { FieldError } from "@/lib/inline-validation";
import { scrollToFirstError, fieldBorderClass } from "@/lib/inline-validation";
import { InlineFieldError } from "@/components/field-error";

export default function StartWashingPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/staff/wash/:id");
  const orderId = Number(params?.id);
  const { toast } = useToast();
  const { user } = useAuth();

  const [duration, setDuration] = useState<30 | 45>(30);
  const [separateByType, setSeparateByType] = useState(false);
  const [outputWeight, setOutputWeight] = useState("");
  const [showOutputWeight, setShowOutputWeight] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  const clearError = (field: string) => {
    setFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders/${orderId}`);
      return res.json();
    },
    enabled: !!orderId,
  });

  const estimatedCompletion = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + duration);
    return now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }, [duration]);

  // Start washing mutation
  const startMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "washing",
          description: `Washing started (${duration} min). Separate by type: ${separateByType ? "Yes" : "No"}`,
          actorRole: "vendor",
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Washing started!" });
      navigate("/staff");
    },
    onError: (err: any) => {
      toast({
        title: "Failed to start washing",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Record output weight and advance to wash_complete
  const outputWeightMutation = useMutation({
    mutationFn: async () => {
      const weight = parseFloat(outputWeight);
      if (!weight || weight <= 0) throw new Error("Please enter a valid output weight");

      // Step 1: Record output weight
      const res = await apiRequest(`/api/orders/${orderId}/output-weight`, {
        method: "POST",
        body: JSON.stringify({ weight, actorId: user?.id }),
      });
      const data = await res.json();

      // Step 2: Advance to wash_complete
      await apiRequest(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "wash_complete", actorRole: "vendor" }),
      });

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      if (data?.discrepancy) {
        toast({
          title: "Weight discrepancy detected",
          description: `Intake: ${order?.intakeWeight} lbs → Output: ${outputWeight} lbs. Customer has been notified.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Wash complete! Output weight recorded." });
      }
      navigate("/staff/active");
    },
    onError: (err: any) => {
      toast({
        title: "Failed to record output weight",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Advance status: packing → ready_for_delivery
  const advanceMutation = useMutation({
    mutationFn: async (status: string) => {
      await apiRequest(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, actorRole: "vendor" }),
      });
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      const labels: Record<string, string> = {
        packing: "Started packing",
        ready_for_delivery: "Order is ready for delivery!",
      };
      toast({ title: labels[status] || "Status updated" });
      navigate("/staff");
    },
    onError: (err: any) => {
      toast({
        title: "Failed to update status",
        description: err.message,
        variant: "destructive",
      });
    },
  });

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

  // Parse preferences
  let preferences: Record<string, string> = {};
  try {
    if (order.preferences) preferences = JSON.parse(order.preferences);
  } catch {}

  const statusLabel: Record<string, string> = {
    at_laundromat: "Ready to Wash",
    washing: "Currently Washing",
    wash_complete: "Wash Complete",
    packing: "Packing",
    ready_for_delivery: "Ready for Delivery",
    pending: "Pending",
    confirmed: "Confirmed",
    picked_up: "Picked Up",
  };

  const currentStatusLabel = statusLabel[order.status] || order.status;
  const canStartWashing = order.status === "at_laundromat";
  const isCurrentlyWashing = order.status === "washing";
  const isWashComplete = order.status === "wash_complete";
  const isPacking = order.status === "packing";

  // Detect weight discrepancy
  const hasDiscrepancy = order.weightDiscrepancy === 1;

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
          <h1 className="text-lg font-semibold text-foreground">
            {canStartWashing ? "Start Washing" : "Wash Progress"}
          </h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Order Info Card */}
        <div
          data-testid="card-order-info"
          className="p-4 rounded-2xl bg-card border border-border"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Customer</p>
              <p className="text-base font-semibold text-foreground">
                {customerName}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Order #{order.orderNumber}
              </p>
              {order.intakeWeight && (
                <p className="text-xs text-muted-foreground mt-1">
                  Intake weight: <span className="font-semibold">{order.intakeWeight} lbs</span>
                </p>
              )}
              {preferences.washType && (
                <p className="text-xs text-primary mt-1">
                  {preferences.washType.charAt(0).toUpperCase() + preferences.washType.slice(1).replace(/_/g, " ")} Wash
                </p>
              )}
            </div>
            <span
              data-testid="badge-status"
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                canStartWashing
                  ? "bg-green-500/15 text-green-400 border border-green-500/20"
                  : isCurrentlyWashing
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "bg-primary/15 text-primary border border-primary/20"
              }`}
            >
              {currentStatusLabel}
            </span>
          </div>
        </div>

        {/* Weight discrepancy warning */}
        {hasDiscrepancy && (
          <div
            data-testid="banner-discrepancy"
            className="flex gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20"
          >
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300 leading-relaxed">
              Weight discrepancy detected between intake and output. Customer has been notified.
            </p>
          </div>
        )}

        {/* ── START WASHING FLOW (status: at_laundromat) ── */}
        {canStartWashing && (
          <>
            {/* Duration Selection */}
            <div>
              <h2 className="text-base font-semibold text-foreground mb-3">
                Select washing duration
              </h2>
              <div className="flex gap-3">
                <button
                  data-testid="button-duration-30"
                  type="button"
                  onClick={() => setDuration(30)}
                  className={`flex-1 h-12 rounded-xl font-semibold text-sm transition-all ${
                    duration === 30
                      ? "bg-primary text-white"
                      : "bg-card border border-border text-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  30 min
                </button>
                <button
                  data-testid="button-duration-45"
                  type="button"
                  onClick={() => setDuration(45)}
                  className={`flex-1 h-12 rounded-xl font-semibold text-sm transition-all ${
                    duration === 45
                      ? "bg-primary text-white"
                      : "bg-card border border-border text-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  45 min
                </button>
              </div>
            </div>

            {/* Estimated Completion */}
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/15">
              <Clock className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-sm text-green-400">
                Estimated completion at{" "}
                <span className="font-semibold">{estimatedCompletion}</span>
              </p>
            </div>

            {/* Warning Banner */}
            <div
              data-testid="banner-warning"
              className="flex gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20"
            >
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-300 leading-relaxed">
                Once started, the order will move to &quot;In Progress&quot;. You can
                monitor it from the order details screen.
              </p>
            </div>

            {/* Separate by type checkbox */}
            <label
              data-testid="checkbox-separate-type"
              className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border cursor-pointer"
            >
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  separateByType
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/40 bg-transparent"
                }`}
              >
                {separateByType && (
                  <svg
                    className="w-3 h-3 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
              <input
                type="checkbox"
                checked={separateByType}
                onChange={(e) => setSeparateByType(e.target.checked)}
                className="sr-only"
              />
              <span className="text-sm font-medium text-foreground">
                Separate by type?
              </span>
            </label>

            {/* Start Washing Button */}
            <button
              data-testid="button-start-washing"
              type="button"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {startMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Starting...
                </span>
              ) : (
                "Start Washing"
              )}
            </button>
          </>
        )}

        {/* ── WASHING IN PROGRESS (status: washing) ── */}
        {isCurrentlyWashing && (
          <>
            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                <div className="w-6 h-6 border-2 border-primary/50 border-t-primary/80 rounded-full animate-spin" />
              </div>
              <p className="text-sm font-semibold text-primary/80">Wash in progress...</p>
            </div>

            {/* Record output weight section */}
            {!showOutputWeight ? (
              <button
                data-testid="button-show-output-weight"
                type="button"
                onClick={() => setShowOutputWeight(true)}
                className="w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all"
              >
                Wash Done — Record Output Weight
              </button>
            ) : (
              <div className="space-y-3">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Scale className="w-4 h-4 text-primary" />
                  Output Weight
                </h2>
                <div className="relative">
                  <input
                    data-testid="input-output-weight"
                    data-field="outputWeight"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Total output weight"
                    value={outputWeight}
                    onChange={(e) => { setOutputWeight(e.target.value); clearError("outputWeight"); }}
                    className={`w-full h-12 px-4 pr-12 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("outputWeight", fieldErrors)}`}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    lbs
                  </span>
                </div>
                {order.intakeWeight && (
                  <p className="text-xs text-muted-foreground">
                    Intake was <span className="font-semibold">{order.intakeWeight} lbs</span>
                  </p>
                )}
                <InlineFieldError field="outputWeight" errors={fieldErrors} />
                <button
                  data-testid="button-record-output"
                  type="button"
                  onClick={() => {
                    if (!outputWeight || parseFloat(outputWeight) <= 0) {
                      const errors: FieldError[] = [{ field: "outputWeight", message: "Please enter a valid output weight" }];
                      setFieldErrors(errors);
                      scrollToFirstError(errors);
                      return;
                    }
                    setFieldErrors([]);
                    outputWeightMutation.mutate();
                  }}
                  disabled={outputWeightMutation.isPending}
                  className="w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {outputWeightMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Recording...
                    </span>
                  ) : (
                    "Confirm Output Weight"
                  )}
                </button>
              </div>
            )}
          </>
        )}

        {/* ── WASH COMPLETE (status: wash_complete) ── */}
        {isWashComplete && (
          <>
            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
              <p className="text-sm text-primary/80">Wash complete! Ready to pack.</p>
            </div>
            {order.outputWeight && (
              <div className="p-3 rounded-xl bg-card border border-border">
                <p className="text-xs text-muted-foreground">Output weight</p>
                <p className="text-base font-semibold text-foreground">{order.outputWeight} lbs</p>
              </div>
            )}
            <button
              data-testid="button-start-packing"
              type="button"
              onClick={() => advanceMutation.mutate("packing")}
              disabled={advanceMutation.isPending}
              className="w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {advanceMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Updating...
                </span>
              ) : (
                "Start Packing"
              )}
            </button>
          </>
        )}

        {/* ── PACKING (status: packing) ── */}
        {isPacking && (
          <>
            <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center gap-3">
              <Clock className="w-5 h-5 text-orange-400 flex-shrink-0" />
              <p className="text-sm text-orange-300">Packing in progress. Mark ready when done.</p>
            </div>
            <button
              data-testid="button-mark-ready"
              type="button"
              onClick={() => advanceMutation.mutate("ready_for_delivery")}
              disabled={advanceMutation.isPending}
              className="w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {advanceMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Updating...
                </span>
              ) : (
                "Mark Ready for Delivery"
              )}
            </button>
          </>
        )}

        {!canStartWashing && !isCurrentlyWashing && !isWashComplete && !isPacking && (
          <p className="text-xs text-center text-muted-foreground">
            Order must be at the laundromat to start washing. Current status:{" "}
            {order.status}
          </p>
        )}
      </div>
    </div>
  );
}
