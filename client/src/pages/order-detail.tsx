import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { getSocket, joinOrderRoom, leaveOrderRoom } from "@/lib/socket";
import {
  ArrowLeft, MessageSquare, MapPin, Clock, CircleDot, AlertCircle,
  ChevronDown, ChevronUp, X, FileWarning,
  HelpCircle, AlertTriangle, Star, CreditCard, Gauge,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
import { useI18n } from "@/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  EVENT_ICONS, EVENT_COLORS, CANCELLABLE,
  formatEventType, formatDate,
} from "@/lib/order-constants";
import { StatusStepper } from "@/components/order/StatusStepper";
import { MessagePanel } from "@/components/order/MessagePanel";
import { WeightBreakdown } from "@/components/order/WeightBreakdown";
import { ReviewDialog } from "@/components/order/ReviewDialog";
import { DisputeDialog } from "@/components/order/DisputeDialog";
import type { Order, OrderEvent, Vendor, Driver, Message, ConsentRecord, Review } from "@shared/schema";

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
  const { t } = useI18n();
  const orderId = params?.id;

  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);
  const [messageSheetOpen, setMessageSheetOpen] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSending, setSupportSending] = useState(false);
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
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
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
      toast({ title: t("order_detail.cancelled_toast"), description: t("order_detail.cancelled_desc") });
    },
    onError: (err: Error) => {
      setCancelDialogOpen(false);
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
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
      toast({ title: t("order_detail.dispute_filed"), description: t("order_detail.dispute_filed_desc") });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
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
      toast({ title: t("order_detail.response_recorded") });
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
      toast({ title: t("order_detail.review_submitted"), description: t("order_detail.review_thanks") });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
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
        <p className="text-lg font-semibold">{t("order_detail.not_found")}</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate("/orders")} data-testid="button-back-orders">
          {t("order_detail.back_to_orders")}
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
          <h1 className="text-lg font-bold">{t("order_detail.title")}</h1>
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
                  <p className="text-sm font-semibold text-amber-300 mb-1">{t("order_detail.approval_needed")}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    {consent.description}
                  </p>
                  {consent.additionalCharge && consent.additionalCharge > 0 && (
                    <p className="text-xs text-amber-400 mb-2 font-medium">
                      {t("order_detail.additional_charge")} ${consent.additionalCharge.toFixed(2)}
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
                      {t("order_detail.approve")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => consentMutation.mutate({ consentId: consent.id, status: "denied" })}
                      disabled={consentMutation.isPending}
                      data-testid={`button-deny-${consent.id}`}
                    >
                      {t("order_detail.deny")}
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
              className="shrink-0 hover:text-emerald-400 transition-colors"
              onClick={() => setMessageSheetOpen(true)}
              data-testid="button-message-support"
              aria-label={t("order_detail.message_support")}
              title={t("order_detail.message_support")}
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
                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-400">{t("order_detail.certified")}</Badge>
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
          <h3 className="text-sm font-semibold mb-3">{t("order_detail.order_summary")}</h3>
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
                <span>{t("order_detail.overage", { weight: String(order.overageWeight) })}</span>
                <span>+${order.overageCharge.toFixed(2)}</span>
              </div>
            )}
            {order.deliveryFee != null && order.deliveryFee > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("order_detail.delivery_fee")}</span>
                <span>${order.deliveryFee.toFixed(2)}</span>
              </div>
            )}
            {order.tax != null && order.tax > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("order_detail.tax")}</span>
                <span>${order.tax.toFixed(2)}</span>
              </div>
            )}
            {order.discount != null && order.discount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>{t("order_detail.discount")}</span>
                <span>-${order.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-border pt-2 flex justify-between font-bold">
              <span>{order.finalPrice != null ? t("order_detail.final_price") : t("order_detail.total")}</span>
              <span className="text-primary" data-testid="text-total">
                ${(order.finalPrice ?? order.total ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
          {order.scheduledPickup && (
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              {t("order_detail.scheduled")} {formatDate(order.scheduledPickup)}
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
              <p className="text-xs text-muted-foreground">{t("order_detail.payment")}</p>
            </div>
            <Badge variant="secondary" className={`text-[10px] ${paymentColor}`}>
              {order.paymentStatus?.replace(/_/g, " ") || t("order_detail.payment_pending")}
            </Badge>
          </Card>
          {/* SLA */}
          {order.slaStatus && (
            <Card className="p-3" data-testid="card-sla-status">
              <div className="flex items-center gap-2 mb-1">
                <Gauge className="w-4 h-4 text-primary" />
                <p className="text-xs text-muted-foreground">{t("order_detail.sla")}</p>
              </div>
              <p className={`text-xs font-semibold ${slaColor}`}>
                {order.slaStatus === "on_track" ? t("order_detail.sla_on_track") : order.slaStatus === "at_risk" ? t("order_detail.sla_at_risk") : t("order_detail.sla_breached")}
              </p>
              {order.slaDeadline && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t("order_detail.sla_due")} {formatDate(order.slaDeadline)}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Weight & Pricing Section */}
      <WeightBreakdown order={order} />

      {/* 13-State FSM Visual Timeline */}
      {order.status !== "cancelled" && (
        <div className="px-5 mb-4">
          <Card className="p-4" data-testid="card-status-stepper">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-primary" />
              {t("order_detail.order_status")}
            </h3>
            <StatusStepper currentStatus={order.status} />
          </Card>
        </div>
      )}

      {/* Order Progress Timeline */}
      <div className="px-5 mb-4">
        <h3 className="text-sm font-semibold mb-3">{t("order_detail.order_progress")}</h3>
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
              <p className="text-sm text-muted-foreground">{t("order_detail.no_events")}</p>
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
                <p className="text-sm font-semibold mb-1">{t("order_detail.how_was_experience")}</p>
                <p className="text-xs text-muted-foreground mb-3">{t("order_detail.review_subtitle")}</p>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setReviewSheetOpen(true)}
                  data-testid="button-leave-review"
                >
                  {t("order_detail.leave_review")}
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
              {t("order_detail.your_review")}
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
            {t("order_detail.cancel_order")}
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
            {t("order_detail.file_dispute")}
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
              <p className="text-sm font-semibold mb-1">{t("order_detail.need_help")}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("order_detail.support_help_text")}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Message Sheet */}
      <MessagePanel
        open={messageSheetOpen}
        onOpenChange={setMessageSheetOpen}
        messages={messagesData}
        messageText={messageText}
        onMessageTextChange={setMessageText}
        onSend={() => sendMessageMutation.mutate()}
        isSending={sendMessageMutation.isPending}
      />

      {/* Review Sheet */}
      <ReviewDialog
        open={reviewSheetOpen}
        onOpenChange={setReviewSheetOpen}
        overallRating={overallRating}
        onOverallRatingChange={setOverallRating}
        vendorRating={vendorRating}
        onVendorRatingChange={setVendorRating}
        driverRating={driverRating}
        onDriverRatingChange={setDriverRating}
        reviewComment={reviewComment}
        onReviewCommentChange={setReviewComment}
        onSubmit={() => reviewMutation.mutate()}
        isPending={reviewMutation.isPending}
        hasVendor={!!order.vendorId}
        hasDriver={!!order.driverId}
      />

      {/* Support Dialog */}
      <Dialog open={supportDialogOpen} onOpenChange={setSupportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("order_detail.contact_support")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("order_detail.support_description")}
            </p>
            <Textarea
              placeholder={t("order_detail.support_placeholder")}
              value={supportMessage}
              onChange={e => setSupportMessage(e.target.value)}
              className="min-h-[100px]"
              data-testid="input-support-message"
            />
          </div>
          <DialogFooter>
            <Button
              disabled={!supportMessage.trim() || supportSending}
              onClick={async () => {
                setSupportSending(true);
                try {
                  await apiRequest("/api/messages", {
                    method: "POST",
                    body: JSON.stringify({ orderId: Number(orderId), content: supportMessage, messageType: "support" }),
                  });
                  queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/messages`] });
                  setSupportDialogOpen(false);
                  setSupportMessage("");
                  toast({ title: t("order_detail.support_sent"), description: t("order_detail.support_sent_desc") });
                } catch (err: any) {
                  toast({ title: t("common.error"), description: err.message || "Failed to send message", variant: "destructive" });
                } finally {
                  setSupportSending(false);
                }
              }}
              data-testid="button-submit-support"
            >
              {supportSending ? t("order_detail.support_sending") : t("order_detail.support_send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("order_detail.cancel_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("order_detail.cancel_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-dismiss">{t("order_detail.cancel_keep")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              data-testid="button-cancel-confirm"
            >
              {cancelMutation.isPending ? t("order_detail.cancelling") : t("order_detail.cancel_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dispute Sheet */}
      <DisputeDialog
        open={disputeSheetOpen}
        onOpenChange={setDisputeSheetOpen}
        reason={disputeReason}
        onReasonChange={setDisputeReason}
        description={disputeDescription}
        onDescriptionChange={setDisputeDescription}
        onSubmit={() => disputeMutation.mutate()}
        isPending={disputeMutation.isPending}
      />
    </div>
  );
}
