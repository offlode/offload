import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity, Star, Clock, AlertTriangle,
  CheckCircle2, XCircle,
  Award, Zap, BarChart2
} from "lucide-react";
import { Card } from "@/components/ui/card";

import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "./layout";
import { apiRequest } from "@/lib/queryClient";

interface VendorScore {
  id: number;
  name: string;
  healthScore: number;
  rating: number;
  onTimeRate: number;
  disputeRate: number;
  avgProcessingTime: number;
  tier: string;
}

interface VendorHealth {
  vendor: VendorScore;
  scoreBreakdown: {
    quality: number;
    onTime: number;
    disputes: number;
    processing: number;
    volume: number;
  };
  recommendations: string[];
  recentOrders: {
    id: number;
    orderNumber: string;
    status: string;
    total: number;
    createdAt: string;
  }[];
  recentReviews: {
    id: number;
    rating: number;
    comment: string;
    createdAt: string;
  }[];
}

interface ScoresSummary {
  avgHealthScore: number;
  eliteVendors: number;
  atRiskVendors: number;
  avgOnTimeRate: number;
  vendors: VendorScore[];
}

function HealthScoreBadge({ score }: { score: number }) {
  if (score > 80) return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
      {score.toFixed(0)}
    </span>
  );
  if (score >= 60) return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
      {score.toFixed(0)}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
      {score.toFixed(0)}
    </span>
  );
}

