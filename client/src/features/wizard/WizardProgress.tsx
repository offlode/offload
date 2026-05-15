import { WIZARD_STEPS } from "./types";
import { Check } from "lucide-react";

interface WizardProgressProps {
  currentStep: number;
  /** Step IDs to skip (hide) from the progress bar */
  skippedSteps?: number[];
  /** @deprecated Use skippedSteps instead */
  skipStep3?: boolean;
}

export function WizardProgress({ currentStep, skippedSteps, skipStep3 }: WizardProgressProps) {
  // Build the effective skipped set, supporting legacy skipStep3 prop
  const skippedSet = new Set<number>(skippedSteps ?? []);
  if (skipStep3 && !skippedSet.size) {
    skippedSet.add(3);
    skippedSet.add(4);
  }

  const steps = WIZARD_STEPS.filter(s => !skippedSet.has(s.id));

  const totalSteps = steps.length;
  const currentIndex = steps.findIndex(s => s.id === currentStep);
  const progress = totalSteps > 0 ? ((currentIndex + 1) / totalSteps) * 100 : 0;

  return (
    <div
      className="px-5 pt-4 pb-2"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-valuenow={currentIndex + 1}
      aria-label={`Step ${currentIndex + 1} of ${totalSteps}`}
    >
      {/* Progress bar */}
      <div className="relative h-1.5 bg-muted rounded-full overflow-hidden mb-3">
        <div
          className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-between">
        {steps.map((step, idx) => {
          const isCompleted = currentIndex > idx;
          const isCurrent = step.id === currentStep;

          return (
            <div key={step.id} className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  isCompleted
                    ? "bg-primary text-primary-foreground"
                    : isCurrent
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : idx + 1}
              </div>
              <span
                className={`text-[10px] font-medium transition-colors ${
                  isCurrent ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.shortTitle}
              </span>
            </div>
          );
        })}
      </div>

      {/* Percentage */}
      <p className="text-center text-xs text-muted-foreground mt-2">
        {Math.round(progress)}% complete
      </p>
    </div>
  );
}
