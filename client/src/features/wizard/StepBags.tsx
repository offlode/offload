import { Minus, Plus, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BAG_OPTIONS, BAG_PRICES, SIGNATURE_PREMIUM, type BagSize } from "@/lib/design-tokens";
import type { BagSelection } from "./types";

interface StepBagsProps {
  bags: BagSelection[];
  onChange: (bags: BagSelection[]) => void;
  serviceType?: string;
}

const BAG_SIZES: { size: BagSize; icon: string }[] = [
  { size: "small", icon: "S" },
  { size: "medium", icon: "M" },
  { size: "large", icon: "L" },
  { size: "xl", icon: "XL" },
];

export function StepBags({ bags, onChange, serviceType }: StepBagsProps) {
  const isSignature = serviceType === "wash_fold_signature";
  const getQuantity = (size: BagSize) => bags.find(b => b.size === size)?.quantity ?? 0;

  const updateQuantity = (size: BagSize, delta: number) => {
    const current = getQuantity(size);
    const next = Math.max(0, current + delta);
    const filtered = bags.filter(b => b.size !== size);
    if (next > 0) {
      onChange([...filtered, { size, quantity: next }]);
    } else {
      onChange(filtered);
    }
  };

  const totalBags = bags.reduce((sum, b) => sum + b.quantity, 0);
  const totalWeight = bags.reduce((sum, b) => sum + b.quantity * BAG_OPTIONS[b.size].maxLbs, 0);

  return (
    <div className="px-5 space-y-4">
      <div>
        <h2 className="text-xl font-bold mb-1 tracking-tight">Choose Your Bag Size</h2>
        <p className="text-sm text-muted-foreground">
          Flat-rate pricing — know your price before you order.
        </p>
      </div>

      <div className="space-y-3">
        {BAG_SIZES.map(({ size, icon }) => {
          const tier = BAG_OPTIONS[size];
          const qty = getQuantity(size);
          const isSelected = qty > 0;

          return (
            <Card
              key={size}
              className={`p-4 rounded-2xl transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "border-primary ring-1 ring-primary/20"
                  : "hover:border-primary/30"
              }`}
              onClick={() => { if (qty === 0) updateQuantity(size, 1); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" && qty === 0) updateQuantity(size, 1); }}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm ${
                  isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{tier.label}</p>
                      {isSignature && (
                        <Badge variant="secondary" className="text-[10px] bg-primary/15 text-primary px-1.5 py-0">
                          +${SIGNATURE_PREMIUM}/bag
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-bold text-primary" data-testid={`bag-${size}-price`}>
                      ${(isSignature ? BAG_PRICES[size].signature : BAG_PRICES[size].standard).toFixed(2)}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Up to {tier.maxLbs} lbs
                  </p>
                </div>
              </div>

              {/* Quantity controls */}
              <div className="flex items-center justify-end gap-3 mt-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-full"
                  onClick={() => updateQuantity(size, -1)}
                  disabled={qty === 0}
                  data-testid={`bag-${size}-minus`}
                >
                  <Minus className="w-3.5 h-3.5" />
                </Button>
                <span className="w-8 text-center text-sm font-bold" data-testid={`bag-${size}-qty`}>
                  {qty}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-full"
                  onClick={() => updateQuantity(size, 1)}
                  data-testid={`bag-${size}-plus`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Summary bar */}
      {totalBags > 0 && (
        <Card className="p-4 bg-primary/5 border-primary/20 rounded-2xl">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {totalBags} bag{totalBags !== 1 ? "s" : ""} selected
              </p>
              <p className="text-xs text-muted-foreground">
                Up to {totalWeight} lbs total capacity
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
