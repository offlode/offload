import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  ShieldAlert, ShieldCheck, Shield, AlertTriangle,
  CheckCircle2, ArrowUpRight, Flag, ChevronDown, ChevronUp
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "./layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FraudAlert {
  id: number;
  orderId: number;
  orderNumber: string;
  customerId: number;
  customerName: string;
  riskScore: number; // 0-100
  riskLevel: "high" | "medium" | "low";
  flags: string[];
  status: "flagged" | "cleared" | "escalated";
  amount: number;
  createdAt: string;
}

interface FraudSummary {
  totalFlagged: number;
  highRisk: number;
  mediumRisk: number;
  cleared: number;
  alerts: FraudAlert[];
}

const RISK_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode; barColor: string }> = {
  high: {
    label: "High Risk",
    className: "bg-red-500/15 text-red-600 dark:text-red-400",
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
    barColor: "#EF4444",
  },
  medium: {
    label: "Medium Risk",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    barColor: "#F59E0B",
  },
  low: {
    label: "Low Risk",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    icon: <Shield className="w-3.5 h-3.5" />,
    barColor: "#3B82F6",
  },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  flagged: { label: "Flagged", className: "bg-red-500/15 text-red-500" },
  cleared: { label: "Cleared", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  escalated: { label: "Escalated", className: "bg-primary/15 text-primary dark:text-primary/80" },
};

function RiskScoreBar({ score }: { score: number }) {
  const level = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  const { barColor } = RISK_CONFIG[level];
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: barColor }}
        />
      </div>
      <span
        className="text-xs font-bold w-7 text-right"
        style={{ color: barColor }}
      >
        {score}
      </span>
    </div>
  );
}

const FLAG_LABELS: Record<string, string> = {
  unusual_amount: "Unusual order amount",
  multiple_cancellations: "Multiple recent cancellations",
  new_account: "New account — high spend",
  address_mismatch: "Pickup/delivery address mismatch",
  promo_abuse: "Suspected promo code abuse",
  velocity: "High order velocity",
  chargeback_history: "Previous chargeback history",
  device_mismatch: "Device fingerprint mismatch",
};

