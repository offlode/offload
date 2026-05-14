import { useQuery } from "@tanstack/react-query";
import { Package, Shirt, MapPin, CreditCard, Clock, Truck, DollarSign, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PRICING, DELIVERY_SPEEDS } from "@/lib/design-tokens";
import type { WizardState } from "./types";
import { useAuth } from "@/contexts/auth-context";

interface StepReviewProps {
  state: WizardState;
  onEdit: (step: number) => void;
}

interface QuoteResponse {
  bagsTotal: number;
  separationFee: number;
  deliveryFee: number;
  tax: number;
  total: number;
}

export function StepReview({ state, onEdit }: StepReviewProps) {
  const { user } = useAuth();

  // Attempt to get real quote from backend
  const { data: quote, isLoading: quoteLoading } = useQuery<QuoteResponse>({
    queryKey: ["/api/quote", JSON.stringify({
      bags: state.bags,
      separated: state.separateByType,
      deliverySpeed: state.deliverySpeed,
      serviceType: state.serviceType,
    })],
    queryFn: async () => {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bags: state.bags,
          separated: state.separateByType,
          deliverySpeed: state.deliverySpeed,
          serviceType: state.serviceType,
        }),
      });
      if (!res.ok) throw new Error("Quote unavailable");
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });

  // Client-side estimate as fallback (NOT used for Stripe — Stripe amount MUST come from backend)
  const clientEstimate = {
    bagsTotal: state.bags.reduce((sum, b) => sum + b.quantity * PRICING[b.size].price, 0),
    separationFee: state.separateByType ? state.separationFee : 0,
    deliveryFee: DELIVERY_SPEEDS[state.deliverySpeed]?.fee ?? 0,
    get subtotal() { return this.bagsTotal + this.separationFee + this.deliveryFee; },
    get tax() { return this.subtotal * 0.08875; },
    get total() { return this.subtotal + this.tax; },
  };

  const display = quote || {
    bagsTotal: clientEstimate.bagsTotal,
    separationFee: clientEstimate.separationFee,
    deliveryFee: clientEstimate.deliveryFee,
    tax: clientEstimate.tax,
    total: clientEstimate.total,
  };

  const totalBags = state.bags.reduce((sum, b) => sum + b.quantity, 0);

  return (
    <div className="px-5 space-y-4">
      <div>
        <h2 className="text-lg font-bold mb-1">Review Your Order</h2>
        <p className="text-sm text-muted-foreground">
          Confirm the details before placing your order.
        </p>
      </div>

      {/* Order items */}
      <Card className="p-4 space-y-3 divide-y divide-border">
        {/* Bags */}
        <div className="flex items-start gap-3">
          <Package className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Bags ({totalBags})</p>
              <button className="text-xs text-primary font-medium" onClick={() => onEdit(1)}>Edit</button>
            </div>
            <div className="mt-1 space-y-0.5">
              {state.bags.filter(b => b.quantity > 0).map(b => (
                <p key={b.size} className="text-xs text-muted-foreground">
                  {b.quantity}x {PRICING[b.size].label} — ${(b.quantity * PRICING[b.size].price).toFixed(2)}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Separation */}
        {state.separateByType && (
          <div className="flex items-start gap-3 pt-3">
            <Shirt className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Separation</p>
                <button className="text-xs text-primary font-medium" onClick={() => onEdit(2)}>Edit</button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {state.clothingTypes.length} type{state.clothingTypes.length !== 1 ? "s" : ""} selected
              </p>
              {state.clothingTypes.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {state.clothingTypes.slice(0, 5).join(", ")}
                  {state.clothingTypes.length > 5 ? ` +${state.clothingTypes.length - 5} more` : ""}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Address */}
        <div className="flex items-start gap-3 pt-3">
          <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Pickup</p>
              <button className="text-xs text-primary font-medium" onClick={() => onEdit(4)}>Edit</button>
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

        {/* Payment */}
        <div className="flex items-start gap-3 pt-3">
          <CreditCard className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Payment</p>
              <button className="text-xs text-primary font-medium" onClick={() => onEdit(5)}>Edit</button>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {state.paymentMethodId ? `Card ending ••••` : "No payment method selected"}
            </p>
          </div>
        </div>
      </Card>

      {/* Price breakdown */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-5 h-5 text-primary" />
          <p className="text-sm font-bold">Order Total</p>
          {quoteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          {!quote && !quoteLoading && (
            <span className="text-[10px] bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded-full">
              Estimate
            </span>
          )}
        </div>
        {quoteLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Bags total</span>
              <span>${display.bagsTotal.toFixed(2)}</span>
            </div>
            {display.separationFee > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Separation fee</span>
                <span>${display.separationFee.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Delivery fee</span>
              <span>{display.deliveryFee > 0 ? `$${display.deliveryFee.toFixed(2)}` : "FREE"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Tax</span>
              <span>${display.tax.toFixed(2)}</span>
            </div>
            <div className="border-t border-border my-2" />
            <div className="flex justify-between">
              <span className="text-sm font-bold">Total</span>
              <span className="text-lg font-bold text-primary">${display.total.toFixed(2)}</span>
            </div>
          </div>
        )}
      </Card>

      {state.specialInstructions && (
        <Card className="p-3 bg-muted/30">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">Note:</span> {state.specialInstructions}
          </p>
        </Card>
      )}
    </div>
  );
}
