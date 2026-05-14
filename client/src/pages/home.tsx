import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  MapPin, ArrowRight, Star, Shield, Sparkles, Settings2,
  ClipboardList, ChevronRight, Truck, Clock, Shirt, Package, Mic, Gift
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { VoiceOrderModal } from "@/components/voice-order";
import { apiRequest } from "@/lib/queryClient";
import type { Order, Vendor, Address } from "@shared/schema";

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
  folded_packaged: "Folded & Packaged",
  final_weight_verified: "Weight Verified",
  packing: "Packing",
  ready_for_delivery: "Ready for delivery",
  out_for_delivery: "Out for delivery",
  driver_en_route_delivery: "Driver delivering",
  delivered: "Delivered",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

function friendlyStatus(s: string) {
  return FRIENDLY_STATUS[s] || s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

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
          className="w-full h-12 text-base font-semibold"
          onClick={() => navigate("/login")}
          data-testid="button-login"
        >
          Log In
        </Button>
        <Button
          variant="secondary"
          className="w-full h-12 text-base font-semibold"
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
            <Card key={i} className="p-4 flex items-start gap-3" data-testid={`feature-card-${i}`}>
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
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
    <Card className="p-4 min-w-[200px] max-w-[220px] shrink-0 snap-start">
      <Skeleton className="w-10 h-10 rounded-full mb-3" />
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-3 w-full mb-1" />
      <Skeleton className="h-3 w-2/3" />
    </Card>
  );
}

