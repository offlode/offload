import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Gift, ChevronLeft, Copy, Share2, Check, Users,
  DollarSign, Clock, CheckCircle2, XCircle, Link as LinkIcon,
  Sparkles, ArrowRight
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";

type ReferralData = {
  referralCode: string;
  stats: {
    totalReferrals: number;
    completed: number;
    pending: number;
    totalEarned: number;
  };
  referrals: Array<{
    id: number;
    refereeName: string;
    status: "pending" | "completed" | "rewarded";
    referrerReward: number;
    refereeReward: number;
    createdAt: string;
    completedAt?: string;
  }>;
};

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    icon: <Clock className="w-3 h-3" />,
    badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  completed: {
    label: "Completed",
    icon: <CheckCircle2 className="w-3 h-3" />,
    badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  rewarded: {
    label: "Rewarded",
    icon: <DollarSign className="w-3 h-3" />,
    badgeClass: "bg-primary/15 text-primary",
  },
};

export default function ReferralsPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const { data, isLoading } = useQuery<ReferralData>({
    queryKey: ["/api/referrals", user?.id],
    queryFn: async () => {
      const res = await apiRequest(`/api/referrals/${user?.id}`);
      return res.json();
    },
    enabled: !!user?.id,
  });

  const referralCode = data?.referralCode || user?.referralCode || "OFFLOAD10";
  const referralLink = `https://offload.app/join?ref=${referralCode}`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      toast({ title: "Code copied!", description: "Share it with friends." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copied!", description: referralCode });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      toast({ title: "Link copied!", description: "Share it anywhere." });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Try Offload — fresh laundry delivered!",
          text: `Use my referral code ${referralCode} and we both get $10 credit!`,
          url: referralLink,
        });
      } catch {
        // User cancelled
      }
    } else {
      handleCopyLink();
    }
  };

  const stats = data?.stats;

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
          <h1 className="text-xl font-bold">Refer a Friend</h1>
          <p className="text-xs text-muted-foreground">Give $10, get $10</p>
        </div>
      </div>

      {/* Hero Card */}
      <div className="px-5 mb-5">
        <Card
          className="relative overflow-hidden bg-gradient-to-br from-primary bg-primary text-primary-foreground p-6"
          data-testid="card-referral-hero"
        >
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/5 rounded-full blur-sm" />
          <div className="absolute bottom-0 left-1/3 w-24 h-24 bg-white/5 rounded-full blur-md" />

          <div className="flex items-start gap-4 relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <Gift className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold mb-1">Give $10, Get $10</h2>
              <p className="text-sm text-white/80 leading-relaxed">
                Share your code with a friend. When they complete their first order, you both receive $10 credit instantly.
              </p>
            </div>
          </div>

          {/* How it works steps */}
          <div className="mt-5 pt-5 border-t border-white/15 relative z-10">
            <div className="grid grid-cols-3 gap-3">
              {[
                { step: "1", label: "Share your code" },
                { step: "2", label: "Friend places order" },
                { step: "3", label: "Both get $10!" },
              ].map((s) => (
                <div key={s.step} className="text-center">
                  <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-1.5 text-xs font-bold">
                    {s.step}
                  </div>
                  <p className="text-[11px] text-white/80 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Referral Code */}
      <div className="px-5 mb-5">
        <h2 className="text-sm font-semibold mb-3">Your Referral Code</h2>
        <Card className="p-5" data-testid="card-referral-code">
          {isLoading ? (
            <Skeleton className="h-14 w-full rounded-lg" />
          ) : (
            <>
              <div
                className="flex items-center justify-center rounded-xl bg-primary/8 border border-primary/20 py-4 mb-4 cursor-pointer group transition-colors hover:bg-primary/12"
                onClick={handleCopyCode}
                data-testid="button-copy-code"
              >
                <span
                  className="text-2xl font-bold tracking-[0.2em] text-primary mr-3"
                  data-testid="text-referral-code"
                >
                  {referralCode}
                </span>
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary transition-transform group-hover:scale-105">
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </div>
              </div>

              {/* Share buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={handleCopyLink}
                  data-testid="button-copy-link"
                >
                  {copiedLink ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <LinkIcon className="w-4 h-4" />
                  )}
                  {copiedLink ? "Copied!" : "Copy Link"}
                </Button>
                <Button
                  className="gap-2"
                  onClick={handleShare}
                  data-testid="button-share"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Stats */}
      <div className="px-5 mb-5">
        <h2 className="text-sm font-semibold mb-3">Your Impact</h2>
        {isLoading ? (
          <Skeleton className="h-28 w-full rounded-xl" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4 text-center" data-testid="stat-total-referrals">
              <Users className="w-5 h-5 text-primary mx-auto mb-2" />
              <p className="text-xl font-bold">{stats?.totalReferrals ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Referrals</p>
            </Card>
            <Card className="p-4 text-center" data-testid="stat-total-earned">
              <DollarSign className="w-5 h-5 text-emerald-500 mx-auto mb-2" />
              <p className="text-xl font-bold text-emerald-500">${(stats?.totalEarned ?? 0).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Earned</p>
            </Card>
            <Card className="p-4 text-center" data-testid="stat-completed">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
              <p className="text-xl font-bold">{stats?.completed ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Completed</p>
            </Card>
            <Card className="p-4 text-center" data-testid="stat-pending">
              <Clock className="w-5 h-5 text-amber-400 mx-auto mb-2" />
              <p className="text-xl font-bold">{stats?.pending ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Pending</p>
            </Card>
          </div>
        )}
      </div>

      {/* Referral History */}
      <div className="px-5">
        <h2 className="text-sm font-semibold mb-3">Referral History</h2>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : !data?.referrals || data.referrals.length === 0 ? (
          <Card className="p-8 text-center border-dashed" data-testid="card-no-referrals">
            <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium mb-1">No referrals yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Share your code and start earning $10 for every friend who joins.
            </p>
            <Button size="sm" className="gap-2" onClick={handleShare} data-testid="button-share-first">
              <Share2 className="w-4 h-4" />
              Share Your Code
            </Button>
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden" data-testid="list-referrals">
            {data.referrals.map((ref) => {
              const statusCfg = STATUS_CONFIG[ref.status] || STATUS_CONFIG.pending;
              const date = new Date(ref.createdAt);
              const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

              return (
                <div
                  key={ref.id}
                  className="flex items-center gap-3 px-4 py-3"
                  data-testid={`row-referral-${ref.id}`}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ref.refereeName || "Friend"}</p>
                    <p className="text-xs text-muted-foreground">{dateStr}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge
                      className={`${statusCfg.badgeClass} border-0 gap-1 text-[11px] px-2 py-0.5`}
                    >
                      {statusCfg.icon}
                      {statusCfg.label}
                    </Badge>
                    {(ref.status === "completed" || ref.status === "rewarded") && (
                      <span className="text-xs font-semibold text-emerald-500">
                        +${ref.referrerReward.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
