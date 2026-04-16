import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft, CreditCard, Plus, Trash2, Smartphone, Wallet,
  Star, Pencil, Shield
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import type { PaymentMethod } from "@shared/schema";

const TYPE_ICONS: Record<string, typeof CreditCard> = {
  card: CreditCard,
  apple_pay: Smartphone,
  google_pay: Wallet,
};

const TYPE_LABELS: Record<string, string> = {
  card: "Credit/Debit Card",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
};

const TYPE_DESCRIPTIONS: Record<string, string> = {
  apple_pay: "Touch ID or Face ID",
  google_pay: "Google Wallet authentication",
};

export default function PaymentsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id;
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [newType, setNewType] = useState("card");
  const [newLabel, setNewLabel] = useState("");
  const [newLast4, setNewLast4] = useState("");
  const [newExpiry, setNewExpiry] = useState("");

  const { data: methods, isLoading } = useQuery<PaymentMethod[]>({
    queryKey: ["/api/payment-methods", userId],
    queryFn: async () => {
      const res = await apiRequest(`/api/payment-methods?userId=${userId}`);
      return res.json();
    },
    enabled: !!userId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        userId,
        type: newType,
        label: newLabel || TYPE_LABELS[newType] || "Card",
        isDefault: 0,
      };
      if (newType === "card") {
        body.last4 = newLast4;
        body.expiryDate = newExpiry;
      }
      const res = await apiRequest("/api/payment-methods", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods", userId] });
      closeForm();
      toast({ title: "Payment method added" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/payment-methods/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods", userId] });
      setDeleteId(null);
      toast({ title: "Payment method removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/payment-methods/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: 1, userId }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods", userId] });
      toast({ title: "Default payment method updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const closeForm = () => {
    setFormOpen(false);
    setNewType("card");
    setNewLabel("");
    setNewLast4("");
    setNewExpiry("");
  };

  const isValid = newType === "card"
    ? (newLast4.length === 4 && newExpiry.length >= 4)
    : true;

  const defaultMethod = methods?.find(pm => pm.isDefault);
  const allMethods = methods || [];

  function getDescription(pm: PaymentMethod): string {
    if (pm.type === "apple_pay") return "Touch ID or Face ID";
    if (pm.type === "google_pay") return "Google Wallet authentication";
    if (pm.type === "card" && pm.last4) return `•••• •••• •••• ${pm.last4}`;
    return TYPE_LABELS[pm.type] || "";
  }

  return (
    <div className="pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button
          onClick={() => navigate("/profile")}
          data-testid="button-back"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-card transition-colors active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Payment Methods</h1>
          <p className="text-xs text-muted-foreground">
            Manage your payment methods for quick and secure checkout
          </p>
        </div>
      </div>

      <div className="px-5 space-y-5 mt-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))
        ) : (
          <>
            {/* Default Payment Method Section */}
            {defaultMethod && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <h2 className="text-sm font-semibold">Default Payment Method</h2>
                </div>
                <Card
                  className="p-4 rounded-2xl border-primary/20 bg-card"
                  data-testid={`payment-default-${defaultMethod.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                      defaultMethod.type === "apple_pay" ? "bg-gray-500/15 text-gray-300" :
                      defaultMethod.type === "google_pay" ? "bg-blue-500/15 text-blue-400" :
                      "bg-primary/10 text-primary"
                    }`}>
                      {(() => {
                        const Icon = TYPE_ICONS[defaultMethod.type] || CreditCard;
                        return <Icon className="w-5 h-5" />;
                      })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{defaultMethod.label}</p>
                        <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15">
                          Default
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {getDescription(defaultMethod)}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* All Payment Methods */}
            <div>
              <h2 className="text-sm font-semibold mb-3">
                All Payment Methods ({allMethods.length})
              </h2>
              <div className="space-y-3">
                {allMethods.length > 0 ? (
                  allMethods.map(pm => {
                    const Icon = TYPE_ICONS[pm.type] || CreditCard;
                    return (
                      <Card
                        key={pm.id}
                        className="p-4 rounded-2xl transition-all duration-200 hover:border-white/10"
                        data-testid={`payment-card-${pm.id}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            pm.type === "apple_pay" ? "bg-gray-500/15 text-gray-300" :
                            pm.type === "google_pay" ? "bg-blue-500/15 text-blue-400" :
                            "bg-primary/10 text-primary"
                          }`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold">{pm.label}</p>
                              {pm.isDefault ? (
                                <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15">
                                  Default
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {getDescription(pm)}
                            </p>
                            {!pm.isDefault && (
                              <button
                                className="text-xs text-primary font-medium mt-1.5 hover:underline"
                                onClick={() => setDefaultMutation.mutate(pm.id)}
                                disabled={setDefaultMutation.isPending}
                                data-testid={`button-set-default-${pm.id}`}
                              >
                                Set as Default
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                              onClick={() => toast({ title: "Edit", description: `Editing ${pm.label}` })}
                              data-testid={`button-edit-${pm.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                              onClick={() => setDeleteId(pm.id)}
                              data-testid={`button-delete-${pm.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })
                ) : (
                  <Card className="p-12 text-center rounded-2xl">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <CreditCard className="w-8 h-8 text-primary/60" />
                    </div>
                    <p className="text-sm font-medium mb-1">No payment methods</p>
                    <p className="text-xs text-muted-foreground mb-4">Add a card or digital wallet to get started.</p>
                    <Button size="sm" onClick={() => setFormOpen(true)} data-testid="button-add-first-payment" className="rounded-full">
                      Add Payment Method
                    </Button>
                  </Card>
                )}
              </div>
            </div>

            {/* Add New Payment Method */}
            <div>
              <h2 className="text-sm font-semibold mb-3">Add New Payment Method</h2>
              <Card
                className="p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.98]"
                onClick={() => setFormOpen(true)}
                data-testid="card-add-new-payment"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0">
                    <Plus className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">New Credit or Debit Card</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Visa, Mastercard, American Express and more
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Your Payment Security */}
            <Card className="p-4 rounded-2xl bg-amber-900/20 border-amber-700/20">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-300">Your Payment Security</h3>
              </div>
              <ul className="space-y-2.5">
                {[
                  "All payment data is end-to-end secure",
                  "We never store your details",
                  "We use easy alias to identify your cards",
                  "PCI DSS compliant payment processing",
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                    <p className="text-xs text-amber-200/80">{text}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>

      {/* Add Sheet */}
      <Sheet open={formOpen} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Add Payment Method</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Type</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger data-testid="select-payment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">Credit/Debit Card</SelectItem>
                  <SelectItem value="apple_pay">Apple Pay</SelectItem>
                  <SelectItem value="google_pay">Google Pay</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Label</Label>
              <Input
                placeholder="e.g., Personal Card"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                data-testid="input-payment-label"
              />
            </div>
            {newType === "card" && (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground">Last 4 Digits</Label>
                  <Input
                    placeholder="4242"
                    maxLength={4}
                    value={newLast4}
                    onChange={e => setNewLast4(e.target.value.replace(/\D/g, ""))}
                    data-testid="input-payment-last4"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Expiry Date</Label>
                  <Input
                    placeholder="MM/YYYY"
                    value={newExpiry}
                    onChange={e => setNewExpiry(e.target.value)}
                    data-testid="input-payment-expiry"
                  />
                </div>
              </>
            )}
            <Button
              className="w-full rounded-full bg-primary hover:bg-primary/90 text-white"
              disabled={!isValid || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="button-save-payment"
            >
              {createMutation.isPending ? "Saving..." : "Add Payment Method"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this payment method?</AlertDialogTitle>
            <AlertDialogDescription>
              This payment method will be permanently removed from your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-confirm"
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
