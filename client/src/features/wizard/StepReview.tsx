import { useQuery } from "@tanstack/react-query";
import { Package, MapPin, CreditCard, Truck, DollarSign, Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BAG_OPTIONS, DELIVERY_SPEEDS } from "@/lib/design-tokens";
import { apiRequest } from "@/lib/queryClient";
import type { WizardState } from "./types";

interface StepReviewProps {
  state: WizardState;
  onEdit: (step: number) => void;
  onQuoteStatus?: (valid: boolean) => void;
}

interface QuoteLineItem {
  label: string;
  amountCents?: number;
  amount?: number;
  type?: string;
}

interface QuoteResponse {
  lineItems: QuoteLineItem[];
  total: number;
  tierName?: string;
}

function formatDollars(dollars: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(dollars);
}

function inferPrimaryTier(bags: WizardState["bags"]): string {
  const active = bags.filter(b => b.quantity > 0);
  if (active.length === 0) return "small";
  active.sort((a, b) => b.quantity - a.quantity);
  return active[0].size;
}

export function StepReview({ state, onEdit, onQuoteStatus }: StepReviewProps) {
  const primaryTier = inferPrimaryTier(state.bags);

  const quotePayload = {
    tierName: primaryTier,
    pickupAddress: state.address,
    deliverySpeed: state.deliverySpeed,
    serviceType: state.serviceType,
    separated: false,
    clothing_types: [],
    wash_preferences: state.specialInstructions ? { notes: state.specialInstructions } : {},
  };

  const { data: quote, isLoading: quoteLoading, isError: quoteError } = useQuery<QuoteResponse>({
    queryKey: ["/api/quotes", JSON.stringify(quotePayload)],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/quotes", quotePayload);
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });

  if (onQuoteStatus) {
    onQuoteStatus(!quoteLoading && !quoteError && !!quote);
  }

  const totalBags = state.bags.reduce((sum, b) => sum + b.quantity, 0);
  const isSignature = state.serviceType === "wash_fold_signature";

  return (
    <div className="px-5 space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-1">Review Your Order</h2>
        <p className="text-sm text-muted-foreground">
          Confirm the details before placing your order.
        </p>
      </div>

      {/* Signature badge */}
      {isSignature && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-3 py-2">
          <p className="text-xs text-primary font-medium">Signature Wash — premium label, +$5/bag</p>
        </div>
      )}

      {/* Order items */}
      <Card className="p-4 space-y-3 divide-y divide-border rounded-2xl">
        {/* Bags */}
        <div className="flex items-start gap-3">
          <Package className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Bags ({totalBags})</p>
              <button className="text-xs text-primary font-medium" onClick={() => onEdit(1)}>Change</button>
            </div>
            <div className="mt-1 space-y-0.5">
              {state.bags.filter(b => b.quantity > 0).map(b => (
                <p key={b.size} className="text-xs text-muted-foreground">
                  {b.quantity}x {BAG_OPTIONS[b.size].label}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="flex items-start gap-3 pt-3">
          <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Pickup</p>
              <button className="text-xs text-primary font-medium" onClick={() => onEdit(2)}>Change</button>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{state.address || "No address set"}</p>
            <p className="text-xs text-muted-foreground">
              {state.pickupDate} &middot; {state.pickupTimeWindow || "No time selected"}
            </p>
          </div>
        </div>

        {/* Delivery speed */}
        <div className="flex items-start gap-3 pt-3">
          <Truck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Delivery</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {DELIVERY_SPEEDS[state.deliverySpeed]?.label ?? "Standard"}
            </p>
          </div>
        </div>
      </Card>

      {/* Price breakdown */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-5 h-5 text-primary" />
          <p className="text-sm font-bold">Order Total</p>
          {quoteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
        {quoteLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        ) : quoteError || !quote ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Quote unavailable — refresh to retry</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {quote.lineItems
              .filter(item => {
                const amt = item.amount ?? (item.amountCents != null ? item.amountCents / 100 : 0);
                return amt !== 0 || item.type !== "separation";
              })
              .map((item, idx) => {
                const amt = item.amount ?? (item.amountCents != null ? item.amountCents / 100 : 0);
                return (
                  <div key={`${item.type ?? item.label}-${idx}`} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span>{formatDollars(amt)}</span>
                  </div>
                );
              })}
            <div className="border-t border-border my-2" />
            <div className="flex justify-between">
              <span className="text-sm font-bold">Total</span>
              <span className="text-lg font-bold text-primary">{formatDollars(quote.total)}</span>
            </div>
          </div>
        )}
      </Card>

      {state.specialInstructions && (
        <Card className="p-3 bg-muted/30 rounded-2xl">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">Note:</span> {state.specialInstructions}
          </p>
        </Card>
      )}
    </div>
  );
}
