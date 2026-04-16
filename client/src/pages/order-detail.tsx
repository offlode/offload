import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { getSocket, joinOrderRoom, leaveOrderRoom } from "@/lib/socket";
import {
  ArrowLeft, Phone, MessageSquare, MapPin, Package, Check,
  Truck, Clock, Droplets, PackageCheck, CircleDot, AlertCircle,
  ChevronDown, ChevronUp, Send, X, Shield, FileWarning,
  HelpCircle, AlertTriangle, Star, Weight, CreditCard, Gauge,
  Scale, DollarSign, Info
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Order, OrderEvent, Vendor, Driver, Message, ConsentRecord, Review, OrderAddOn } from "@shared/schema";

const EVENT_ICONS: Record<string, typeof Check> = {
  order_placed: Check,
  order_confirmed: Check,
  driver_assigned: Truck,
  pickup_started: Truck,
  pickup_confirmed: Package,
  arrived_laundromat: MapPin,
  intake_completed: Package,
  wash_started: Droplets,
  wash_completed: Droplets,
  packing_completed: PackageCheck,
  price_confirmed: Check,
  ready_for_delivery: PackageCheck,
  out_for_delivery: Truck,
  delivered: Check,
  cancelled: X,
  disputed: AlertCircle,
};

const EVENT_COLORS: Record<string, string> = {
  order_placed: "bg-primary/20 text-primary",
  order_confirmed: "bg-emerald-500/20 text-emerald-400",
  driver_assigned: "bg-blue-500/20 text-blue-400",
  pickup_started: "bg-blue-500/20 text-blue-400",
  pickup_confirmed: "bg-cyan-500/20 text-cyan-400",
  arrived_laundromat: "bg-primary/20 text-primary",
  intake_completed: "bg-primary/20 text-primary",
  wash_started: "bg-sky-500/20 text-sky-400",
  wash_completed: "bg-sky-500/20 text-sky-400",
  packing_completed: "bg-primary/20 text-primary",
  price_confirmed: "bg-emerald-500/20 text-emerald-400",
  ready_for_delivery: "bg-primary/20 text-primary",
  out_for_delivery: "bg-blue-500/20 text-blue-400",
  delivered: "bg-emerald-500/20 text-emerald-400",
  cancelled: "bg-red-500/20 text-red-400",
  disputed: "bg-orange-500/20 text-orange-400",
};

const CANCELLABLE = ["pending", "confirmed", "driver_assigned", "pickup_in_progress"];

function formatEventType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });
  } catch { return iso; }
}

