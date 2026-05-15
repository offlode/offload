import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  MapPin, ArrowRight, Star, Shield, Sparkles, Settings2,
  ClipboardList, ChevronRight, Truck, Clock, Shirt, Package, Mic,
  RotateCcw, Zap
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { VoiceOrderModal } from "@/components/voice-order";
import { friendlyStatus } from "@/lib/order-status";
import type { Order, Vendor, Address, PaymentMethod } from "@shared/schema";

// Landing view for logged-out users
function LandingView() {
  const [, navigate] = useLocation();
  return (
    <div className="pb-28 max-w-lg mx-auto">
      {/* Hero Section */}
      <div className="px-5 pt-12 pb-8 text-center">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <Shirt className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-3" data-testid="text-landing-title">
          Fresh clothes,<br />zero hassle.
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
          We pick up, wash with care, and deliver back — fresh and folded. No trips to the laundromat.
        </p>
      </div>

      {/* CTA Buttons */}
      <div className="px-5 mb-8 space-y-3">
        <Button
          className="w-full h-12 text-base font-semibold rounded-full"
          onClick={() => navigate("/login")}
          data-testid="button-login"
        >
          Log In
        </Button>
        <Button
          variant="secondary"
          className="w-full h-12 text-base font-semibold rounded-full"
          onClick={() => navigate("/role-select")}
          data-testid="button-signup"
        >
          Create Account
        </Button>
      </div>

      {/* Features */}
      <div className="px-5">
        <div className="grid grid-cols-1 gap-3">
          {[
            { icon: <Truck className="w-5 h-5 text-primary" />, title: "Free Pickup & Delivery", desc: "We come to you — same day, 24h, or scheduled." },
            { icon: <Shield className="w-5 h-5 text-emerald-400" />, title: "Offload Certified", desc: "All vendors are verified for quality and reliability." },
            { icon: <Star className="w-5 h-5 text-amber-400" />, title: "Top-Rated Service", desc: "Our vendors are vetted and rated by real customers." },
          ].map((f, i) => (
            <Card key={i} className="p-4 flex items-start gap-3 rounded-2xl" data-testid={`feature-card-${i}`}>
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                {f.icon}
              </div>
              <div>
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// Nearby vendor skeleton card
function VendorSkeleton() {
  return (
    <Card className="p-4 min-w-[200px] max-w-[220px] shrink-0 snap-start rounded-2xl">
      <Skeleton className="w-10 h-10 rounded-full mb-3" />
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-3 w-full mb-1" />
      <Skeleton className="h-3 w-2/3" />
    </Card>
  );
}

// Bag size pricing for quick-order tiles
const QUICK_ORDER_PRICES: Record<string, string> = {
  small: "$24.99",
  medium: "$44.99",
  large: "$59.99",
  xl: "$89.99",
};

export default function HomePage() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [voiceOrderOpen, setVoiceOrderOpen] = useState(false);

  const { data: addressList } = useQuery<Address[]>({
    queryKey: [`/api/addresses?userId=${user?.id}`],
    enabled: !!user,
  });

  const { data: vendors, isLoading: vendorsLoading, isError: vendorsError, refetch: refetchVendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    enabled: !!user,
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: [`/api/orders?customerId=${user?.id}`],
    enabled: !!user,
  });

  const { data: paymentMethods } = useQuery<PaymentMethod[]>({
    queryKey: [`/api/payment-methods?userId=${user?.id}`],
    enabled: !!user,
  });

  // If not logged in, show landing page
  if (!isAuthenticated) {
    return <LandingView />;
  }

  const defaultAddr = addressList?.find(a => a.isDefault) || addressList?.[0];
  const activeOrders = recentOrders?.filter(o =>
    !["delivered", "cancelled"].includes(o.status)
  ) || [];
  const activeOrder = activeOrders[0];
  const hasAddress = !!defaultAddr;
  const hasPayment = !!(paymentMethods && paymentMethods.length > 0);
  const completedOrders = recentOrders?.filter(o => o.status === "delivered") || [];
  const lastOrder = completedOrders[0];
  const canQuickReorder = hasAddress && hasPayment && !!lastOrder;

  // Loyalty points (from user object if available)
  const loyaltyPoints = (user as any)?.loyaltyPoints ?? 0;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  // Navigate to wizard with wash style preselected
  const startWashOrder = (serviceType: string) => {
    (window as any).__offload_wash_type = serviceType;
    navigate("/order/new?service=" + serviceType);
  };

  // Quick reorder using last order's settings
  const handleQuickReorder = () => {
    if (!lastOrder) return;
    const bags = (() => { try { return JSON.parse(lastOrder.bags || "[]"); } catch { return []; } })();
    const firstBag = bags[0];

    (window as any).__offload_voice_prefill = {
      serviceType: lastOrder.serviceType || "wash_fold",
      tierName: firstBag?.size ? `${firstBag.size}_bag` : undefined,
      deliverySpeed: lastOrder.deliverySpeed || "standard",
      pickupAddress: defaultAddr ? `${defaultAddr.street}, ${defaultAddr.city}` : undefined,
    };
    navigate("/order/new");
  };

  // Top vendor for "Top-Rated" card
  const topVendor = vendors?.slice().sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];

  return (
    <div className="pb-28 max-w-lg mx-auto">
      {/* ─── Header ─── */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted-foreground text-sm mb-0.5">{greeting()},</p>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-greeting">
              {user?.name || "there"}
            </h1>
            {defaultAddr && (
              <div className="flex items-center gap-1.5 mt-2 text-muted-foreground text-xs">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                <span data-testid="text-address">{defaultAddr.street}, {defaultAddr.city}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Hero CTA Card — matches Figma purple gradient ─── */}
      <div className="px-5 mb-5">
        <Link href="/order/new">
          <Card
            data-testid="card-schedule-pickup"
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] text-white p-6 cursor-pointer group transition-all duration-300 hover:shadow-[0_0_40px_rgba(124,58,237,0.3)] border-0"
          >
            {/* Decorative orbs */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-sm" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-8 -mb-8 blur-sm" />

            <h2 className="text-lg font-bold mb-1.5 relative z-10">Ready for fresh laundry?</h2>
            <p className="text-sm text-white/80 mb-4 relative z-10 leading-relaxed max-w-[280px]">
              We'll pick it up, wash it with care, and deliver it back — fresh and folded.
            </p>
            <Button
              size="sm"
              className="bg-white/15 border border-white/20 text-white hover:bg-white/25 transition-colors rounded-full px-5 h-10"
              data-testid="button-schedule"
            >
              Schedule Pickup <ArrowRight className="w-4 h-4 ml-1.5 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </Card>
        </Link>
      </div>

      {/* ─── Active Order Banner ─── */}
      {activeOrder && (
        <div className="px-5 mb-5">
          <Link href={`/orders/${activeOrder.id}`}>
            <Card className="p-4 border-primary/20 bg-primary/5 cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-[0_0_20px_rgba(124,58,237,0.08)] rounded-2xl" data-testid="card-active-order">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center relative">
                  <Truck className="w-5 h-5 text-primary" />
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Your laundry is on its way</p>
                    <Badge variant="secondary" className="text-[10px] bg-blue-500/15 text-blue-400 shrink-0 ml-2">
                      {friendlyStatus(activeOrder.status)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeOrder.orderNumber} — Tap to track
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Card>
          </Link>
        </div>
      )}

      {/* ─── Top-Rated Vendor Card (Figma: vendor recommendation) ─── */}
      {topVendor && (
        <div className="px-5 mb-5">
          <Card className="p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:border-primary/30" data-testid="card-top-vendor">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary">Top-Rated Vendor Near You</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} className={`w-3 h-3 ${i <= Math.round(topVendor.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">{topVendor.reviewCount || 0} reviews</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 italic">
                  "Clothes folded perfectly, quick and friendly service"
                </p>
                <p className="text-xs text-primary mt-1">
                  {topVendor.name} — Tap for details
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ─── Quick Reorder Tile ─── */}
      {canQuickReorder && (
        <div className="px-5 mb-5">
          <button
            onClick={handleQuickReorder}
            className="w-full text-left"
            data-testid="card-quick-reorder"
          >
            <Card className="p-4 rounded-2xl border-emerald-500/20 bg-emerald-500/5 cursor-pointer transition-all duration-200 hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(34,197,94,0.08)]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Reorder Last</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Same as last time — one tap to review & place
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Zap className="w-3.5 h-3.5 text-emerald-500" />
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </Card>
          </button>
        </div>
      )}

      {/* ─── Choose Your Wash Style — 3 quick-order tiles (Figma) ─── */}
      <div className="px-5 mb-5">
        <h3 className="text-base font-semibold mb-3">Choose Your Wash Style</h3>
        <div className="grid grid-cols-2 gap-3">
          {/* Standard Wash */}
          <button
            onClick={() => startWashOrder("wash_fold")}
            className="text-left"
            data-testid="tile-standard-wash"
          >
            <Card className="p-4 rounded-2xl h-full cursor-pointer transition-all duration-200 hover:border-primary/40 active:scale-[0.98]">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Shirt className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-semibold mb-0.5">Standard Wash</p>
              <p className="text-xs text-muted-foreground leading-snug mb-2">
                Quick, reliable wash with Offload Certified quality.
              </p>
              <p className="text-xs text-muted-foreground">
                Est. <span className="font-semibold text-foreground">{QUICK_ORDER_PRICES.medium}</span>
                <span className="text-muted-foreground"> / med bag</span>
              </p>
            </Card>
          </button>

          {/* Signature Wash */}
          <button
            onClick={() => startWashOrder("wash_fold_signature")}
            className="text-left"
            data-testid="tile-signature-wash"
          >
            <Card className="p-4 rounded-2xl h-full cursor-pointer transition-all duration-200 hover:border-primary/40 active:scale-[0.98]">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-semibold mb-0.5">Signature Wash</p>
              <p className="text-xs text-muted-foreground leading-snug mb-2">
                Extra love — detergent upgrade, separated packaging.
              </p>
              <p className="text-xs text-muted-foreground">
                Est. <span className="font-semibold text-foreground">{QUICK_ORDER_PRICES.medium}</span>
                <span className="text-muted-foreground"> + $5/bag</span>
              </p>
            </Card>
          </button>

          {/* Custom Wash — full-width */}
          <button
            onClick={() => startWashOrder("wash_fold_custom")}
            className="text-left col-span-2"
            data-testid="tile-custom-wash"
          >
            <Card className="p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:border-primary/40 active:scale-[0.98]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Settings2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Your Custom Wash</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your saved preferences applied to every order.
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Card>
          </button>
        </div>
      </div>

      {/* ─── Quick Actions (Figma: 2-col grid) ─── */}
      <div className="px-5 mb-5">
        <div className="grid grid-cols-2 gap-3">
          <Link href="/profile#wash-prefs">
            <Card className="p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.98]" data-testid="card-wash-prefs">
              <Settings2 className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium">Wash Preferences</p>
              <p className="text-xs text-muted-foreground mt-0.5">Cold wash, hypoallergenic detergent</p>
              <p className="text-xs text-primary mt-1">Edit preferences →</p>
            </Card>
          </Link>
          <Link href="/orders">
            <Card className="p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.98] relative" data-testid="card-track-orders">
              <ClipboardList className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium">Track Orders</p>
              {activeOrders.length > 0 ? (
                <p className="text-xs text-muted-foreground mt-0.5">{activeOrders.length} active order{activeOrders.length > 1 ? "s" : ""}</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">No active orders</p>
              )}
              {activeOrders.length > 0 && (
                <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {activeOrders.length}
                </span>
              )}
            </Card>
          </Link>
        </div>
      </div>

      {/* ─── Talk to Offload — Voice AI CTA (Figma) ─── */}
      <div className="px-5 mb-5">
        <Card
          className="p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.98] bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20"
          onClick={() => setVoiceOrderOpen(true)}
          data-testid="card-talk-to-offload"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Mic className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-primary">Talk to Offload</p>
              <p className="text-xs text-muted-foreground mt-0.5">Order by voice — just tell us what you need</p>
            </div>
            <ChevronRight className="w-4 h-4 text-primary/60 shrink-0" />
          </div>
        </Card>
      </div>

      {/* ─── Recent Activity (Figma) ─── */}
      <div className="px-5">
        <h3 className="text-base font-semibold mb-3">Recent Activity</h3>
        {ordersLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : recentOrders && recentOrders.length > 0 ? (
          <div className="space-y-3">
            {recentOrders.slice(0, 3).map(order => {
              const bags = (() => { try { return JSON.parse(order.bags || "[]"); } catch { return []; } })();
              const statusColor = order.status === "delivered"
                ? "bg-emerald-500/15 text-emerald-400"
                : order.status === "cancelled"
                ? "bg-red-500/15 text-red-400"
                : "bg-blue-500/15 text-blue-400";
              const isActive = !["delivered", "cancelled"].includes(order.status);

              return (
                <Link key={order.id} href={`/orders/${order.id}`}>
                  <Card className="p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.99]" data-testid={`card-order-${order.id}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          {isActive && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                          )}
                        </div>
                        <p className="text-sm font-medium">{order.orderNumber}</p>
                      </div>
                      <Badge variant="secondary" className={`text-[10px] ${statusColor}`}>
                        {friendlyStatus(order.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {(() => {
                          const parts = bags
                            .map((b: any) => {
                              const qty = b?.quantity ?? b?.count ?? b?.qty ?? 1;
                              const type = b?.type ?? b?.bagSize ?? b?.size ?? b?.name ?? "bag";
                              if (!qty && !type) return null;
                              const label = String(type).replace(/_/g, " ");
                              return `${qty}x ${label}`;
                            })
                            .filter(Boolean);
                          return parts.length > 0 ? parts.join(", ") : (order.deliverySpeed ? `${order.deliverySpeed.replace(/_/g, ' ')} pickup` : "Pickup");
                        })()}
                      </p>
                      <p className="text-sm font-semibold">${(order.total ?? 0).toFixed(2)}</p>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="p-8 text-center rounded-2xl">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-primary/60" />
            </div>
            <p className="text-sm font-medium mb-1">No orders yet</p>
            <p className="text-xs text-muted-foreground mb-4">Schedule your first pickup and we'll take care of the rest.</p>
            <Link href="/order/new">
              <Button size="sm" className="rounded-full" data-testid="button-first-pickup">Schedule First Pickup</Button>
            </Link>
          </Card>
        )}
      </div>

      {/* Voice Order Modal */}
      <VoiceOrderModal open={voiceOrderOpen} onClose={() => setVoiceOrderOpen(false)} />
    </div>
  );
}
