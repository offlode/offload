import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Gift, Star, ChevronLeft, TrendingUp, Award, Zap, Truck,
  Headphones, ArrowDownLeft, ArrowUpRight, Sparkles, Crown,
  Check, AlertCircle
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";

// Loyalty tier config matching schema
const LOYALTY_TIERS = {
  bronze: {
    minPoints: 0,
    nextAt: 500,
    multiplier: 1.0,
    perks: ["5% off first order"],
    color: "text-amber-700 dark:text-amber-500",
    bgColor: "bg-amber-700/10 dark:bg-amber-500/10",
    borderColor: "border-amber-700/20 dark:border-amber-500/20",
    badgeClass: "bg-amber-700/15 text-amber-700 dark:text-amber-500",
    icon: <Award className="w-4 h-4" />,
    gradient: "from-amber-700/20 to-amber-600/10",
  },
  silver: {
    minPoints: 500,
    nextAt: 2000,
    multiplier: 1.25,
    perks: ["Free delivery", "10% off all orders"],
    color: "text-slate-500 dark:text-slate-300",
    bgColor: "bg-slate-400/10",
    borderColor: "border-slate-400/20",
    badgeClass: "bg-slate-400/15 text-slate-600 dark:text-slate-300",
    icon: <Star className="w-4 h-4" />,
    gradient: "from-slate-400/20 to-slate-300/10",
  },
  gold: {
    minPoints: 2000,
    nextAt: 5000,
    multiplier: 1.5,
    perks: ["Free delivery", "15% off all orders", "Priority matching"],
    color: "text-yellow-500 dark:text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/20",
    badgeClass: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    icon: <Zap className="w-4 h-4" />,
    gradient: "from-yellow-500/20 to-amber-400/10",
  },
  platinum: {
    minPoints: 5000,
    nextAt: null,
    multiplier: 2.0,
    perks: ["Free delivery", "20% off all orders", "Priority matching", "Dedicated support"],
    color: "text-primary dark:text-primary/80",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/20",
    badgeClass: "bg-primary/15 text-primary dark:text-primary/80",
    icon: <Crown className="w-4 h-4" />,
    gradient: "from-primary/20 to-primary/10",
  },
};

const PERK_ICONS: Record<string, React.ReactNode> = {
  "Free delivery": <Truck className="w-4 h-4" />,
  "Priority matching": <Zap className="w-4 h-4" />,
  "Dedicated support": <Headphones className="w-4 h-4" />,
};

const TRANSACTION_TYPE_CONFIG = {
  earned: {
    label: "Earned",
    icon: <ArrowUpRight className="w-3.5 h-3.5" />,
    color: "text-emerald-500",
    sign: "+",
  },
  redeemed: {
    label: "Redeemed",
    icon: <ArrowDownLeft className="w-3.5 h-3.5" />,
    color: "text-rose-400",
    sign: "-",
  },
  bonus: {
    label: "Bonus",
    icon: <Sparkles className="w-3.5 h-3.5" />,
    color: "text-amber-400",
    sign: "+",
  },
  referral: {
    label: "Referral",
    icon: <Gift className="w-3.5 h-3.5" />,
    color: "text-primary",
    sign: "+",
  },
  expired: {
    label: "Expired",
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    color: "text-muted-foreground",
    sign: "-",
  },
};

type LoyaltyData = {
  points: number;
  tier: keyof typeof LOYALTY_TIERS;
  nextTier: keyof typeof LOYALTY_TIERS | null;
  pointsToNext: number | null;
  transactions: Array<{
    id: number;
    type: keyof typeof TRANSACTION_TYPE_CONFIG;
    points: number;
    description: string;
    createdAt: string;
  }>;
  perks: string[];
};

