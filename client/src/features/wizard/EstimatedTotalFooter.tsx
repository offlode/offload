import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { WizardState } from "./types";

interface EstimatedTotalFooterProps {
  state: WizardState;
  currentStep: number;
}

function inferTierName(bags: WizardState["bags"]): string {
  const active = bags.filter(b => b.quantity > 0);
  if (active.length === 0) return "small";
  const sorted = [...active].sort((a, b) => b.quantity - a.quantity);
  return sorted[0].size;
}

export function EstimatedTotalFooter({ state, currentStep }: EstimatedTotalFooterProps) {
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasBags = state.bags.some(b => b.quantity > 0);

  useEffect(() => {
    if (currentStep < 1 || !hasBags) {
      setTotal(null);
      return;
    }

    // Debounce 400ms
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const tierName = inferTierName(state.bags);
        const bags = state.bags
          .filter(b => b.quantity > 0)
          .map(b => ({ size: b.size, quantity: b.quantity }));

        const body: Record<string, unknown> = {
          pickupAddress: state.address || "123 Main St, New York NY 10001",
          tierName,
          serviceType: state.serviceType || "wash_fold",
          deliverySpeed: state.deliverySpeed || "standard",
          bags,
        };

        const res = await apiRequest("/api/quotes", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json();
          setTotal(typeof data.total === "number" ? data.total : null);
        } else {
          setTotal(null);
        }
      } catch {
        setTotal(null);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentStep,
    state.bags,
    state.serviceType,
    state.separateByType,
    state.deliverySpeed,
    hasBags,
  ]);

  // Only render on steps 2–7 (not step 1)
  if (currentStep < 1) return null;

  const displayTotal =
    loading
      ? "—"
      : total !== null && hasBags
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(total)
      : "—";

  return (
    <div className="fixed bottom-[72px] left-0 right-0 z-30 pointer-events-none">
      <div className="max-w-lg mx-auto px-5">
        <div className="bg-background/90 backdrop-blur border border-border rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm pointer-events-auto">
          <span className="text-xs text-muted-foreground font-medium">Estimated total</span>
          <span className="text-sm font-bold text-foreground tabular-nums">
            {displayTotal}
          </span>
        </div>
      </div>
    </div>
  );
}
