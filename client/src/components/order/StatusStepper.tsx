import { Check } from "lucide-react";
import { FSM_TIMELINE, LEGACY_MAP } from "@/lib/order-constants";

export function StatusStepper({ currentStatus }: { currentStatus: string }) {
  const mappedStatus = LEGACY_MAP[currentStatus] || currentStatus;
  const currentIndex = FSM_TIMELINE.findIndex(s => s.key === mappedStatus);

  // Show condensed view: 3 before + current + 3 after
  const startIdx = Math.max(0, currentIndex - 2);
  const endIdx = Math.min(FSM_TIMELINE.length, currentIndex + 4);
  const visibleSteps = FSM_TIMELINE.slice(startIdx, endIdx);

  return (
    <div className="space-y-0">
      {startIdx > 0 && (
        <p className="text-[10px] text-muted-foreground/60 mb-1 pl-10">
          ...{startIdx} earlier steps completed
        </p>
      )}
      {visibleSteps.map((step, idx) => {
        const realIdx = startIdx + idx;
        const isComplete = realIdx < currentIndex;
        const isCurrent = realIdx === currentIndex;
        const isFuture = realIdx > currentIndex;
        const Icon = step.icon;

        return (
          <div key={step.key} className="flex gap-3 items-start">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
                isComplete ? "bg-emerald-500/20 text-emerald-400" :
                isCurrent ? "bg-primary/20 text-primary ring-2 ring-primary/30" :
                "bg-muted text-muted-foreground/40"
              }`}>
                {isComplete ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
              </div>
              {idx < visibleSteps.length - 1 && (
                <div className={`w-0.5 h-4 ${
                  isComplete ? "bg-emerald-500/30" :
                  isCurrent ? "bg-primary/20" :
                  "bg-border/50"
                }`} />
              )}
            </div>
            <div className={`pb-1 ${isFuture ? "opacity-40" : ""}`}>
              <p className={`text-xs leading-tight ${
                isCurrent ? "font-semibold text-primary" :
                isComplete ? "font-medium text-emerald-400" :
                "text-muted-foreground"
              }`}>
                {step.label}
              </p>
            </div>
          </div>
        );
      })}
      {endIdx < FSM_TIMELINE.length && (
        <p className="text-[10px] text-muted-foreground/60 pl-10 mt-1">
          ...{FSM_TIMELINE.length - endIdx} more steps remaining
        </p>
      )}
    </div>
  );
}
