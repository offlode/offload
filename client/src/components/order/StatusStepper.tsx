import { Check } from "lucide-react";
import { ORDER_PROGRESS_ORDER, ORDER_PROGRESS_LABELS } from "@/lib/order-status";

/** Map legacy / intermediate statuses to nearest canonical 13-state key */
const LEGACY_TO_CANONICAL: Record<string, string> = {
  pending: "order_placed",
  scheduled: "confirmed",
  pickup_in_progress: "picked_up",
  driver_en_route_pickup: "driver_assigned",
  arrived_pickup: "picked_up",
  driver_en_route_facility: "at_facility",
  at_laundromat: "at_facility",
  processing: "washing",
  drying: "wash_complete",
  folding: "folded_packaged",
  quality_check: "folded_packaged",
  packing: "folded_packaged",
  price_confirmed: "final_weight_verified",
  driver_en_route_delivery: "out_for_delivery",
  arrived_delivery: "delivered",
};

export function StatusStepper({ currentStatus }: { currentStatus: string }) {
  const mapped = LEGACY_TO_CANONICAL[currentStatus] || currentStatus;
  const currentIndex = ORDER_PROGRESS_ORDER.indexOf(mapped as typeof ORDER_PROGRESS_ORDER[number]);

  return (
    <div className="space-y-0">
      {ORDER_PROGRESS_ORDER.map((key, idx) => {
        const isComplete = currentIndex >= 0 && idx < currentIndex;
        const isCurrent = idx === currentIndex;
        const isFuture = currentIndex >= 0 ? idx > currentIndex : true;
        const isLast = idx === ORDER_PROGRESS_ORDER.length - 1;
        const label = ORDER_PROGRESS_LABELS[key] || key;

        return (
          <div key={key} className="flex gap-3 items-start">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
                isComplete ? "bg-emerald-500/20 text-emerald-400" :
                isCurrent ? "bg-[#5B4BC4]/20 text-[#5B4BC4] ring-2 ring-[#5B4BC4]/30" :
                "bg-muted text-muted-foreground/40"
              }`}>
                {isComplete ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-current" />
                )}
              </div>
              {!isLast && (
                <div className={`w-0.5 h-4 ${
                  isComplete ? "bg-emerald-500/30" :
                  isCurrent ? "bg-[#5B4BC4]/20" :
                  "bg-border/50"
                }`} />
              )}
            </div>
            <div className={`pb-1 ${isFuture ? "opacity-40" : ""}`}>
              <p className={`text-xs leading-tight ${
                isCurrent ? "font-semibold text-[#5B4BC4]" :
                isComplete ? "font-medium text-emerald-400" :
                "text-muted-foreground"
              }`}>
                {label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
