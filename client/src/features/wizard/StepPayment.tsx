import { useQuery } from "@tanstack/react-query";
import { CreditCard, Plus, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";

interface StepPaymentProps {
  selectedMethodId: string;
  onSelect: (id: string) => void;
}

interface PaymentMethod {
  id: number;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export function StepPayment({ selectedMethodId, onSelect }: StepPaymentProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: methods, isLoading } = useQuery<PaymentMethod[]>({
    queryKey: [`/api/payment-methods?userId=${user?.id}`],
    enabled: !!user?.id,
  });

  const brandIcon = (_brand: string) => {
    return <CreditCard className="w-5 h-5" />;
  };

  return (
    <div className="px-5 space-y-4">
      <div>
        <h2 className="text-lg font-bold mb-1">Payment Method</h2>
        <p className="text-sm text-muted-foreground">
          Choose how you'd like to pay for this order.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : methods && methods.length > 0 ? (
        <div className="space-y-3" role="radiogroup" aria-label="Payment methods">
          {methods.map(pm => {
            const isSelected = selectedMethodId === String(pm.id);
            return (
              <button
                key={pm.id}
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelect(String(pm.id))}
                data-testid={`payment-${pm.id}`}
                className="w-full text-left"
              >
                <Card
                  className={`p-4 cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                      : "hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                      isSelected ? "bg-primary/10" : "bg-muted"
                    }`}>
                      {brandIcon(pm.brand)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold capitalize">{pm.brand}</p>
                        {pm.isDefault && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        •••• {pm.last4} &middot; Expires {pm.expMonth}/{pm.expYear}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <CreditCard className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium mb-1">No payment methods</p>
          <p className="text-xs text-muted-foreground mb-4">
            Add a card to continue with your order.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/payments")}
            data-testid="button-add-card-empty"
          >
            <Plus className="w-4 h-4 mr-1" /> Add card
          </Button>
        </Card>
      )}

      {/* Add new card button */}
      <Button
        variant="outline"
        className="w-full h-12 rounded-xl"
        onClick={() => navigate("/payments")}
        data-testid="button-add-card"
      >
        <Plus className="w-4 h-4 mr-2" /> Add New Card
      </Button>
    </div>
  );
}
