import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  MapPin, ArrowRight, Star, Shield, Sparkles, Settings2,
  ClipboardList, ChevronRight, Truck, Clock, Shirt, Package,
  Mic, Gift, RefreshCw
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { VoiceOrderModal } from "@/components/voice-order";
import { OffloadLogo } from "@/components/offload-logo";
import { useI18n } from "@/i18n";
import { apiRequest } from "@/lib/queryClient";
import { friendlyStatus } from "@/lib/order-status";
import type { Order, Vendor, Address, PaymentMethod } from "@shared/schema";

// ─── Landing view for logged-out users ───────────────────────
function LandingView() {
  const [, navigate] = useLocation();
  const { t } = useI18n();
  return (
    <div className="pb-28 max-w-lg mx-auto">
      {/* Hero Section */}
      <div className="px-5 pt-12 pb-8 text-center">
        <OffloadLogo size={64} className="mx-auto mb-6" />
        <h1 className="text-3xl font-bold mb-3" data-testid="text-landing-title">
          {t("home.landing_title").split("\n").map((line, i) => (
            <span key={i}>{i > 0 && <br />}{line}</span>
          ))}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
          {t("home.landing_subtitle")}
        </p>
      </div>

      {/* CTA Buttons */}
      <div className="px-5 mb-8 space-y-3">
        <Button
          className="w-full h-12 text-base font-semibold"
          onClick={() => navigate("/login")}
          data-testid="button-login"
        >
          {t("home.login_button")}
        </Button>
        <Button
          variant="secondary"
          className="w-full h-12 text-base font-semibold"
          onClick={() => navigate("/role-select")}
          data-testid="button-signup"
        >
          {t("home.create_account_button")}
        </Button>
      </div>

      {/* Features */}
      <div className="px-5">
        <div className="grid grid-cols-1 gap-3">
          {[
            { icon: <Truck className="w-5 h-5 text-primary" />, title: t("home.feature_pickup_title"), desc: t("home.feature_pickup_desc") },
            { icon: <Shield className="w-5 h-5 text-emerald-400" />, title: t("home.feature_certified_title"), desc: t("home.feature_certified_desc") },
            { icon: <Star className="w-5 h-5 text-amber-400" />, title: t("home.feature_rated_title"), desc: t("home.feature_rated_desc") },
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

// ─── Vendor skeleton ─────────────────────────────────────────
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

// ─── Wash Style Quick-Order Tile ─────────────────────────────
interface WashTileProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  priceHint: string;
  href: string;
}

function WashTile({ icon, title, description, priceHint, href }: WashTileProps) {
  return (
    <Link href={href}>
      <Card
        className="p-4 min-w-[260px] w-[260px] shrink-0 snap-start cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-[0_0_20px_rgba(124,58,237,0.1)] active:scale-[0.97]"
        data-testid={`tile-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3 text-primary">
          {icon}
        </div>
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug line-clamp-2">
          {description}
        </p>
        <p className="text-xs font-semibold text-primary mt-2">{priceHint}</p>
      </Card>
    </Link>
  );
}

// ─── Main Home Page ──────────────────────────────────────────
export default function HomePage() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { t } = useI18n();
  const [voiceOrderOpen, setVoiceOrderOpen] = useState(false);

  const openVoiceModal = useCallback(() => {
    setVoiceOrderOpen(true);
  }, []);

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
    queryFn: async () => {
      const res = await apiRequest(`/api/payment-methods?userId=${user?.id}`);
      return res.json();
    },
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
  const hasPayment = (paymentMethods?.length ?? 0) > 0;
  const hasOrders = (recentOrders?.length ?? 0) > 0;
  const canQuickReorder = hasAddress && hasPayment && hasOrders;

  // Last completed order for reorder
  const lastOrder = recentOrders?.find(o => o.status === "delivered") || recentOrders?.[0];

  // Loyalty points (from user object if available)
  const loyaltyPoints = (user as any)?.loyaltyPoints ?? 0;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("home.good_morning");
    if (hour < 17) return t("home.good_afternoon");
    return t("home.good_evening");
  };

  // Top-rated vendor
  const topVendor = vendors
    ?.filter(v => v.certified && v.rating)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];

  return (
    <div className="pb-28 max-w-lg mx-auto">
      {/* ── Header / Greeting ── */}
      <div className="px-5 pt-6 pb-2">
        <div className="flex items-center gap-3 mb-1">
          <OffloadLogo size={36} />
          <div>
            <p className="text-muted-foreground text-sm">{greeting()},</p>
            <h1 className="text-2xl font-bold mt-0.5" data-testid="text-greeting">
              {user?.name || "there"}
            </h1>
          </div>
        </div>
        {defaultAddr && (
          <div className="flex items-center gap-1.5 mt-2 text-muted-foreground text-xs">
            <MapPin className="w-3.5 h-3.5 text-primary" />
            <span data-testid="text-address">{defaultAddr.street}, {defaultAddr.city}</span>
          </div>
        )}
      </div>

      {/* ── Hero CTA — "Ready for fresh laundry?" ── */}
      <div className="px-5 mt-4 mb-5">
        <Link href="/order/new">
          <Card
            data-testid="card-schedule-pickup"
            className="relative overflow-hidden bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-6 cursor-pointer group transition-all duration-300 hover:shadow-[0_0_40px_rgba(124,58,237,0.25)]"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-sm" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-8 -mb-8 blur-sm" />

            <h2 className="text-lg font-bold mb-1 relative z-10">{t("home.hero_title")}</h2>
            <p className="text-sm text-white/80 mb-4 relative z-10 leading-relaxed max-w-[280px]">
              {t("home.hero_subtitle")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/15 border border-white/20 text-white no-default-hover-elevate no-default-active-elevate hover:bg-white/25 transition-colors"
              data-testid="button-schedule"
            >
              {t("home.hero_cta")} <ArrowRight className="w-4 h-4 ml-1.5 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </Card>
        </Link>
      </div>

      {/* ── Active Order Banner ── */}
      {activeOrder && (
        <div className="px-5 mb-5">
          <Link href={`/orders/${activeOrder.id}`}>
            <Card className="p-4 border-primary/20 bg-primary/5 cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-[0_0_20px_rgba(124,58,237,0.08)]" data-testid="card-active-order">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center relative">
                  <Truck className="w-5 h-5 text-primary" />
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{t("home.active_order_title")}</p>
                    <Badge variant="secondary" className="text-[10px] bg-blue-500/15 text-blue-400">
                      {friendlyStatus(activeOrder.status)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeOrder.orderNumber} — {t("home.active_order_tap")}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Card>
          </Link>
        </div>
      )}

      {/* ── Top-Rated Vendor Nearby ── */}
      {topVendor && (
        <div className="px-5 mb-5">
          <Card
            className="p-4 cursor-pointer transition-all duration-200 hover:border-primary/30"
            onClick={() => navigate("/orders")}
            data-testid="card-top-vendor"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-400">{t("home.top_vendor_title")}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span className="text-xs text-muted-foreground ml-1">
                    {topVendor.rating?.toFixed(1)} ({topVendor.reviewCount || 0} {t("home.top_vendor_reviews")})
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{topVendor.name} — {t("home.top_vendor_tap")}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Quick Reorder Tile ── */}
      {canQuickReorder && lastOrder && (
        <div className="px-5 mb-5">
          <Card
            className="p-4 cursor-pointer border-emerald-500/20 bg-emerald-500/5 transition-all duration-200 hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(34,197,94,0.08)] active:scale-[0.99]"
            onClick={() => {
              // Prefill wizard with last order's settings and navigate to review
              const rawBags = (() => { try { return JSON.parse(lastOrder.bags || "[]"); } catch { return []; } })();
              // Normalize bags to { size, quantity } format regardless of backend field names
              const bags = rawBags.map((b: any) => ({
                size: b.size || b.bagSize || b.type || "small",
                quantity: b.quantity || b.count || b.qty || 1,
              }));
              const serviceType = lastOrder.serviceType || "wash_fold";
              const qs = `?service=${encodeURIComponent(serviceType)}`;
              // Store reorder data for wizard
              (window as any).__offload_reorder = {
                bags,
                serviceType,
                deliverySpeed: lastOrder.deliverySpeed || "standard",
                address: defaultAddr ? `${defaultAddr.street}, ${defaultAddr.city}, ${defaultAddr.state} ${defaultAddr.zip}` : "",
                pickupAddressId: defaultAddr?.id,
                paymentMethodId: paymentMethods?.[0]?.id ? String(paymentMethods[0].id) : "",
              };
              navigate(`/order/new${qs}`);
            }}
            data-testid="card-quick-reorder"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{t("home.reorder_title")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("home.reorder_subtitle")}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>
          </Card>
        </div>
      )}

      {/* ── Choose Your Wash Style — Quick Order Tiles ── */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold px-5 mb-3">{t("home.wash_style_heading")}</h3>
        <div className="flex gap-3 px-5 pr-8 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-none" style={{ scrollbarWidth: "none" }}>
          <WashTile
            icon={<Shirt className="w-5 h-5" />}
            title={t("home.standard_wash_title")}
            description={t("home.standard_wash_desc")}
            priceHint={t("home.standard_wash_price")}
            href="/order/new?service=wash_fold"
          />
          <WashTile
            icon={<Sparkles className="w-5 h-5" />}
            title={t("home.signature_wash_title")}
            description={t("home.signature_wash_desc")}
            priceHint={t("home.signature_wash_price")}
            href="/order/new?service=wash_fold_signature"
          />
          <WashTile
            icon={<Settings2 className="w-5 h-5" />}
            title={t("home.wash_prefs_tile_title")}
            description={t("home.wash_prefs_tile_desc")}
            priceHint={t("home.wash_prefs_tile_price")}
            href="/profile?openWashPrefs=1"
          />
        </div>
      </div>

      {/* ── Quick Action Cards — 2-up grid ── */}
      <div className="px-5 mb-5">
        <div className="grid grid-cols-2 gap-3">
          {/* Wash Preferences */}
          <Link href="/profile?openWashPrefs=1">
            <Card className="p-4 h-[120px] flex flex-col cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.98]" data-testid="card-wash-preferences">
              <Settings2 className="w-6 h-6 text-primary mb-2" />
              <p className="text-sm font-semibold">{t("home.card_wash_prefs_title")}</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex-1">{t("home.card_wash_prefs_desc")}</p>
              <p className="text-xs text-primary font-medium">{t("home.card_wash_prefs_link")} →</p>
            </Card>
          </Link>

          {/* Track Orders */}
          <Link href="/orders">
            <Card className="p-4 h-[120px] flex flex-col cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.98] relative" data-testid="card-track-orders">
              <ClipboardList className="w-6 h-6 text-primary mb-2" />
              <p className="text-sm font-semibold">{t("home.card_track_title")}</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex-1">
                {activeOrders.length > 0 ? `${activeOrders.length} ${activeOrders.length > 1 ? t("home.card_track_active_plural") : t("home.card_track_active")}` : t("home.no_active_orders")}
              </p>
              {activeOrders.length > 0 && (
                <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {activeOrders.length}
                </span>
              )}
            </Card>
          </Link>
        </div>
      </div>

      {/* ── Talk to Offload — Voice/AI CTA ── */}
      <div className="px-5 mb-5">
        <Card
          role="button"
          tabIndex={0}
          className="p-4 cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.99] bg-gradient-to-r from-[#5B4BC4]/15 to-[#5B4BC4]/5 border-[#5B4BC4]/25"
          onClick={openVoiceModal}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openVoiceModal(); } }}
          data-testid="card-talk-to-offload"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#5B4BC4]/20 flex items-center justify-center shrink-0">
              <Mic className="w-6 h-6 text-[#5B4BC4]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#5B4BC4]">{t("home.talk_to_offload")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("home.talk_to_offload_desc")}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#5B4BC4]/60 shrink-0" />
          </div>
        </Card>
      </div>

      {/* ── Recent Activity ── */}
      <div className="px-5">
        <h3 className="text-sm font-semibold mb-3">{t("home.recent_activity")}</h3>
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
            <p className="text-sm font-medium mb-1">{t("home.no_orders_yet")}</p>
            <p className="text-xs text-muted-foreground mb-4">{t("home.no_orders_desc")}</p>
            <Link href="/order/new">
              <Button size="sm" data-testid="button-first-pickup">{t("home.schedule_first_pickup")}</Button>
            </Link>
          </Card>
        )}
      </div>

      {/* Voice Order Modal */}
      <VoiceOrderModal open={voiceOrderOpen} onClose={() => setVoiceOrderOpen(false)} />
    </div>
  );
}
