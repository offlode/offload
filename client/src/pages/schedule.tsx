import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  MapPin, Calendar, Clock, StickyNote, ArrowLeft, Shield, ChevronDown,
  Search, Star as StarIcon, Home, Briefcase, MapPinned, Plus as PlusIcon,
  Check, CreditCard, ShoppingBag, Package, PackageOpen, Warehouse, Info, Mic
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Address, Vendor, PaymentMethod, PricingTier, AddOn } from "@shared/schema";
import { VoiceOrderModal } from "@/components/voice-order";
import type { FieldError } from "@/lib/inline-validation";
import { scrollToFirstError } from "@/lib/inline-validation";
import { InlineFieldError } from "@/components/field-error";

const TIER_ICONS: Record<string, typeof ShoppingBag> = {
  small_bag: ShoppingBag,
  medium_bag: Package,
  large_bag: PackageOpen,
  xl_bag: Warehouse,
};

const TIME_WINDOWS = [
  "8:00 AM - 10:00 AM",
  "10:00 AM - 12:00 PM",
  "12:00 PM - 2:00 PM",
  "2:00 PM - 4:00 PM",
  "4:00 PM - 6:00 PM",
  "6:00 PM - 8:00 PM",
];

const LABEL_ICONS: Record<string, typeof Home> = {
  Home: Home,
  Work: Briefcase,
};

function getMinDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export default function SchedulePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  // Read wash type from window (set by home page) — wouter hash routing
  // doesn't support query params reliably
  const washParam = (window as any).__offload_wash_type || null;
  // Clean up after reading
  if (washParam) delete (window as any).__offload_wash_type;

  const [tab, setTab] = useState<"now" | "schedule">("now");
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<Record<number, boolean>>({});
  const [addressNotes, setAddressNotes] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [certifiedOnly, setCertifiedOnly] = useState(true);
  const [deliverySpeed, setDeliverySpeed] = useState("48h");
  const [timeWindow, setTimeWindow] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<number | null>(null);
  const [voiceOrderOpen, setVoiceOrderOpen] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [addAddressMode, setAddAddressMode] = useState(false);
  const [newAddr, setNewAddr] = useState({ label: "", street: "", city: "", state: "", zip: "", notes: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  const clearError = (field: string) => {
    setFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const userId = user?.id;

  const { data: addresses } = useQuery<Address[]>({
    queryKey: [`/api/addresses?userId=${userId}`],
    enabled: !!userId,
  });

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const { data: paymentMethods } = useQuery<PaymentMethod[]>({
    queryKey: [`/api/payment-methods?userId=${userId}`],
    enabled: !!userId,
  });

  const { data: pricingTiers } = useQuery<PricingTier[]>({
    queryKey: ["/api/pricing-tiers"],
    queryFn: async () => {
      const res = await apiRequest("/api/pricing-tiers");
      return res.json();
    },
  });

  const { data: addOns } = useQuery<AddOn[]>({
    queryKey: ["/api/add-ons"],
    queryFn: async () => {
      const res = await apiRequest("/api/add-ons");
      return res.json();
    },
  });

  useEffect(() => {
    if (addresses && !selectedAddressId) {
      const def = addresses.find(a => a.isDefault) || addresses[0];
      if (def) setSelectedAddressId(def.id);
    }
  }, [addresses, selectedAddressId]);

  useEffect(() => {
    if (paymentMethods && !selectedPaymentMethodId) {
      const def = paymentMethods.find(pm => pm.isDefault) || paymentMethods[0];
      if (def) setSelectedPaymentMethodId(def.id);
    }
  }, [paymentMethods, selectedPaymentMethodId]);

  useEffect(() => {
    if (washParam) {
      if (washParam === "signature") {
        setCustomerNotes("Signature wash — premium detergent, extra care");
      } else if (washParam === "custom") {
        setCustomerNotes("Custom wash preferences applied");
      }
    }
  }, [washParam]);

  const selectedAddr = addresses?.find(a => a.id === selectedAddressId);
  const filteredVendors = (vendors?.filter(v =>
    (certifiedOnly ? v.certified : true) &&
    (vendorSearch ? v.name.toLowerCase().includes(vendorSearch.toLowerCase()) : true)
  ) || []);

  const currentTier = pricingTiers?.find(t => t.name === selectedTier);
  const tierPrice = currentTier?.flatPrice || 0;

  // Calculate add-ons total
  const addOnsTotal = (addOns || []).reduce((sum, addon) => {
    return sum + (selectedAddOns[addon.id] ? addon.price : 0);
  }, 0);

  const deliveryFee = deliverySpeed === "same_day" ? 9.99 : deliverySpeed === "24h" ? 5.99 : 0;
  const subtotal = tierPrice + addOnsTotal;
  const tax = Math.round(subtotal * 0.07 * 100) / 100;
  const total = Math.round((subtotal + tax + deliveryFee) * 100) / 100;

  const estimatedDelivery = deliverySpeed === "same_day" ? "Today by 9 PM" : deliverySpeed === "24h" ? "Tomorrow" : "Within 2 days";

  const addAddressMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/addresses", {
        method: "POST",
        body: JSON.stringify({ userId, ...newAddr, isDefault: 0 }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/addresses?userId=${userId}`] });
      setSelectedAddressId(data.id);
      setAddAddressMode(false);
      setNewAddr({ label: "", street: "", city: "", state: "", zip: "", notes: "" });
      toast({ title: "Address added", description: `${data.label} saved successfully.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const validateOrder = (): FieldError[] => {
    const errors: FieldError[] = [];
    if (!selectedTier) errors.push({ field: "tier", message: "Please select a bag size" });
    if (!selectedAddr) errors.push({ field: "address", message: "Please add a pickup address first" });
    if (tab === "schedule" && !pickupDate) errors.push({ field: "pickupDate", message: "Please select a pickup date" });
    if (tab === "schedule" && pickupDate && pickupDate < getMinDate()) errors.push({ field: "pickupDate", message: "Pickup date must be in the future" });
    return errors;
  };

  const handleConfirmPickup = () => {
    const errors = validateOrder();
    if (errors.length > 0) {
      setFieldErrors(errors);
      scrollToFirstError(errors);
      return;
    }
    setFieldErrors([]);
    createOrderMutation.mutate();
  };

  const createOrderMutation = useMutation({
    mutationFn: async () => {

      const addOnPayload = (addOns || [])
        .filter(a => selectedAddOns[a.id])
        .map(a => ({ addOnId: a.id, quantity: 1 }));

      const res = await apiRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customerId: userId,
          vendorId: selectedVendorId,
          pickupAddressId: selectedAddr?.id,
          pickupAddress: selectedAddr
            ? `${selectedAddr.street}, ${selectedAddr.city}, ${selectedAddr.state} ${selectedAddr.zip}`
            : "",
          deliveryType: "contactless",
          deliverySpeed,
          scheduledPickup: tab === "schedule" && pickupDate
            ? new Date(pickupDate).toISOString()
            : new Date().toISOString(),
          pickupTimeWindow: timeWindow,
          tierName: selectedTier,
          pricingTierId: currentTier?.id,
          selectedAddOns: addOnPayload,
          bags: [],
          preferences: {},
          certifiedOnly: certifiedOnly ? 1 : 0,
          customerNotes,
          addressNotes,
          paymentMethodId: selectedPaymentMethodId,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders?customerId=${userId}`] });
      toast({ title: "Pickup scheduled!", description: `Order ${data.orderNumber} created. We'll be there soon!` });
      navigate(`/orders/${data.id}`);
    },
    onError: (err: Error) => {
      // Show user-friendly error message, not raw API responses
      const msg = err.message?.includes("Missing required")
        ? "Please fill in all required fields before scheduling."
        : err.message?.includes("400")
        ? "Something went wrong. Please check your details and try again."
        : "Unable to schedule pickup. Please try again.";
      toast({ title: "Couldn't schedule", description: msg, variant: "destructive" });
    },
  });

  // Clear tier error when a tier is selected
  const handleTierSelect = (tierName: string) => {
    setSelectedTier(tierName);
    clearError("tier");
  };

  const toggleAddOn = (id: number) => {
    setSelectedAddOns(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button onClick={() => navigate("/")} data-testid="button-back" className="hover:text-primary transition-colors active:scale-95">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold">Schedule Pickup</h1>
      </div>

      {/* Tab Switcher */}
      <div className="px-5 mb-5">
        <div className="flex bg-muted rounded-lg p-1">
          <button
            data-testid="tab-now"
            onClick={() => setTab("now")}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${
              tab === "now"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Pickup Now
          </button>
          <button
            data-testid="tab-schedule"
            onClick={() => setTab("schedule")}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${
              tab === "schedule"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Schedule Later
          </button>
        </div>
      </div>

      {/* Pickup Details */}
      <div className="px-5 mb-5">
        <h3 className="text-sm font-semibold mb-3">Pickup Details</h3>
        <div className="space-y-3">
          <Sheet open={addressSheetOpen} onOpenChange={setAddressSheetOpen}>
            <SheetTrigger asChild>
              <Card className="p-3 flex items-center gap-3 cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.99]" data-testid="button-select-address">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Pickup Address</p>
                  <p className="text-sm font-medium truncate">
                    {selectedAddr ? `${selectedAddr.label} — ${selectedAddr.street}` : "Select address"}
                  </p>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Card>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>{addAddressMode ? "Add New Address" : "Choose Pickup Address"}</SheetTitle>
              </SheetHeader>
              {addAddressMode ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Label</Label>
                    <Input placeholder="e.g., Home, Office, Gym" value={newAddr.label} onChange={e => setNewAddr(p => ({ ...p, label: e.target.value }))} data-testid="input-new-addr-label" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Street</Label>
                    <Input placeholder="123 Main St" value={newAddr.street} onChange={e => setNewAddr(p => ({ ...p, street: e.target.value }))} data-testid="input-new-addr-street" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">City</Label>
                      <Input placeholder="Miami" value={newAddr.city} onChange={e => setNewAddr(p => ({ ...p, city: e.target.value }))} data-testid="input-new-addr-city" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">State</Label>
                      <Input placeholder="FL" value={newAddr.state} onChange={e => setNewAddr(p => ({ ...p, state: e.target.value }))} data-testid="input-new-addr-state" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">ZIP</Label>
                      <Input placeholder="33132" value={newAddr.zip} onChange={e => setNewAddr(p => ({ ...p, zip: e.target.value }))} data-testid="input-new-addr-zip" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setAddAddressMode(false)} data-testid="button-cancel-add-addr">Cancel</Button>
                    <Button className="flex-1" disabled={!newAddr.label || !newAddr.street || !newAddr.city || !newAddr.state || !newAddr.zip || addAddressMutation.isPending} onClick={() => addAddressMutation.mutate()} data-testid="button-save-addr">
                      {addAddressMutation.isPending ? "Saving..." : "Save Address"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {addresses?.map(addr => {
                    const Icon = LABEL_ICONS[addr.label] || MapPinned;
                    return (
                      <button key={addr.id} data-testid={`address-option-${addr.id}`} className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${selectedAddressId === addr.id ? "bg-primary/10 border border-primary/30" : "bg-card border border-border hover:border-primary/20"}`} onClick={() => { setSelectedAddressId(addr.id); setAddressSheetOpen(false); }}>
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-primary" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2"><p className="text-sm font-medium">{addr.label}</p>{addr.isDefault ? <Badge variant="secondary" className="text-[10px]">Default</Badge> : null}</div>
                          <p className="text-xs text-muted-foreground truncate">{addr.street}, {addr.city}, {addr.state} {addr.zip}</p>
                        </div>
                        {selectedAddressId === addr.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                  <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-dashed border-border hover:border-primary/30 text-left transition-all" onClick={() => setAddAddressMode(true)} data-testid="button-add-new-address">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0"><PlusIcon className="w-4 h-4 text-muted-foreground" /></div>
                    <p className="text-sm font-medium text-muted-foreground">Add new address</p>
                  </button>
                </div>
              )}
            </SheetContent>
          </Sheet>

          {tab === "schedule" && (
            <>
              <Card className="p-3 flex items-center gap-3">
                <Calendar className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Pickup Date</p>
                  <Input type="date" min={getMinDate()} value={pickupDate} onChange={e => { setPickupDate(e.target.value); clearError("pickupDate"); }} className="border-0 p-0 h-auto text-sm font-medium bg-transparent" data-testid="input-pickup-date" data-field="pickupDate" />
                  <InlineFieldError field="pickupDate" errors={fieldErrors} />
                </div>
              </Card>
              <Card className="p-3 flex items-center gap-3">
                <Clock className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Preferred Time</p>
                  <Select value={timeWindow} onValueChange={setTimeWindow}>
                    <SelectTrigger className="border-0 p-0 h-auto text-sm font-medium bg-transparent shadow-none" data-testid="select-time"><SelectValue placeholder="Choose a time window" /></SelectTrigger>
                    <SelectContent>{TIME_WINDOWS.map(tw => <SelectItem key={tw} value={tw}>{tw}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </Card>
            </>
          )}

          <Card className="p-3">
            <div className="flex items-center gap-3 mb-2">
              <StickyNote className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">Address Notes</p>
            </div>
            <Textarea placeholder="e.g., Blue house with white fence, ring doorbell" value={addressNotes} onChange={e => setAddressNotes(e.target.value)} className="resize-none border-0 text-sm bg-transparent min-h-[60px]" data-testid="input-address-notes" />
          </Card>
        </div>
      </div>

      {/* Delivery Speed */}
      <div className="px-5 mb-5">
        <h3 className="text-sm font-semibold mb-3">How Fast?</h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "48h", label: "Standard", sub: "48 hours", extra: "Free delivery" },
            { value: "24h", label: "Express", sub: "24 hours", extra: "+$5.99" },
            { value: "same_day", label: "Same Day", sub: "Today", extra: "+$9.99" },
          ].map(s => (
            <button key={s.value} data-testid={`speed-${s.value}`} onClick={() => setDeliverySpeed(s.value)} className={`p-3 rounded-lg text-center transition-all ${deliverySpeed === s.value ? "bg-primary/10 border-2 border-primary" : "bg-card border border-border hover:border-primary/20"}`}>
              <p className="text-xs font-semibold">{s.label}</p>
              <p className="text-[10px] text-muted-foreground">{s.sub}</p>
              <p className="text-[10px] text-primary mt-1">{s.extra}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          Estimated delivery: {estimatedDelivery}
        </p>
      </div>

      {/* Pricing Tier Selection */}
      <div className="px-5 mb-5">
        <h3 className="text-sm font-semibold mb-1">Choose Your Bag Size</h3>
        <p className="text-xs text-muted-foreground mb-3">Flat-rate pricing — know your price before you order</p>
        <InlineFieldError field="tier" errors={fieldErrors} />
        <div className="space-y-3" data-field="tier">
          {(pricingTiers || []).map(tier => {
            const TierIcon = TIER_ICONS[tier.name] || ShoppingBag;
            const isSelected = selectedTier === tier.name;
            return (
              <Card
                key={tier.id}
                data-testid={`tier-${tier.name}`}
                onClick={() => handleTierSelect(tier.name)}
                className={`p-4 cursor-pointer transition-all duration-200 ${
                  isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/20"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? "bg-primary/20" : "bg-muted"}`}>
                    <TierIcon className={`w-6 h-6 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold">{tier.displayName}</p>
                      <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                        Up to {tier.maxWeight} lbs
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{tier.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      ${tier.overageRate.toFixed(2)}/lb overage if over {tier.maxWeight} lbs
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-primary">${tier.flatPrice.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground">flat rate</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Know Your Price Marketing Badge */}
      {selectedTier && currentTier && (
        <div className="px-5 mb-5">
          <div className="flex gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-primary">Know Your Price — No surprises</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Your {currentTier.displayName} is ${currentTier.flatPrice.toFixed(2)} flat for up to {currentTier.maxWeight} lbs.
                If your order exceeds {currentTier.maxWeight} lbs, overage is just ${currentTier.overageRate.toFixed(2)}/lb.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add-Ons */}
      {addOns && addOns.length > 0 && (
        <div className="px-5 mb-5">
          <h3 className="text-sm font-semibold mb-3">Customize Your Wash</h3>
          <div className="space-y-2">
            {addOns.map(addon => (
              <Card
                key={addon.id}
                data-testid={`addon-${addon.name}`}
                onClick={() => toggleAddOn(addon.id)}
                className={`p-3 cursor-pointer transition-all duration-200 ${
                  selectedAddOns[addon.id] ? "border-primary/30 bg-primary/5" : "hover:border-primary/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={!!selectedAddOns[addon.id]}
                    className="shrink-0"
                    onCheckedChange={() => toggleAddOn(addon.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{addon.displayName}</p>
                    <p className="text-xs text-muted-foreground">{addon.description}</p>
                  </div>
                  <span className="text-sm font-semibold text-primary shrink-0">+${addon.price.toFixed(2)}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Customer Notes */}
      <div className="px-5 mb-5">
        <Card className="p-3">
          <div className="flex items-center gap-3 mb-2">
            <StickyNote className="w-4 h-4 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground">Special Requests</p>
          </div>
          <Textarea placeholder="e.g., Please be gentle with the silk blouse!" value={customerNotes} onChange={e => setCustomerNotes(e.target.value)} className="resize-none border-0 text-sm bg-transparent min-h-[60px]" data-testid="input-customer-notes" />
        </Card>
      </div>

      {/* Certified Toggle */}
      <div className="px-5 mb-5">
        <Card className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Offload Certified Only</p>
              <p className="text-xs text-muted-foreground">Verified quality partners</p>
            </div>
          </div>
          <Switch checked={certifiedOnly} onCheckedChange={setCertifiedOnly} data-testid="toggle-certified" />
        </Card>
      </div>

      {/* Vendor Selection */}
      <div className="px-5 mb-5">
        <h3 className="text-sm font-semibold mb-3">Pick a Laundromat</h3>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search vendors..." value={vendorSearch} onChange={e => setVendorSearch(e.target.value)} className="pl-9" data-testid="input-vendor-search" />
        </div>
        <div className="space-y-2">
          {filteredVendors.length === 0 ? (
            <Card className="p-6 text-center"><p className="text-sm text-muted-foreground">No vendors match your search.</p></Card>
          ) : filteredVendors.map(v => (
            <Card key={v.id} data-testid={`vendor-${v.id}`} onClick={() => setSelectedVendorId(v.id)} className={`p-3 cursor-pointer transition-all duration-200 ${selectedVendorId === v.id ? "border-primary bg-primary/5" : "hover:border-primary/20"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{v.name}</p>
                    {v.certified ? <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-400">Certified</Badge> : null}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <StarIcon className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs text-muted-foreground">{v.rating} ({v.reviewCount} reviews)</span>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selectedVendorId === v.id ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                  {selectedVendorId === v.id && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Payment Method */}
      {paymentMethods && paymentMethods.length > 0 && (
        <div className="px-5 mb-5">
          <h3 className="text-sm font-semibold mb-3">Payment Method</h3>
          <div className="space-y-2">
            {paymentMethods.map(pm => (
              <button key={pm.id} data-testid={`payment-method-${pm.id}`} className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${selectedPaymentMethodId === pm.id ? "bg-primary/10 border border-primary/30" : "bg-card border border-border hover:border-primary/20"}`} onClick={() => setSelectedPaymentMethodId(pm.id)}>
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><CreditCard className="w-4 h-4 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{pm.label}</p>
                  {pm.last4 && <p className="text-xs text-muted-foreground">•••• {pm.last4}</p>}
                </div>
                {selectedPaymentMethodId === pm.id && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pricing Summary — "Know Your Price" */}
      <div className="px-5 mb-5">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            Know Your Price
          </h3>
          <div className="space-y-2 text-sm">
            {currentTier && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{currentTier.displayName} (up to {currentTier.maxWeight} lbs)</span>
                <span>${currentTier.flatPrice.toFixed(2)}</span>
              </div>
            )}
            {addOnsTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Add-ons</span>
                <span>${addOnsTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            {deliveryFee > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery Fee</span>
                <span>${deliveryFee.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-border pt-2 flex justify-between font-bold">
              <span>Estimated Total</span>
              <span className="text-primary">${total.toFixed(2)}</span>
            </div>
          </div>
          {currentTier && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Overage (if any) calculated after washing at ${currentTier.overageRate.toFixed(2)}/lb over {currentTier.maxWeight} lbs.
            </p>
          )}
        </Card>
      </div>

      {/* Submit */}
      <div className="px-5 pb-4">
        <Button
          className="w-full h-12 text-base font-semibold transition-all"
          disabled={createOrderMutation.isPending}
          onClick={handleConfirmPickup}
          data-testid="button-confirm-pickup"
        >
          {createOrderMutation.isPending
            ? "Scheduling..."
            : !selectedTier
            ? "Select a bag size to continue"
            : tab === "now"
            ? `Confirm Instant Pickup — $${total.toFixed(2)}`
            : `Confirm Scheduled Pickup — $${total.toFixed(2)}`}
        </Button>
      </div>

      {/* Floating Voice Order Button */}
      <button
        onClick={() => setVoiceOrderOpen(true)}
        data-testid="button-voice-order"
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary/85 transition-all active:scale-95 z-40"
      >
        <Mic className="w-6 h-6" />
      </button>

      <VoiceOrderModal open={voiceOrderOpen} onClose={() => setVoiceOrderOpen(false)} />
    </div>
  );
}