export default function AdminFraud() {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<FraudSummary>({
    queryKey: ["/api/admin/fraud-alerts"],
  });

  const clearMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const res = await apiRequest(`/api/admin/fraud-alerts/${alertId}/clear`, {
        method: "PATCH",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-alerts"] });
      toast({ title: "Alert cleared successfully" });
    },
    onError: () => {
      toast({ title: "Failed to clear alert", variant: "destructive" });
    },
  });

  const escalateMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const res = await apiRequest(`/api/admin/fraud-alerts/${alertId}/escalate`, {
        method: "PATCH",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-alerts"] });
      toast({ title: "Alert escalated to senior team" });
    },
    onError: () => {
      toast({ title: "Failed to escalate alert", variant: "destructive" });
    },
  });

  // Simulated data
  const simData: FraudSummary = {
    totalFlagged: 12,
    highRisk: 3,
    mediumRisk: 6,
    cleared: 24,
    alerts: [
      {
        id: 1, orderId: 1001, orderNumber: "ORD-1001",
        customerId: 42, customerName: "James Wilson",
        riskScore: 88, riskLevel: "high",
        flags: ["unusual_amount", "new_account", "address_mismatch"],
        status: "flagged", amount: 285.00, createdAt: "2024-01-15T14:23:00Z",
      },
      {
        id: 2, orderId: 1002, orderNumber: "ORD-1002",
        customerId: 71, customerName: "Sarah Chen",
        riskScore: 74, riskLevel: "high",
        flags: ["promo_abuse", "velocity"],
        status: "escalated", amount: 145.50, createdAt: "2024-01-15T12:10:00Z",
      },
      {
        id: 3, orderId: 1003, orderNumber: "ORD-1003",
        customerId: 88, customerName: "Mike Rodriguez",
        riskScore: 62, riskLevel: "medium",
        flags: ["multiple_cancellations"],
        status: "flagged", amount: 67.25, createdAt: "2024-01-14T18:55:00Z",
      },
      {
        id: 4, orderId: 1004, orderNumber: "ORD-1004",
        customerId: 105, customerName: "Emma Thompson",
        riskScore: 55, riskLevel: "medium",
        flags: ["device_mismatch", "promo_abuse"],
        status: "flagged", amount: 98.00, createdAt: "2024-01-14T10:30:00Z",
      },
      {
        id: 5, orderId: 1005, orderNumber: "ORD-1005",
        customerId: 119, customerName: "David Kim",
        riskScore: 45, riskLevel: "medium",
        flags: ["chargeback_history"],
        status: "cleared", amount: 52.75, createdAt: "2024-01-13T16:20:00Z",
      },
    ],
  };

  const displayData = data ?? simData;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold" data-testid="text-fraud-title">Fraud Detection</h1>
          <p className="text-sm text-muted-foreground mt-0.5">AI-powered risk scoring and order flagging</p>
        </div>

        {/* Summary Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4" data-testid="kpi-total-flagged">
              <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center mb-3">
                <Flag className="w-[18px] h-[18px] text-red-500" />
              </div>
              <p className="text-xl font-bold">{displayData.totalFlagged}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Flagged</p>
            </Card>
            <Card className="p-4" data-testid="kpi-high-risk">
              <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center mb-3">
                <ShieldAlert className="w-[18px] h-[18px] text-red-500" />
              </div>
              <p className="text-xl font-bold">{displayData.highRisk}</p>
              <p className="text-xs text-muted-foreground mt-0.5">High Risk</p>
            </Card>
            <Card className="p-4" data-testid="kpi-medium-risk">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center mb-3">
                <AlertTriangle className="w-[18px] h-[18px] text-amber-500" />
              </div>
              <p className="text-xl font-bold">{displayData.mediumRisk}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Medium Risk</p>
            </Card>
            <Card className="p-4" data-testid="kpi-fraud-cleared">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3">
                <ShieldCheck className="w-[18px] h-[18px] text-emerald-500" />
              </div>
              <p className="text-xl font-bold">{displayData.cleared}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Cleared</p>
            </Card>
          </div>
        )}

        {/* Alerts Table */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Flagged Orders</h3>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : (
            <div className="space-y-0">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_1fr_2fr_1fr_1fr_auto] gap-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide pb-2 border-b border-border px-2">
                <span>Order</span>
                <span>Customer</span>
                <span>Risk Score</span>
                <span>Amount</span>
                <span>Status</span>
                <span className="w-28 text-right">Actions</span>
              </div>

              {/* Rows */}
              {displayData.alerts.map((alert) => {
                const risk = RISK_CONFIG[alert.riskLevel];
                const statusStyle = STATUS_CONFIG[alert.status] ?? STATUS_CONFIG.flagged;
                const isExpanded = expandedId === alert.id;
                const isPending = clearMutation.isPending || escalateMutation.isPending;

                return (
                  <div
                    key={alert.id}
                    className="border-b border-border last:border-0"
                    data-testid={`row-fraud-alert-${alert.id}`}
                  >
                    {/* Main row */}
                    <div
                      className="grid grid-cols-[1fr_1fr_2fr_1fr_1fr_auto] gap-3 items-center py-3 px-2 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                    >
                      <span className="text-xs font-mono font-medium">{alert.orderNumber}</span>
                      <span className="text-xs text-muted-foreground truncate">{alert.customerName}</span>
                      <div className="pr-4">
                        <RiskScoreBar score={alert.riskScore} />
                      </div>
                      <span className="text-xs font-semibold">${alert.amount.toFixed(2)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusStyle.className} inline-block`}>
                        {statusStyle.label}
                      </span>
                      <div className="w-28 flex items-center justify-end gap-1">
                        {alert.status === "flagged" && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); clearMutation.mutate(alert.id); }}
                              disabled={isPending}
                              className="p-1.5 rounded hover:bg-emerald-500/10 transition-colors text-muted-foreground hover:text-emerald-600"
                              title="Clear alert"
                              data-testid={`button-clear-alert-${alert.id}`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); escalateMutation.mutate(alert.id); }}
                              disabled={isPending}
                              className="p-1.5 rounded hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-600"
                              title="Escalate"
                              data-testid={`button-escalate-alert-${alert.id}`}
                            >
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                          data-testid={`button-expand-alert-${alert.id}`}
                        >
                          {isExpanded
                            ? <ChevronUp className="w-3.5 h-3.5" />
                            : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div
                        className="px-3 pb-4 pt-0 bg-muted/20 border-t border-border"
                        data-testid={`detail-fraud-alert-${alert.id}`}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                          {/* Flags */}
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                              Triggered Flags
                            </p>
                            <div className="space-y-1.5">
                              {alert.flags.map((flag) => (
                                <div key={flag} className="flex items-center gap-2 text-xs">
                                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                  <span>{FLAG_LABELS[flag] ?? flag.replace(/_/g, " ")}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Risk Level + Recommended Action */}
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                              Risk Assessment
                            </p>
                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${risk.className}`}>
                                  {risk.icon}{risk.label}
                                </span>
                                <span className="text-muted-foreground">Risk Score: {alert.riskScore}/100</span>
                              </div>
                              <div className="p-2 rounded-lg bg-muted/60 text-muted-foreground leading-relaxed">
                                {alert.riskLevel === "high" && (
                                  <span>
                                    <strong className="text-foreground">Recommended action:</strong> Hold order and contact customer to verify identity. Consider manual review before processing.
                                  </span>
                                )}
                                {alert.riskLevel === "medium" && (
                                  <span>
                                    <strong className="text-foreground">Recommended action:</strong> Monitor closely. Flag for review if additional suspicious activity is detected within 24h.
                                  </span>
                                )}
                                {alert.riskLevel === "low" && (
                                  <span>
                                    <strong className="text-foreground">Recommended action:</strong> Low risk — safe to proceed. Alert logged for audit purposes.
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {alert.status === "flagged" && (
                          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 text-xs gap-1.5"
                              onClick={() => clearMutation.mutate(alert.id)}
                              disabled={isPending}
                              data-testid={`button-clear-expanded-${alert.id}`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              Clear Alert
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs gap-1.5"
                              onClick={() => escalateMutation.mutate(alert.id)}
                              disabled={isPending}
                              data-testid={`button-escalate-expanded-${alert.id}`}
                            >
                              <ArrowUpRight className="w-3.5 h-3.5" />
                              Escalate
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {displayData.alerts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No fraud alerts — all clear</p>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