export default function HomePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const [voiceOrderOpen, setVoiceOrderOpen] = useState(false);

  const { data: addressList } = useQuery<Address[]>({
    queryKey: [`/api/addresses?userId=${user?.id}`],
    enabled: !!user,
  });

  const { data: vendors, isLoading: vendorsLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    enabled: !!user,
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: [`/api/orders?customerId=${user?.id}`],
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

  // Loyalty points (from user object if available)
  const loyaltyPoints = (user as any)?.loyaltyPoints ?? 0;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="pb-28 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted-foreground text-sm mb-1">{greeting()},</p>
            <h1 className="text-xl font-bold" data-testid="text-greeting">{user?.name || "there"}</h1>
            <div className="flex items-center gap-1.5 mt-2 text-muted-foreground text-xs">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              <span data-testid="text-address">{defaultAddr ? `${defaultAddr.street}, ${defaultAddr.city}` : "No address set"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hero CTA Card — "Schedule a Pickup" with primary purple CTA → /order/new */}
      <div className="px-5 mb-6">
        <Link href="/order/new">
          <Card
            data-testid="card-schedule-pickup"
            className="relative overflow-hidden bg-gradient-to-br from-primary bg-primary text-primary-foreground p-6 cursor-pointer group transition-all duration-300 hover:shadow-[0_0_40px_rgba(123,92,246,0.25)]"
          >
            {/* Decorative orbs */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-sm" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-8 -mb-8 blur-sm" />

            <h2 className="text-lg font-bold mb-1.5 relative z-10">Schedule a Pickup</h2>
            <p className="text-sm text-white/80 mb-4 relative z-10 leading-relaxed max-w-[280px]">
              Customize your wash, choose a time, and we'll handle the rest.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/15 border border-white/20 text-white no-default-hover-elevate no-default-active-elevate hover:bg-white/25 transition-colors"
              data-testid="button-schedule"
            >
              Start Your Order <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </Card>
        </Link>
      </div>

      {/* Active Order Banner */}
      {activeOrder && (
        <div className="px-5 mb-6">
          <Link href={`/orders/${activeOrder.id}`}>
            <Card className="p-4 border-primary/20 bg-primary/5 cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-[0_0_20px_rgba(123,92,246,0.08)]" data-testid="card-active-order">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center relative">
                  <Truck className="w-5 h-5 text-primary" />
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Your laundry is on its way</p>
                    <Badge variant="secondary" className="text-[10px] bg-blue-500/15 text-blue-400">
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

      {/* Nearby Vendors Carousel */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold px-5 mb-3">Nearby Vendors</h3>
        <div className="flex gap-3 px-5 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {vendorsLoading ? (
            <>
              <VendorSkeleton />
              <VendorSkeleton />
              <VendorSkeleton />
            </>
          ) : vendors && vendors.length > 0 ? (
            vendors.slice(0, 6).map(vendor => (
              <Card
                key={vendor.id}
                className="p-4 min-w-[200px] max-w-[220px] shrink-0 snap-start cursor-pointer transition-all duration-200 hover:border-primary/30"
                onClick={() => toast({
                  title: vendor.name,
                  description: `${vendor.address}, ${vendor.city} — ${vendor.rating}★`,
                })}
                data-testid={`vendor-card-${vendor.id}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-emerald-500" />
                  </div>
                  {vendor.certified && (
                    <Badge variant="secondary" className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1 py-0">
                      Certified
                    </Badge>
                  )}
                </div>
                <p className="text-sm font-semibold truncate">{vendor.name}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span className="text-xs text-muted-foreground">
                    {vendor.rating?.toFixed(1)} ({vendor.reviewCount || 0})
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 truncate">
                  {vendor.city || vendor.address}
                </p>
              </Card>
            ))
          ) : (
            <>
              {/* Honest skeleton placeholders — no fake vendor names */}
              <Card className="p-4 min-w-[200px] max-w-[220px] shrink-0 snap-start">
                <Skeleton className="w-8 h-8 rounded-full mb-2" />
                <Skeleton className="h-4 w-3/4 mb-1" />
                <Skeleton className="h-3 w-full mb-1" />
                <p className="text-[10px] text-muted-foreground mt-2">Finding vendors near you...</p>
              </Card>
              <Card className="p-4 min-w-[200px] max-w-[220px] shrink-0 snap-start">
                <Skeleton className="w-8 h-8 rounded-full mb-2" />
                <Skeleton className="h-4 w-3/4 mb-1" />
                <Skeleton className="h-3 w-full mb-1" />
                <p className="text-[10px] text-muted-foreground mt-2">Finding vendors near you...</p>
              </Card>
              <Card className="p-4 min-w-[200px] max-w-[220px] shrink-0 snap-start">
                <Skeleton className="w-8 h-8 rounded-full mb-2" />
                <Skeleton className="h-4 w-3/4 mb-1" />
                <Skeleton className="h-3 w-full mb-1" />
                <p className="text-[10px] text-muted-foreground mt-2">Finding vendors near you...</p>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-5 mb-6">
        <div className="grid grid-cols-2 gap-3">
          <Link href="/orders">
            <Card className="p-4 cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.98] relative" data-testid="card-track-orders">
              <ClipboardList className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium">Track Orders</p>
              {activeOrders.length > 0 ? (
                <p className="text-xs text-muted-foreground mt-0.5">{activeOrders.length} active</p>
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
          <Link href="/loyalty">
            <Card className="p-4 cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.98]" data-testid="card-loyalty">
              <Gift className="w-5 h-5 text-amber-400 mb-2" />
              <p className="text-sm font-medium">Loyalty Points</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {loyaltyPoints > 0 ? `${loyaltyPoints} pts` : "Start earning"}
              </p>
            </Card>
          </Link>
          <Card
            className="p-4 cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.98] col-span-2 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20"
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
      </div>

      {/* Recent Orders (last 3) */}
      <div className="px-5">
        <h3 className="text-sm font-semibold mb-3">Recent Orders</h3>
        {ordersLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
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
                  <Card className="p-4 cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.99]" data-testid={`card-order-${order.id}`}>
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
          <Card className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-primary/60" />
            </div>
            <p className="text-sm font-medium mb-1">No orders yet</p>
            <p className="text-xs text-muted-foreground mb-4">Schedule your first pickup and we'll take care of the rest.</p>
            <Link href="/order/new">
              <Button size="sm" data-testid="button-first-pickup">Schedule First Pickup</Button>
            </Link>
          </Card>
        )}
      </div>

      {/* Voice Order Modal */}
      <VoiceOrderModal open={voiceOrderOpen} onClose={() => setVoiceOrderOpen(false)} />
    </div>
  );
}