function ScoreBar({ label, value, max = 100, color }: {
  label: string; value: number; max?: number; color: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold">{value.toFixed(0)}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

const TIER_STYLES: Record<string, string> = {
  elite: "bg-primary/15 text-primary dark:text-primary/80",
  premium: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  standard: "bg-muted text-muted-foreground",
};

export default function AdminVendorScoring() {
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);

  const { data: summary, isLoading: loadingSummary } = useQuery<ScoresSummary>({
    queryKey: ["/api/admin/vendor-scores"],
  });

  const { data: vendorHealth, isLoading: loadingHealth } = useQuery<VendorHealth>({
    queryKey: ["/api/admin/vendor-health", selectedVendorId],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/vendor-health/${selectedVendorId}`);
      return res.json();
    },
    enabled: selectedVendorId !== null,
  });

  // Simulated data
  const simSummary: ScoresSummary = {
    avgHealthScore: 78.4,
    eliteVendors: 3,
    atRiskVendors: 2,
    avgOnTimeRate: 92.1,
    vendors: [
      { id: 1, name: "Fresh & Clean Co.", healthScore: 94, rating: 4.9, onTimeRate: 97, disputeRate: 1.2, avgProcessingTime: 155, tier: "elite" },
      { id: 2, name: "City Wash Center", healthScore: 82, rating: 4.7, onTimeRate: 93, disputeRate: 2.1, avgProcessingTime: 170, tier: "premium" },
      { id: 3, name: "Sparkle Laundry", healthScore: 76, rating: 4.5, onTimeRate: 90, disputeRate: 2.8, avgProcessingTime: 185, tier: "standard" },
      { id: 4, name: "QuickWash Express", healthScore: 61, rating: 4.2, onTimeRate: 84, disputeRate: 4.5, avgProcessingTime: 220, tier: "standard" },
      { id: 5, name: "Metro Clean Hub", healthScore: 55, rating: 3.8, onTimeRate: 78, disputeRate: 6.1, avgProcessingTime: 240, tier: "standard" },
    ],
  };

  const simHealth: Record<number, VendorHealth> = {
    1: {
      vendor: simSummary.vendors[0],
      scoreBreakdown: { quality: 97, onTime: 95, disputes: 98, processing: 90, volume: 88 },
      recommendations: [
        "Excellent performance — maintain current standards",
        "Consider expanding capacity during peak hours (Fri–Sat)",
        "Processing time slightly above target on weekends",
      ],
      recentOrders: [
        { id: 101, orderNumber: "ORD-1001", status: "delivered", total: 68.50, createdAt: "2024-01-15" },
        { id: 102, orderNumber: "ORD-1002", status: "delivered", total: 92.00, createdAt: "2024-01-14" },
      ],
      recentReviews: [
        { id: 1, rating: 5, comment: "Perfect wash, fast delivery!", createdAt: "2024-01-15" },
        { id: 2, rating: 5, comment: "Best laundry service in the city", createdAt: "2024-01-13" },
      ],
    },
    4: {
      vendor: simSummary.vendors[3],
      scoreBreakdown: { quality: 72, onTime: 65, disputes: 60, processing: 55, volume: 70 },
      recommendations: [
        "Improve processing time — currently 20% above platform average",
        "On-time delivery rate below 85% threshold — review workflow",
        "Dispute rate (4.5%) exceeds 3% target — investigate common causes",
        "Consider additional staff during peak demand periods",
      ],
      recentOrders: [
        { id: 201, orderNumber: "ORD-2001", status: "disputed", total: 45.00, createdAt: "2024-01-15" },
        { id: 202, orderNumber: "ORD-2002", status: "delivered", total: 38.00, createdAt: "2024-01-13" },
      ],
      recentReviews: [
        { id: 3, rating: 3, comment: "Order arrived late, not fully satisfied", createdAt: "2024-01-15" },
        { id: 4, rating: 4, comment: "Good quality but slow turnaround", createdAt: "2024-01-12" },
      ],
    },
  };

  const displaySummary = summary ?? simSummary;
  const displayHealth = vendorHealth ?? (selectedVendorId ? simHealth[selectedVendorId] : null);

  const selectedVendor = displaySummary.vendors.find(v => v.id === selectedVendorId);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" data-testid="text-vendor-health-title">Vendor Health Scoring</h1>
            <p className="text-sm text-muted-foreground mt-0.5">AI-powered vendor performance analysis</p>
          </div>
        </div>

        {/* Summary Cards */}
        {loadingSummary ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4" data-testid="kpi-avg-health-score">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <Activity className="w-[18px] h-[18px] text-primary" />
              </div>
              <p className="text-xl font-bold">{displaySummary.avgHealthScore.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Avg Health Score</p>
            </Card>
            <Card className="p-4" data-testid="kpi-elite-vendors">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <Award className="w-[18px] h-[18px] text-primary" />
              </div>
              <p className="text-xl font-bold">{displaySummary.eliteVendors}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Elite Vendors</p>
            </Card>
            <Card className="p-4" data-testid="kpi-at-risk-vendors">
              <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center mb-3">
                <AlertTriangle className="w-[18px] h-[18px] text-red-500" />
              </div>
              <p className="text-xl font-bold">{displaySummary.atRiskVendors}</p>
              <p className="text-xs text-muted-foreground mt-0.5">At-Risk Vendors</p>
            </Card>
            <Card className="p-4" data-testid="kpi-avg-ontime-rate">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3">
                <Clock className="w-[18px] h-[18px] text-emerald-500" />
              </div>
              <p className="text-xl font-bold">{displaySummary.avgOnTimeRate.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">Avg On-Time Rate</p>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Vendor Table */}
          <Card className="p-5 lg:col-span-3">
            <h3 className="text-sm font-semibold mb-4">Vendor Scoreboard</h3>
            {loadingSummary ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="table-vendor-scores">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left pb-2 font-medium">Vendor</th>
                      <th className="text-right pb-2 font-medium">Score</th>
                      <th className="text-right pb-2 font-medium">Rating</th>
                      <th className="text-right pb-2 font-medium">On-Time</th>
                      <th className="text-right pb-2 font-medium">Disputes</th>
                      <th className="text-right pb-2 font-medium">Proc. (min)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displaySummary.vendors.map((v) => (
                      <tr
                        key={v.id}
                        className={`hover:bg-muted/30 transition-colors cursor-pointer ${
                          selectedVendorId === v.id ? "bg-primary/5" : ""
                        }`}
                        onClick={() => setSelectedVendorId(v.id === selectedVendorId ? null : v.id)}
                        data-testid={`row-vendor-score-${v.id}`}
                      >
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate max-w-[100px]">{v.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TIER_STYLES[v.tier] ?? TIER_STYLES.standard}`}>
                              {v.tier}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          <HealthScoreBadge score={v.healthScore} />
                        </td>
                        <td className="py-2.5 text-right">
                          <span className="text-amber-500">{v.rating.toFixed(1)}</span>
                        </td>
                        <td className="py-2.5 text-right">{v.onTimeRate}%</td>
                        <td className="py-2.5 text-right">
                          <span className={v.disputeRate > 4 ? "text-red-500 font-medium" : v.disputeRate > 3 ? "text-amber-500" : ""}>
                            {v.disputeRate}%
                          </span>
                        </td>
                        <td className="py-2.5 text-right">{v.avgProcessingTime}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Detail Panel */}
          <div className="lg:col-span-2">
            {!selectedVendorId ? (
              <Card className="p-5 h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Select a vendor to view</p>
                  <p className="text-xs mt-1">health score details</p>
                </div>
              </Card>
            ) : loadingHealth ? (
              <Card className="p-5 space-y-3">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8" />)}
              </Card>
            ) : displayHealth ? (
              <Card className="p-5 space-y-4" data-testid={`panel-vendor-health-${selectedVendorId}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">{displayHealth.vendor.name}</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Health Score Detail</p>
                  </div>
                  <button
                    onClick={() => setSelectedVendorId(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-close-vendor-detail"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>

                {/* Score Breakdown */}
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Score Breakdown</p>
                  <ScoreBar label="Quality" value={displayHealth.scoreBreakdown.quality} color="#5B4BC4" />
                  <ScoreBar label="On-Time" value={displayHealth.scoreBreakdown.onTime} color="#2DD4BF" />
                  <ScoreBar label="Disputes" value={displayHealth.scoreBreakdown.disputes} color="#3B82F6" />
                  <ScoreBar label="Processing" value={displayHealth.scoreBreakdown.processing} color="#F59E0B" />
                  <ScoreBar label="Volume" value={displayHealth.scoreBreakdown.volume} color="#5B4BC4" />
                </div>

                {/* AI Recommendations */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Recommendations</p>
                  {displayHealth.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs" data-testid={`recommendation-${i}`}>
                      <Zap className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                      <span className="text-muted-foreground leading-relaxed">{rec}</span>
                    </div>
                  ))}
                </div>

                {/* Recent Orders */}
                {displayHealth.recentOrders.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Orders</p>
                    {displayHealth.recentOrders.map((o) => (
                      <div key={o.id} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                        <span className="font-medium">{o.orderNumber}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            o.status === "delivered"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : "bg-red-500/15 text-red-500"
                          }`}>{o.status}</span>
                          <span className="font-semibold">${o.total}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent Reviews */}
                {displayHealth.recentReviews.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Reviews</p>
                    {displayHealth.recentReviews.map((r) => (
                      <div key={r.id} className="text-xs space-y-1">
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${i < r.rating ? "text-amber-400 fill-amber-400" : "text-muted"}`}
                            />
                          ))}
                        </div>
                        {r.comment && <p className="text-muted-foreground italic">"{r.comment}"</p>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