function StarRating({ value, onChange, max = 5 }: { value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i + 1)}
          className="transition-transform active:scale-90"
          data-testid={`star-${i + 1}`}
        >
          <Star
            className={`w-7 h-7 ${i < value ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
          />
        </button>
      ))}
    </div>
  );
}

// ── 16-State FSM Timeline Steps ──
const FSM_TIMELINE = [
  { key: "pending", label: "Pending", icon: Clock },
  { key: "scheduled", label: "Scheduled", icon: Check },
  { key: "driver_assigned", label: "Driver Assigned", icon: Truck },
  { key: "driver_en_route_pickup", label: "Driver En Route", icon: Truck },
  { key: "arrived_pickup", label: "Arrived", icon: MapPin },
  { key: "picked_up", label: "Picked Up", icon: Package },
  { key: "driver_en_route_facility", label: "To Facility", icon: Truck },
  { key: "at_facility", label: "At Facility", icon: MapPin },
  { key: "processing", label: "Processing", icon: CircleDot },
  { key: "washing", label: "Washing", icon: Droplets },
  { key: "drying", label: "Drying", icon: Droplets },
  { key: "folding", label: "Folding", icon: PackageCheck },
  { key: "ready_for_delivery", label: "Ready", icon: PackageCheck },
  { key: "driver_en_route_delivery", label: "Out for Delivery", icon: Truck },
  { key: "arrived_delivery", label: "Driver Arrived", icon: MapPin },
  { key: "delivered", label: "Delivered", icon: Check },
  { key: "completed", label: "Completed", icon: Check },
];

// Map legacy statuses to FSM equivalents for display
const LEGACY_MAP: Record<string, string> = {
  confirmed: "scheduled",
  pickup_in_progress: "driver_en_route_pickup",
  at_laundromat: "at_facility",
  wash_complete: "drying",
  quality_check: "folding",
  packing: "folding",
  out_for_delivery: "driver_en_route_delivery",
};

function StatusStepper({ currentStatus }: { currentStatus: string }) {
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

type EnrichedOrder = Order & {
  events?: OrderEvent[];
  vendor?: Vendor;
  driver?: Driver;
  consents?: ConsentRecord[];
  review?: Review | null;
};

export default function OrderDetailPage() {
  const [, params] = useRoute("/orders/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const orderId = params?.id;

  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);
  const [messageSheetOpen, setMessageSheetOpen] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const [supportMessage, setSupportMessage] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [disputeSheetOpen, setDisputeSheetOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDescription, setDisputeDescription] = useState("");

  // Review form state
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [overallRating, setOverallRating] = useState(5);
  const [vendorRating, setVendorRating] = useState(5);
  const [driverRating, setDriverRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  const userId = user?.id;

  // Socket.io real-time updates
  useEffect(() => {
    if (!user || !orderId) return;

    const socket = getSocket(user.id, user.role);
    joinOrderRoom(Number(orderId));

    const handleStatusChange = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "events"] });
    };

    const handleNewMessage = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "messages"] });
    };

    socket.on("order_status_changed", handleStatusChange);
    socket.on("new_message", handleNewMessage);

    return () => {
      socket.off("order_status_changed", handleStatusChange);
      socket.off("new_message", handleNewMessage);
      leaveOrderRoom(Number(orderId));
    };
  }, [user, orderId]);

  // Fetch enriched order (includes events, vendor, driver, consents, review)
  const { data: order, isLoading } = useQuery<EnrichedOrder>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders/${orderId}`);
      return res.json();
    },
    enabled: !!orderId,
  });

  // Separate events query (fallback if not included in enriched response)
  const { data: eventsData } = useQuery<OrderEvent[]>({
    queryKey: ["/api/orders", orderId, "events"],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders/${orderId}/events`);
      return res.json();
    },
    enabled: !!orderId && !order?.events,
  });

  // Separate consents query (fallback if not included in enriched response)
  const { data: consentsData } = useQuery<ConsentRecord[]>({
    queryKey: ["/api/orders", orderId, "consents"],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders/${orderId}/consents`);
      return res.json();
    },
    enabled: !!orderId && !order?.consents,
  });

  const { data: messagesData } = useQuery<Message[]>({
    queryKey: ["/api/orders", orderId, "messages"],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders/${orderId}/messages`);
      return res.json();
    },
    enabled: !!orderId && messageSheetOpen,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/orders/${orderId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          senderId: userId,
          senderRole: "customer",
          content: messageText.trim(),
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "messages"] });
      setMessageText("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "Cancelled by customer" }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "events"] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders?customerId=${userId}`] });
      setCancelDialogOpen(false);
      toast({ title: "Order cancelled", description: "Your order has been cancelled successfully." });
    },
    onError: (err: Error) => {
      setCancelDialogOpen(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const disputeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/disputes", {
        method: "POST",
        body: JSON.stringify({
          orderId: Number(orderId),
          customerId: userId,
          reason: disputeReason,
          description: disputeDescription,
          status: "open",
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      setDisputeSheetOpen(false);
      setDisputeReason("");
      setDisputeDescription("");
      toast({ title: "Dispute filed", description: "Our team will review your case within 24 hours." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const consentMutation = useMutation({
    mutationFn: async ({ consentId, status }: { consentId: number; status: string }) => {
      const res = await apiRequest(`/api/consents/${consentId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "consents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      toast({ title: "Response recorded" });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/orders/${orderId}/review`, {
        method: "POST",
        body: JSON.stringify({
          customerId: userId,
          vendorId: order?.vendorId,
          driverId: order?.driverId,
          overallRating,
          vendorRating,
          driverRating,
          comment: reviewComment.trim() || null,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      setReviewSheetOpen(false);
      toast({ title: "Review submitted!", description: "Thank you for your feedback." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto p-5 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-lg mx-auto p-5 text-center pt-20">
        <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-semibold">Order not found</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate("/orders")} data-testid="button-back-orders">
          Back to Orders
        </Button>
      </div>
    );
  }

  // Use embedded data if available, otherwise fall back to separate queries
  const events = order.events || eventsData || [];
  const consents = order.consents || consentsData || [];
  const vendor = order.vendor;
  const driver = order.driver;
  const existingReview = order.review;

  const bags = (() => { try { return JSON.parse(order.bags || "[]"); } catch { return []; } })();
  const isActive = !["delivered", "cancelled", "disputed"].includes(order.status);
  const isCancellable = CANCELLABLE.includes(order.status);
  const isDelivered = order.status === "delivered";
  const pendingConsents = consents.filter(c => c.status === "pending");

  const slaColor = order.slaStatus === "breached"
    ? "text-red-400"
    : order.slaStatus === "at_risk"
    ? "text-amber-400"
    : "text-emerald-400";

  const paymentColor = order.paymentStatus === "captured"
    ? "bg-emerald-500/15 text-emerald-400"
    : order.paymentStatus === "failed"
    ? "bg-red-500/15 text-red-400"
    : order.paymentStatus === "refunded"
    ? "bg-blue-500/15 text-blue-400"
    : "bg-amber-500/15 text-amber-400";

  return (
    <div className="pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button onClick={() => navigate("/orders")} data-testid="button-back" className="hover:text-primary transition-colors active:scale-95">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Order Details</h1>
          <p className="text-xs text-muted-foreground">{order.orderNumber}</p>
        </div>
        <Badge
          variant="secondary"
          className={`${
            order.status === "delivered" ? "bg-emerald-500/15 text-emerald-400" :
            order.status === "cancelled" ? "bg-red-500/15 text-red-400" :
            "bg-blue-500/15 text-blue-400"
          }`}
          data-testid="badge-status"
        >
          {formatEventType(order.status)}
        </Badge>
      </div>

      {/* Consent Requests */}
      {pendingConsents.length > 0 && (
        <div className="px-5 my-4 space-y-2">
          {pendingConsents.map(consent => (
            <Card key={consent.id} className="p-4 border-amber-500/30 bg-amber-500/5" data-testid={`consent-${consent.id}`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-300 mb-1">Approval Needed</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    {consent.description}
                  </p>
                  {consent.additionalCharge && consent.additionalCharge > 0 && (
                    <p className="text-xs text-amber-400 mb-2 font-medium">
                      Additional charge: ${consent.additionalCharge.toFixed(2)}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => consentMutation.mutate({ consentId: consent.id, status: "approved" })}
                      disabled={consentMutation.isPending}
                      data-testid={`button-approve-${consent.id}`}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => consentMutation.mutate({ consentId: consent.id, status: "denied" })}
                      disabled={consentMutation.isPending}
                      data-testid={`button-deny-${consent.id}`}
                    >
                      Deny
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Driver/Contact bar */}
      {driver && (
        <div className="px-5 my-4">
          <Card className="p-4 flex items-center gap-3" data-testid="card-driver">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-sm font-bold text-primary">
              {driver.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{driver.name}</p>
              <p className="text-xs text-muted-foreground">{driver.vehicleType} — {driver.licensePlate}</p>
            </div>
            <Button
              variant="secondary"
              size="icon"
              className="shrink-0 hover:text-cyan-400 transition-colors"
              onClick={() => toast({ title: `Calling ${driver.name}...`, description: "Connecting you now." })}
              data-testid="button-call-driver"
            >
              <Phone className="w-4 h-4 text-cyan-400" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="shrink-0 hover:text-emerald-400 transition-colors"
              onClick={() => setMessageSheetOpen(true)}
              data-testid="button-message-driver"
            >
              <MessageSquare className="w-4 h-4 text-emerald-400" />
            </Button>
          </Card>
        </div>
      )}

      {/* Vendor Info */}
      {vendor && (
        <div className="px-5 mb-4">
          <Card className="p-4" data-testid="card-vendor">
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{vendor.name}</p>
                  {vendor.certified ? (
                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-400">Certified</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{vendor.address}, {vendor.city}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Order Summary */}
      <div className="px-5 mb-4">
        <Card className="p-4" data-testid="card-order-summary">
          <h3 className="text-sm font-semibold mb-3">Order Summary</h3>
          <div className="space-y-2 text-sm">
            {order.tierName ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {order.tierName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} (up to {order.tierMaxWeight} lbs)
                </span>
                <span>${(order.tierFlatPrice || 0).toFixed(2)}</span>
              </div>
            ) : (
              bags.map((b: any, i: number) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {b.quantity}x {b.type.charAt(0).toUpperCase() + b.type.slice(1)} Bag
                  </span>
                  <span>${((b.price || 0) * (b.quantity || 1)).toFixed(2)}</span>
                </div>
              ))
            )}
            {order.overageCharge != null && order.overageCharge > 0 && (
              <div className="flex justify-between text-amber-400">
                <span>Overage ({order.overageWeight} lbs x $2.50)</span>
                <span>+${order.overageCharge.toFixed(2)}</span>
              </div>
            )}
            {order.deliveryFee != null && order.deliveryFee > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery Fee</span>
                <span>${order.deliveryFee.toFixed(2)}</span>
              </div>
            )}
            {order.tax != null && order.tax > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>${order.tax.toFixed(2)}</span>
              </div>
            )}
            {order.discount != null && order.discount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Discount</span>
                <span>-${order.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-border pt-2 flex justify-between font-bold">
              <span>{order.finalPrice != null ? "Final Price" : "Total"}</span>
              <span className="text-primary" data-testid="text-total">
                ${(order.finalPrice ?? order.total ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
          {order.scheduledPickup && (
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              Scheduled: {formatDate(order.scheduledPickup)}
            </div>
          )}
          {order.pickupAddress && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              {order.pickupAddress}
            </div>
          )}
        </Card>
      </div>

      {/* Payment & SLA Status */}
      <div className="px-5 mb-4">
        <div className="grid grid-cols-2 gap-3">
          {/* Payment */}
          <Card className="p-3" data-testid="card-payment-status">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-primary" />
              <p className="text-xs text-muted-foreground">Payment</p>
            </div>
            <Badge variant="secondary" className={`text-[10px] ${paymentColor}`}>
              {order.paymentStatus?.replace(/_/g, " ") || "Pending"}
            </Badge>
          </Card>
          {/* SLA */}
          {order.slaStatus && (
            <Card className="p-3" data-testid="card-sla-status">
              <div className="flex items-center gap-2 mb-1">
                <Gauge className="w-4 h-4 text-primary" />
                <p className="text-xs text-muted-foreground">SLA</p>
              </div>
              <p className={`text-xs font-semibold ${slaColor}`}>
                {order.slaStatus === "on_track" ? "On Track" : order.slaStatus === "at_risk" ? "At Risk" : "Breached"}
              </p>
              {order.slaDeadline && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Due: {formatDate(order.slaDeadline)}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Weight & Pricing Section */}
      {(order.dirtyWeight || order.cleanWeight || order.intakeWeight || order.outputWeight) && (
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

            {order.weightDiscrepancy === 1 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                Weight discrepancy detected
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 16-State Visual Status Stepper */}
      {order.status !== "cancelled" && (
        <div className="px-5 mb-4">
          <Card className="p-4" data-testid="card-status-stepper">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-primary" />
              Order Status
            </h3>
            <StatusStepper currentStatus={order.status} />
          </Card>
        </div>
      )}

      {/* Order Progress Timeline */}
      <div className="px-5 mb-4">
        <h3 className="text-sm font-semibold mb-3">Order Progress</h3>
        <div className="relative">
          {events.length > 0 ? (
            <div className="space-y-0">
              {events.map((event, idx) => {
                const Icon = EVENT_ICONS[event.eventType] || CircleDot;
                const colorClass = EVENT_COLORS[event.eventType] || "bg-muted text-muted-foreground";
                const isLast = idx === events.length - 1;
                const isExpanded = expandedEvent === event.id;
                let details: any = null;
                try { details = event.details ? JSON.parse(event.details) : null; } catch {}

                return (
                  <div key={event.id} className="flex gap-3" data-testid={`event-${event.id}`}>
                    {/* Timeline line + dot */}
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${colorClass} ${isLast ? "ring-2 ring-primary/20" : ""}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      {!isLast && (
                        <div className="w-0.5 flex-1 min-h-[24px] bg-gradient-to-b from-border to-border/30" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="pb-4 flex-1 min-w-0">
                      <button
                        className="text-left w-full"
                        onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                        data-testid={`button-expand-event-${event.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={`text-sm font-semibold ${isLast ? "text-foreground" : "text-muted-foreground"}`}>
                              {formatEventType(event.eventType)}
                            </p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {event.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-muted-foreground">
                              {formatDate(event.timestamp)}
                            </span>
                            {details && (
                              isExpanded
                                ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
                                : <ChevronDown className="w-3 h-3 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </button>

                      {isExpanded && details && (
                        <div className="mt-2 bg-muted/50 rounded-lg p-3 text-xs space-y-1">
                          {Object.entries(details).map(([key, val]) => (
                            <div key={key} className="flex gap-2">
                              <span className="text-muted-foreground capitalize">
                                {key.replace(/([A-Z])/g, " $1").trim()}:
                              </span>
                              <span className="font-medium">{String(val)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Card className="p-6 text-center">
              <Clock className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No events yet</p>
            </Card>
          )}
        </div>
      </div>

      {/* Review Section — only for delivered orders without a review */}
      {isDelivered && !existingReview && (
        <div className="px-5 mb-4">
          <Card className="p-4 border-primary/20 bg-primary/5" data-testid="card-review-prompt">
            <div className="flex items-start gap-3">
              <Star className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold mb-1">How was your experience?</p>
                <p className="text-xs text-muted-foreground mb-3">Rate your laundry service to help us improve.</p>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setReviewSheetOpen(true)}
                  data-testid="button-leave-review"
                >
                  Leave a Review
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Existing review */}
      {isDelivered && existingReview && (
        <div className="px-5 mb-4">
          <Card className="p-4" data-testid="card-existing-review">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400" />
              Your Review
            </h3>
            <div className="flex items-center gap-1 mb-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`w-4 h-4 ${i < (existingReview.overallRating || 0) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
              ))}
              <span className="text-xs text-muted-foreground ml-1">{existingReview.overallRating}/5</span>
            </div>
            {existingReview.comment && (
              <p className="text-xs text-muted-foreground italic">"{existingReview.comment}"</p>
            )}
          </Card>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-5 mb-4 space-y-2">
        {isCancellable && (
          <Button
            variant="secondary"
            className="w-full text-red-400 hover:text-red-300 gap-2"
            onClick={() => setCancelDialogOpen(true)}
            data-testid="button-cancel-order"
          >
            <X className="w-4 h-4" />
            Cancel Order
          </Button>
        )}
        {isDelivered && (
          <Button
            variant="secondary"
            className="w-full text-amber-400 hover:text-amber-300 gap-2"
            onClick={() => setDisputeSheetOpen(true)}
            data-testid="button-file-dispute"
          >
            <FileWarning className="w-4 h-4" />
            File a Dispute
          </Button>
        )}
      </div>

      {/* Help Card */}
      <div className="px-5 mb-4">
        <Card
          className="p-4 cursor-pointer transition-all duration-200 hover:border-primary/30"
          onClick={() => setSupportDialogOpen(true)}
          data-testid="button-contact-support"
        >
          <div className="flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold mb-1">Need Help?</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Our support team is here for you — tap to reach out.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Message Sheet */}
      <Sheet open={messageSheetOpen} onOpenChange={setMessageSheetOpen}>
        <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Messages {driver ? `with ${driver.name}` : ""}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex-1 overflow-y-auto max-h-[40vh] space-y-3 mb-4">
            {messagesData && messagesData.length > 0 ? (
              messagesData.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.senderRole === "customer" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 ${
                    msg.senderRole === "customer"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}>
                    <p className="text-sm">{msg.content}</p>
                    <p className="text-[10px] opacity-60 mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No messages yet</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Textarea
              placeholder="Type a message..."
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              className="resize-none min-h-[40px] max-h-[80px]"
              data-testid="input-message"
            />
            <Button
              size="icon"
              disabled={!messageText.trim() || sendMessageMutation.isPending}
              onClick={() => sendMessageMutation.mutate()}
              data-testid="button-send-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Review Sheet */}
      <Sheet open={reviewSheetOpen} onOpenChange={setReviewSheetOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Leave a Review</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-5">
            <div>
              <Label className="text-sm font-semibold mb-2 block">Overall Experience</Label>
              <StarRating value={overallRating} onChange={setOverallRating} />
            </div>
            {order.vendorId && (
              <div>
                <Label className="text-sm font-semibold mb-2 block">Laundromat Quality</Label>
                <StarRating value={vendorRating} onChange={setVendorRating} />
              </div>
            )}
            {order.driverId && (
              <div>
                <Label className="text-sm font-semibold mb-2 block">Driver Service</Label>
                <StarRating value={driverRating} onChange={setDriverRating} />
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Comments (optional)</Label>
              <Textarea
                placeholder="Tell us about your experience..."
                value={reviewComment}
                onChange={e => setReviewComment(e.target.value)}
                className="min-h-[80px]"
                data-testid="input-review-comment"
              />
            </div>
            <Button
              className="w-full"
              disabled={overallRating === 0 || reviewMutation.isPending}
              onClick={() => reviewMutation.mutate()}
              data-testid="button-submit-review"
            >
              {reviewMutation.isPending ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Support Dialog */}
      <Dialog open={supportDialogOpen} onOpenChange={setSupportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact Support</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tell us what's going on and we'll get back to you as soon as possible.
            </p>
            <Textarea
              placeholder="Describe your issue..."
              value={supportMessage}
              onChange={e => setSupportMessage(e.target.value)}
              className="min-h-[100px]"
              data-testid="input-support-message"
            />
          </div>
          <DialogFooter>
            <Button
              disabled={!supportMessage.trim()}
              onClick={() => {
                setSupportDialogOpen(false);
                setSupportMessage("");
                toast({ title: "Message sent", description: "Our support team will respond shortly." });
              }}
              data-testid="button-submit-support"
            >
              Send Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel your laundry pickup. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-dismiss">Keep Order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              data-testid="button-cancel-confirm"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Yes, Cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dispute Sheet */}
      <Sheet open={disputeSheetOpen} onOpenChange={setDisputeSheetOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>File a Dispute</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              We're sorry something went wrong. Please let us know what happened.
            </p>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Reason</Label>
              <Select value={disputeReason} onValueChange={setDisputeReason}>
                <SelectTrigger data-testid="select-dispute-reason">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="damaged_items">Damaged Items</SelectItem>
                  <SelectItem value="missing_items">Missing Items</SelectItem>
                  <SelectItem value="wrong_items">Wrong Items</SelectItem>
                  <SelectItem value="quality_issue">Quality Issue</SelectItem>
                  <SelectItem value="overcharged">Overcharged</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Description</Label>
              <Textarea
                placeholder="Describe the issue in detail..."
                value={disputeDescription}
                onChange={e => setDisputeDescription(e.target.value)}
                className="min-h-[100px]"
                data-testid="input-dispute-description"
              />
            </div>
            <Button
              className="w-full"
              disabled={!disputeReason || !disputeDescription.trim() || disputeMutation.isPending}
              onClick={() => disputeMutation.mutate()}
              data-testid="button-submit-dispute"
            >
              {disputeMutation.isPending ? "Submitting..." : "Submit Dispute"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
