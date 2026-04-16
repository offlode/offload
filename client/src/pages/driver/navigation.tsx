import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { ArrowLeft, MapPin, Clock, Navigation as NavIcon, ExternalLink } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order } from "@shared/schema";

// Map current status to the address we're navigating to
function getNavigationTarget(order: Order): { address: string; label: string; action?: { status: string; label: string } } {
  const pickup = order.pickupAddress;
  // Use deliveryAddress when available, fall back to pickupAddress
  const delivery = (order.deliveryAddress && order.deliveryAddress.trim()) ? order.deliveryAddress : pickup;

  switch (order.status) {
    case "driver_assigned":
    case "pickup_in_progress":
      return {
        address: pickup,
        label: "Pickup",
        action: { status: "pickup_in_progress", label: "Start Pickup" },
      };
    case "picked_up":
      // Navigating to laundromat — use pickup address as proxy (no separate laundromat address in schema)
      return {
        address: pickup,
        label: "Laundromat",
        action: { status: "at_laundromat", label: "Arrived at Laundromat" },
      };
    case "ready_for_delivery":
    case "out_for_delivery":
      // Navigate to the delivery address (where the clean laundry is being returned)
      return {
        address: delivery,
        label: "Delivery",
        action: { status: "out_for_delivery", label: "Start Delivery" },
      };
    default:
      return { address: pickup, label: "Destination" };
  }
}

export default function DriverNavigation() {
  const [, params] = useRoute("/driver/navigation/:id");
  const orderId = params?.id ? Number(params.id) : 0;
  const { toast } = useToast();

  const { data: order, refetch } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders/${orderId}`);
      return res.json();
    },
    enabled: orderId > 0,
  });

  const advanceMutation = useMutation({
    mutationFn: async (status: string) => {
      await apiRequest(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, actorRole: "driver" }),
      });
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      const labels: Record<string, string> = {
        pickup_in_progress: "Pickup started!",
        at_laundromat: "Arrived at laundromat",
        out_for_delivery: "Delivery started!",
      };
      toast({ title: labels[status] || "Status updated" });
      refetch();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to update status",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const navTarget = order ? getNavigationTarget(order) : null;
  const street = navTarget?.address?.split(",")[0] || "Loading...";
  const fullAddress = navTarget?.address || "";

  // Build Google Maps URL
  const googleMapsUrl = fullAddress
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`
    : "#";

  const scheduledTime = order?.scheduledPickup
    ? new Date(order.scheduledPickup).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  return (
    <div className="min-h-screen bg-card relative overflow-hidden">
      {/* Map Placeholder — full-screen styled gradient with grid pattern */}
      <div className="absolute inset-0">
        {/* Dark map background */}
        <div className="w-full h-full bg-gradient-to-b from-[#010101] via-[#1A1A1A] to-[#010101] relative">
          {/* Grid lines to simulate map streets */}
          <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#5B4BC4" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Simulated roads */}
          <div className="absolute top-0 left-1/3 w-12 h-full bg-[#2E2E2E]/30" />
          <div className="absolute top-0 left-2/3 w-8 h-full bg-[#2E2E2E]/20" />
          <div className="absolute top-1/4 left-0 w-full h-8 bg-[#2E2E2E]/25" />
          <div className="absolute top-1/2 left-0 w-full h-12 bg-[#2E2E2E]/30" />
          <div className="absolute top-3/4 left-0 w-full h-6 bg-[#2E2E2E]/20" />

          {/* Route line */}
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M 120 600 Q 180 450 200 350 Q 220 250 250 200 Q 280 150 300 120"
              fill="none"
              stroke="#5B4BC4"
              strokeWidth="4"
              strokeDasharray="12 6"
              opacity="0.8"
            />
          </svg>

          {/* Driver position dot */}
          <div className="absolute bottom-1/3 left-1/3 -translate-x-1/2 -translate-y-1/2">
            <div className="relative">
              <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg shadow-blue-500/50" />
              <div className="absolute inset-0 w-4 h-4 rounded-full bg-blue-500 animate-ping opacity-30" />
            </div>
          </div>

          {/* Destination pin */}
          <div className="absolute top-1/4 right-1/3 -translate-x-1/2 -translate-y-1/2">
            <div className="relative flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <MapPin className="w-4 h-4 text-white" />
              </div>
              <div className="w-2 h-2 bg-primary/50 rounded-full mt-1" />
            </div>
          </div>
        </div>
      </div>

      {/* Top bar */}
      <div className="relative z-10 px-5 pt-14 flex items-center gap-3">
        <Link href={order ? `/driver/order/${order.id}` : "/driver"}>
          <button
            data-testid="btn-back"
            className="w-9 h-9 rounded-full bg-card/90 backdrop-blur-sm flex items-center justify-center border border-white/10"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
        </Link>
        <div className="flex-1 bg-card/90 backdrop-blur-sm rounded-full px-4 py-2.5 border border-white/5">
          <p className="text-white text-sm font-medium truncate">{street}</p>
        </div>
      </div>

      {/* Bottom Sheet */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        <div className="bg-card rounded-t-3xl border-t border-white/5 px-5 pt-4 pb-8 max-w-lg mx-auto">
          {/* Handle bar */}
          <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-4" />

          {order ? (
            <>
              {/* Order meta */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-400 text-xs font-medium" data-testid="text-order-number">
                  {order.orderNumber}
                </p>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary/20 text-primary">
                  {navTarget?.label?.toUpperCase() || "PICKUP"}
                </span>
              </div>

              {/* Address */}
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <p className="text-white text-sm font-medium" data-testid="text-address">
                  {fullAddress}
                </p>
              </div>

              {/* ETA info */}
              <div className="flex items-center gap-4 mb-5 text-sm text-gray-400">
                {scheduledTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Scheduled: {scheduledTime}
                  </span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {/* Google Maps navigate button */}
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                  data-testid="btn-open-maps"
                >
                  <button className="w-full py-3.5 rounded-full border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/5 transition-colors flex items-center justify-center gap-2">
                    <NavIcon className="w-4 h-4" />
                    Navigate
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </a>

                {/* Status advance button */}
                {navTarget?.action && (
                  <button
                    data-testid="btn-status-action"
                    type="button"
                    onClick={() => advanceMutation.mutate(navTarget.action!.status)}
                    disabled={advanceMutation.isPending}
                    className="flex-1 py-3.5 rounded-full bg-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {advanceMutation.isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ...
                      </span>
                    ) : (
                      navTarget.action.label
                    )}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="py-8 text-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}

          <div className="h-[env(safe-area-inset-bottom)]" />
        </div>
      </div>
    </div>
  );
}