export default function LoyaltyPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [redeemPoints, setRedeemPoints] = useState([100]);

  const { data, isLoading } = useQuery<LoyaltyData>({
    queryKey: ["/api/loyalty", user?.id],
    queryFn: async () => {
      const res = await apiRequest(`/api/loyalty/${user?.id}`);
      return res.json();
    },
    enabled: !!user?.id,
  });

  const redeemMutation = useMutation({
    mutationFn: async (points: number) => {
      const res = await apiRequest("/api/loyalty/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points, userId: user?.id }),
      });
      if (!res.ok) throw new Error("Redemption failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/loyalty", user?.id] });
      toast({
        title: "Points redeemed!",
        description: `${redeemPoints[0]} pts → $${(redeemPoints[0] / 100).toFixed(2)} credit added to your account.`,
      });
      setRedeemPoints([100]);
    },
    onError: () => {
      toast({
        title: "Redemption failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const tier = data?.tier || "bronze";
  const tierConfig = LOYALTY_TIERS[tier];
  const currentPoints = data?.points || 0;
  const tierProgress = (() => {
    if (!tierConfig.nextAt) return 100;
    const prev = tierConfig.minPoints;
    const range = tierConfig.nextAt - prev;
    const earned = currentPoints - prev;
    return Math.min(100, Math.max(0, (earned / range) * 100));
  })();

  const maxRedeem = Math.floor((currentPoints / 100)) * 100;
  const redeemValue = (redeemPoints[0] / 100).toFixed(2);

  return (
    <div className="pb-28 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate("/")}
          data-testid="button-back"
          className="w-9 h-9 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold">Offload Rewards</h1>
          <p className="text-xs text-muted-foreground">Earn points on every wash</p>
        </div>
      </div>

      {isLoading ? (
        <div className="px-5 space-y-4">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* Tier + Points Card */}
          <div className="px-5 mb-5">
            <Card
              className={`relative overflow-hidden p-6 bg-gradient-to-br ${tierConfig.gradient} border ${tierConfig.borderColor}`}
              data-testid="card-loyalty-tier"
            >
              {/* Decorative circle */}
              <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-current opacity-5" />
              <div className="flex items-start justify-between mb-4">
                <div>
                  <Badge
                    className={`${tierConfig.badgeClass} border-0 gap-1.5 px-2.5 py-1 text-xs font-semibold capitalize mb-3`}
                    data-testid="badge-tier"
                  >
                    {tierConfig.icon}
                    {tier} Member
                  </Badge>
                  <p className="text-muted-foreground text-xs mb-1">Available points</p>
                  <p
                    className={`text-5xl font-bold tracking-tight ${tierConfig.color}`}
                    data-testid="text-points-balance"
                  >
                    {currentPoints.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Worth ${(currentPoints / 100).toFixed(2)} in credit
                  </p>
                </div>
                <div className={`w-14 h-14 rounded-2xl ${tierConfig.bgColor} flex items-center justify-center ${tierConfig.color}`}>
                  <Gift className="w-7 h-7" />
                </div>
              </div>

              {/* Tier progress */}
              {tierConfig.nextAt && (
                <div>
                  <div className="flex items-center justify-between mb-2 text-xs">
                    <span className="text-muted-foreground capitalize">{tier}</span>
                    <span className={`font-medium ${tierConfig.color}`}>
                      {data?.pointsToNext?.toLocaleString()} pts to {data?.nextTier}
                    </span>
                  </div>
                  <Progress
                    value={tierProgress}
                    className="h-2"
                    data-testid="progress-tier"
                  />
                </div>
              )}
              {!tierConfig.nextAt && (
                <div className="flex items-center gap-2 mt-2 text-xs text-primary">
                  <Crown className="w-3.5 h-3.5" />
                  <span>You've reached the highest tier!</span>
                </div>
              )}
            </Card>
          </div>

          {/* Current Perks */}
          <div className="px-5 mb-5">
            <h2 className="text-sm font-semibold mb-3">Your {tier.charAt(0).toUpperCase() + tier.slice(1)} Perks</h2>
            <Card className="p-4 space-y-3" data-testid="card-perks">
              {tierConfig.perks.map((perk, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${tierConfig.bgColor} flex items-center justify-center ${tierConfig.color} shrink-0`}>
                    {PERK_ICONS[perk] || <Check className="w-4 h-4" />}
                  </div>
                  <span className="text-sm font-medium">{perk}</span>
                </div>
              ))}
              {tierConfig.multiplier > 1 && (
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${tierConfig.bgColor} flex items-center justify-center ${tierConfig.color} shrink-0`}>
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium">{tierConfig.multiplier}× points multiplier</span>
                </div>
              )}
            </Card>
          </div>

          {/* Redeem Points */}
          {currentPoints >= 100 && (
            <div className="px-5 mb-5">
              <h2 className="text-sm font-semibold mb-3">Redeem Points</h2>
              <Card className="p-5" data-testid="card-redeem">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">Points to redeem</p>
                  <p className="text-sm font-bold text-primary" data-testid="text-redeem-amount">
                    {redeemPoints[0]} pts
                  </p>
                </div>
                <Slider
                  value={redeemPoints}
                  onValueChange={setRedeemPoints}
                  min={100}
                  max={Math.max(100, maxRedeem)}
                  step={100}
                  className="mb-4"
                  data-testid="slider-redeem"
                />
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-muted-foreground">100 pts = $1.00 credit</p>
                  <p className="text-sm font-semibold text-emerald-500">
                    = ${redeemValue} off
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => redeemMutation.mutate(redeemPoints[0])}
                  disabled={redeemMutation.isPending || redeemPoints[0] > currentPoints}
                  data-testid="button-redeem"
                >
                  {redeemMutation.isPending ? "Redeeming..." : `Redeem ${redeemPoints[0]} pts for $${redeemValue}`}
                </Button>
              </Card>
            </div>
          )}

          {currentPoints < 100 && (
            <div className="px-5 mb-5">
              <Card className="p-5 text-center border-dashed" data-testid="card-redeem-locked">
                <Gift className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium mb-1">Not enough points to redeem</p>
                <p className="text-xs text-muted-foreground">
                  You need at least 100 points (${(100 / 100).toFixed(2)} value). Keep washing!
                </p>
              </Card>
            </div>
          )}

          {/* Transaction History */}
          <div className="px-5">
            <h2 className="text-sm font-semibold mb-3">Points History</h2>
            {!data?.transactions || data.transactions.length === 0 ? (
              <Card className="p-8 text-center" data-testid="card-no-transactions">
                <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No transactions yet. Start earning!</p>
              </Card>
            ) : (
              <Card className="divide-y divide-border overflow-hidden" data-testid="list-transactions">
                {data.transactions.map((tx) => {
                  const config = TRANSACTION_TYPE_CONFIG[tx.type] || TRANSACTION_TYPE_CONFIG.earned;
                  const date = new Date(tx.createdAt);
                  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-4 py-3"
                      data-testid={`row-transaction-${tx.id}`}
                    >
                      <div className={`w-8 h-8 rounded-full bg-muted flex items-center justify-center ${config.color} shrink-0`}>
                        {config.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{config.label} · {dateStr}</p>
                      </div>
                      <p className={`text-sm font-semibold ${config.color} shrink-0`}>
                        {config.sign}{Math.abs(tx.points)} pts
                      </p>
                    </div>
                  );
                })}
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
