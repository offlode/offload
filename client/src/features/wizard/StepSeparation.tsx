import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Check, X, Shirt, AlertCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { BagSelection } from "./types";

interface StepSeparationProps {
  value: boolean | null;
  separationFee: number;
  bags: BagSelection[];
  onChange: (separate: boolean) => void;
}

export function StepSeparation({ value, separationFee, bags, onChange }: StepSeparationProps) {
  const [liveFee, setLiveFee] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeFailed, setFeeFailed] = useState(false);

  // Fetch live separation fee when user selects "Yes, separate"
  useEffect(() => {
    if (value !== true) {
      setLiveFee(null);
      setFeeLoading(false);
      setFeeFailed(false);
      return;
    }

    let cancelled = false;
    setFeeLoading(true);
    setFeeFailed(false);

    // Infer primary tier from bags
    const activeBags = bags.filter(b => b.quantity > 0);
    activeBags.sort((a, b) => b.quantity - a.quantity);
    const tierName = activeBags[0]?.size || "small";

    apiRequest("POST", "/api/quotes", {
      tierName,
      pickupAddress: "",
      separated: true,
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        // Look for a separation line item in the response
        const sepItem = data.lineItems?.find((li: any) =>
          li.type === "separation" || li.label?.toLowerCase().includes("separat")
        );
        if (sepItem) {
          const fee = sepItem.amount ?? (sepItem.amountCents != null ? sepItem.amountCents / 100 : 0);
          setLiveFee(fee);
        } else {
          setLiveFee(0);
        }
        setFeeLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFeeFailed(true);
        setLiveFee(null);
        setFeeLoading(false);
      });

    return () => { cancelled = true; };
  }, [value, bags]);

  const displayFee = liveFee !== null ? liveFee : separationFee;
  return (
    <div className="px-5 space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-1">Separate by Type?</h2>
        <p className="text-sm text-muted-foreground">
          Want us to wash your clothes separately by clothing type?
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Separation preference">
        <button
          role="radio"
          aria-checked={value === true}
          onClick={() => onChange(true)}
          data-testid="separation-yes"
          className="text-left"
        >
          <Card
            className={`p-5 rounded-2xl cursor-pointer transition-all duration-200 text-center ${
              value === true
                ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                : "hover:border-primary/30"
            }`}
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
        </button>

        <button
          role="radio"
          aria-checked={value === false}
          onClick={() => onChange(false)}
          data-testid="separation-no"
          className="text-left"
        >
          <Card
            className={`p-5 rounded-2xl cursor-pointer transition-all duration-200 text-center ${
              value === false
                ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                : "hover:border-primary/30"
            }`}
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
        </button>
      </div>

      {/* Separation fee disclosure */}
      {value === true && (
        <Card className="p-4 bg-primary/5 border-primary/20 rounded-2xl">
          <div className="flex items-start gap-3">
            <Shirt className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Separation Fee</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {feeLoading ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    (checking...)
                  </span>
                ) : feeFailed ? (
                  "Surcharge unavailable — refresh to retry"
                ) : displayFee > 0 ? (
                  `$${displayFee.toFixed(2)} separation fee will be added to your order.`
                ) : (
                  "Surcharge unavailable — refresh to retry"
                )}
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
