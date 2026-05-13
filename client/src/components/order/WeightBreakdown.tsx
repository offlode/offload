import { Scale, Info, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Order } from "@shared/schema";

interface WeightBreakdownProps {
  order: Order;
}

export function WeightBreakdown({ order }: WeightBreakdownProps) {
  if (!(order.dirtyWeight || order.cleanWeight || order.intakeWeight || order.outputWeight)) {
    return null;
  }

  return (
    <div className="px-5 mb-4">
      <Card className="p-4" data-testid="card-weight-pricing">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Scale className="w-4 h-4 text-primary" />
          Weight & Pricing
        </h3>

        {/* Tier Info */}
        {order.tierName && (
          <div className="mb-3 p-2 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-xs text-muted-foreground">Selected Tier</p>
            <p className="text-sm font-semibold">
              {order.tierName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} — up to {order.tierMaxWeight} lbs
            </p>
          </div>
        )}

        {/* Weight Comparison */}
        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          {(order.dirtyWeight != null) && (
            <div>
              <p className="text-xs text-muted-foreground">Dirty Weight (at pickup)</p>
              <p className="font-semibold" data-testid="text-dirty-weight">{order.dirtyWeight} lbs</p>
            </div>
          )}
          {(order.cleanWeight != null) && (
            <div>
              <p className="text-xs text-muted-foreground">Clean Weight (after wash)</p>
              <p className="font-semibold" data-testid="text-clean-weight">{order.cleanWeight} lbs</p>
            </div>
          )}
          {order.intakeWeight != null && !order.dirtyWeight && (
            <div>
              <p className="text-xs text-muted-foreground">Intake Weight</p>
              <p className="font-semibold" data-testid="text-intake-weight">{order.intakeWeight} lbs</p>
            </div>
          )}
          {order.outputWeight != null && !order.cleanWeight && (
            <div>
              <p className="text-xs text-muted-foreground">Output Weight</p>
              <p className="font-semibold" data-testid="text-output-weight">{order.outputWeight} lbs</p>
            </div>
          )}
        </div>

        {/* Weight Difference Explanation */}
        {order.weightDifference != null && order.weightDifference > 0 && (
          <div className="mb-3 flex gap-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-blue-400">
                Weight difference: -{order.weightDifference.toFixed(1)} lbs
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Clothes lose 10-15% weight when clean due to moisture and lint removal.
              </p>
            </div>
          </div>
        )}

        {/* Overage Highlight */}
        {order.overageWeight != null && order.overageWeight > 0 && (
          <div className="mb-3 flex gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-amber-400">
                Your order was {order.overageWeight.toFixed(1)} lbs over the {order.tierName?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} limit
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Overage charge: ${(order.overageCharge || 0).toFixed(2)} ({order.overageWeight.toFixed(1)} lbs x $2.50/lb)
              </p>
            </div>
          </div>
        )}

        {/* Pricing Breakdown */}
        {order.tierFlatPrice != null && (
          <div className="space-y-1.5 text-sm pt-2 border-t border-border">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Tier Price</span>
              <span className="text-xs">${order.tierFlatPrice.toFixed(2)}</span>
            </div>
            {order.overageCharge != null && order.overageCharge > 0 && (
              <div className="flex justify-between text-amber-400">
                <span className="text-xs">Overage</span>
                <span className="text-xs">+${order.overageCharge.toFixed(2)}</span>
              </div>
            )}
            {order.discount != null && order.discount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span className="text-xs">Discount</span>
                <span className="text-xs">-${order.discount.toFixed(2)}</span>
              </div>
            )}
            {order.finalPrice != null && (
              <div className="flex justify-between font-bold pt-1 border-t border-border">
                <span className="text-xs">Final Price</span>
                <span className="text-xs text-primary">${order.finalPrice.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {order.weightDiscrepancy === true && (
          <div className="mt-2 flex items-center gap-2 text-xs text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            Weight discrepancy detected
          </div>
        )}
      </Card>
    </div>
  );
}
