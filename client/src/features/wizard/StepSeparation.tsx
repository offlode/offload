import { Card } from "@/components/ui/card";
import { Check, X, Shirt, AlertCircle } from "lucide-react";

interface StepSeparationProps {
  value: boolean | null;
  separationFee: number;
  onChange: (separate: boolean) => void;
}

export function StepSeparation({ value, separationFee, onChange }: StepSeparationProps) {
  return (
    <div className="px-5 space-y-4">
      <div>
        <h2 className="text-lg font-bold mb-1">Separate by Type?</h2>
        <p className="text-sm text-muted-foreground">
          Want us to wash your clothes separately by clothing type?
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card
          className={`p-5 cursor-pointer transition-all duration-200 text-center ${
            value === true
              ? "border-primary ring-2 ring-primary/20 bg-primary/5"
              : "hover:border-primary/30"
          }`}
          onClick={() => onChange(true)}
          data-testid="separation-yes"
        >
          <div className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${
            value === true ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}>
            <Check className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold mb-1">Yes, separate</p>
          <p className="text-xs text-muted-foreground">
            Wash items by type for best results
          </p>
        </Card>

        <Card
          className={`p-5 cursor-pointer transition-all duration-200 text-center ${
            value === false
              ? "border-primary ring-2 ring-primary/20 bg-primary/5"
              : "hover:border-primary/30"
          }`}
          onClick={() => onChange(false)}
          data-testid="separation-no"
        >
          <div className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${
            value === false ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}>
            <X className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold mb-1">No, wash together</p>
          <p className="text-xs text-muted-foreground">
            All items washed as one load
          </p>
        </Card>
      </div>

      {/* Separation fee disclosure */}
      {value === true && (
        <Card className="p-4 bg-primary/5 border-primary/20">
          <div className="flex items-start gap-3">
            <Shirt className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Separation Fee</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {separationFee > 0
                  ? `$${separationFee.toFixed(2)} separation fee will be added to your order.`
                  : "(no extra charge)"}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Info about separation */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Separating by type helps protect delicates and ensures optimal wash settings per fabric.
          You'll be able to choose which clothing types to separate in the next step.
        </p>
      </div>
    </div>
  );
}
