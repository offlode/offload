import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Clock, MessageSquare, ClipboardList, Package, Send, X,
  Filter, RefreshCw, ArrowDownCircle
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Order, Vendor, Message } from "@shared/schema";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  confirmed: "bg-blue-500/15 text-blue-400",
  driver_assigned: "bg-blue-500/15 text-blue-400",
  pickup_in_progress: "bg-blue-500/15 text-blue-400",
  picked_up: "bg-cyan-500/15 text-cyan-400",
  at_laundromat: "bg-primary/15 text-primary",
  washing: "bg-primary/15 text-primary",
  wash_complete: "bg-primary/15 text-primary",
  packing: "bg-primary/15 text-primary",
  ready_for_delivery: "bg-sky-500/15 text-sky-400",
  out_for_delivery: "bg-blue-500/15 text-blue-400",
  delivered: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-red-500/15 text-red-400",
  disputed: "bg-orange-500/15 text-orange-400",
};

const CANCELLABLE = ["pending", "confirmed", "driver_assigned"];

const STATUS_PROGRESS: Record<string, number> = {
  pending: 5,
  confirmed: 10,
  driver_assigned: 15,
  pickup_in_progress: 25,
  picked_up: 35,
  at_laundromat: 45,
  washing: 55,
  wash_complete: 65,
  packing: 75,
  ready_for_delivery: 80,
  out_for_delivery: 90,
  delivered: 100,
  cancelled: 0,
  disputed: 100,
};

const FRIENDLY_STATUS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  driver_assigned: "Driver assigned",
  driver_en_route_pickup: "Driver picking up",
  pickup_in_progress: "Picking up",
  picked_up: "Picked up",
  at_laundromat: "At laundromat",
  washing: "Being washed",
  wash_complete: "Wash complete",
  packing: "Packing",
  ready_for_delivery: "Ready for delivery",
  out_for_delivery: "Out for delivery",
  driver_en_route_delivery: "Driver delivering",
  delivered: "Delivered",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

function formatStatus(s: string) {
  return FRIENDLY_STATUS[s] || s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

type FilterTab = "all" | "active" | "completed" | "cancelled";

export default function OrdersPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [messageSheet, setMessageSheet] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);

  const userId = user?.id;

  const { data: orders, isLoading, refetch, isRefetching } = useQuery<Order[]>({
    queryKey: [`/api/orders?customerId=${userId}`],
    enabled: !!userId,
  });

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const { data: messagesData } = useQuery<Message[]>({
    queryKey: ["/api/orders", messageSheet, "messages"],
    queryFn: async () => {
      if (!messageSheet) return [];
      const res = await apiRequest(`/api/orders/${messageSheet}/messages`);
      return res.json();
    },
    enabled: !!messageSheet,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!messageSheet || !messageText.trim()) return;
      const res = await apiRequest(`/api/orders/${messageSheet}/messages`, {
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
      queryClient.invalidateQueries({ queryKey: ["/api/orders", messageSheet, "messages"] });
      setMessageText("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const res = await apiRequest(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        body: JSON.stringify({
          reason: "Cancelled by customer",
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders?customerId=${userId}`] });
      setCancelOrderId(null);
      toast({ title: "Order cancelled", description: "Your order has been cancelled." });
    },
    onError: (err: Error) => {
      setCancelOrderId(null);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const vendorMap = new Map(vendors?.map(v => [v.id, v]) || []);

  const filtered = orders?.filter(o => {
    if (filter === "active") return !["delivered", "cancelled", "disputed"].includes(o.status);
    if (filter === "completed") return o.status === "delivered";
    if (filter === "cancelled") return o.status === "cancelled";
    return true;
  }) || [];

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Done" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="pb-24 max-w-lg mx-auto">
      <div className="px-5 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" data-testid="text-orders-title">My Orders</h1>
            <p className="text-sm text-muted-foreground mt-1">Track and manage your laundry</p>
          </div>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => refetch()}
            disabled={isRefetching}
            data-testid="button-refresh"
            className="transition-all active:scale-90"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-5 mb-4">
        <div className="flex bg-muted rounded-lg p-1 gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              data-testid={`filter-${t.key}`}
              onClick={() => setFilter(t.key)}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
                filter === t.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pull-to-refresh hint */}
      {isRefetching && (
        <div className="flex items-center justify-center gap-2 pb-3 text-xs text-muted-foreground">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Refreshing...
        </div>
      )}

      <div className="px-5 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))
        ) : filtered.length > 0 ? (
          filtered.map(order => {
            const vendor = order.vendorId ? vendorMap.get(order.vendorId) : null;
            const bags = (() => { try { return JSON.parse(order.bags || "[]"); } catch { return []; } })();
            const isActive = !["delivered", "cancelled", "disputed"].includes(order.status);
            const isCancellable = CANCELLABLE.includes(order.status);
            const progress = STATUS_PROGRESS[order.status] || 0;

            return (
              <div key={order.id}>
                <Link href={`/orders/${order.id}`}>
                  <Card
                    className="p-4 cursor-pointer transition-all duration-200 hover:border-primary/30 hover:shadow-[0_0_20px_rgba(123,92,246,0.08)] active:scale-[0.99]"
                    data-testid={`card-order-${order.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 relative">
                        <Package className="w-5 h-5 text-primary" />
                        {isActive && (
                          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div>
                            <p className="text-sm font-semibold">
                              {vendor?.name || order.orderNumber}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {bags.map((b: any) => `${b.quantity}x ${b.type}`).join(", ")}
                            </p>
                          </div>
                          <p className="text-sm font-bold shrink-0">${order.total?.toFixed(2)}</p>
                        </div>

                        <div className="flex items-center gap-2 mb-2">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${STATUS_STYLES[order.status] || "bg-muted"}`}
                          >
                            {formatStatus(order.status)}
                          </Badge>
                        </div>

                        {/* Mini progress bar for active */}
                        {isActive && (
                          <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>

                {/* Action buttons below card */}
                {(isActive || isCancellable) && (
                  <div className="flex items-center gap-2 mt-2 ml-14">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMessageSheet(order.id);
                      }}
                      data-testid={`button-message-${order.id}`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Message
                    </Button>
                    {isCancellable && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs gap-1.5 text-red-400 hover:text-red-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCancelOrderId(order.id);
                        }}
                        data-testid={`button-cancel-${order.id}`}
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="w-8 h-8 text-primary/60" />
            </div>
            <p className="text-base font-semibold mb-1">
              {filter === "all" ? "No orders yet" : `No ${filter} orders`}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {filter === "all"
                ? "Schedule your first pickup and we'll take it from here."
                : "Nothing to show for this filter."}
            </p>
            {filter === "all" && (
              <Link href="/schedule">
                <Button data-testid="button-schedule-first">Schedule Pickup</Button>
              </Link>
            )}
          </Card>
        )}
      </div>

      {/* Message Sheet */}
      <Sheet open={!!messageSheet} onOpenChange={() => setMessageSheet(null)}>
        <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Messages</SheetTitle>
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
                <p className="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
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

      {/* Cancel Confirmation */}
      <AlertDialog open={!!cancelOrderId} onOpenChange={() => setCancelOrderId(null)}>
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
              onClick={() => cancelOrderId && cancelMutation.mutate(cancelOrderId)}
              disabled={cancelMutation.isPending}
              data-testid="button-cancel-confirm"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Yes, Cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
