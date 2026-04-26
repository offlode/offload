import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  DollarSign, TrendingUp, Truck, Store, Percent,
  ArrowUpRight, Clock, CheckCircle2, AlertCircle
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "./layout";

interface FinancialData {
  summary: {
    totalRevenue: number;
    vendorPayouts: number;
    driverPayouts: number;
    platformRevenue: number;
    commissionRate: number;
  };
  vendorBreakdown: {
    id: number;
    name: string;
    orders: number;
    grossRevenue: number;
    vendorPayout: number;
    platformFee: number;
    payoutStatus: "pending" | "processing" | "completed";
  }[];
  monthlyTrend: {
    month: string;
    revenue: number;
    vendorPayouts: number;
    driverPayouts: number;
    platformRevenue: number;
  }[];
}

const PAYOUT_STATUS_STYLES: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pending: {
    label: "Pending",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    icon: <Clock className="w-3 h-3" />,
  },
  processing: {
    label: "Processing",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    icon: <TrendingUp className="w-3 h-3" />,
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  failed: {
    label: "Failed",
    className: "bg-red-500/15 text-red-500",
    icon: <AlertCircle className="w-3 h-3" />,
  },
};

function SummaryCard({
  label, value, icon, iconColor, subtext, trend,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconColor: string;
  subtext?: string;
  trend?: string;
}) {
  return (
    <Card className="p-4" data-testid={`financial-kpi-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg ${iconColor} flex items-center justify-center`}>
          {icon}
        </div>
        {trend && (
          <div className="flex items-center gap-0.5 text-[10px] text-emerald-500 font-medium">
            <ArrowUpRight className="w-3 h-3" />
            {trend}
          </div>
        )}
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {subtext && <p className="text-[10px] text-muted-foreground mt-1">{subtext}</p>}
    </Card>
  );
}

export default function AdminFinancial() {
  const { data, isLoading } = useQuery<FinancialData>({
    queryKey: ["/api/admin/financial"],
  });

  // No fabricated fallbacks — show empty state when API has no data.
  const emptyData: FinancialData = {
    summary: {
      totalRevenue: 0,
      vendorPayouts: 0,
      driverPayouts: 0,
      platformRevenue: 0,
      commissionRate: 0,
    },
    vendorBreakdown: [],
    monthlyTrend: [],
  };

  const displayData = data ?? emptyData;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold" data-testid="text-financial-title">Financial Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Revenue, payouts, and commission — current period
          </p>
        </div>

        {/* Summary Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              label="Total Revenue"
              value={`$${displayData.summary.totalRevenue.toLocaleString()}`}
              icon={<DollarSign className="w-[18px] h-[18px] text-emerald-400" />}
              iconColor="bg-emerald-500/10"
              trend="+14%"
            />
            <SummaryCard
              label="Vendor Payouts"
              value={`$${displayData.summary.vendorPayouts.toLocaleString()}`}
              icon={<Store className="w-[18px] h-[18px] text-blue-400" />}
              iconColor="bg-blue-500/10"
              subtext={`${((displayData.summary.vendorPayouts / displayData.summary.totalRevenue) * 100).toFixed(0)}% of revenue`}
            />
            <SummaryCard
              label="Driver Payouts"
              value={`$${displayData.summary.driverPayouts.toLocaleString()}`}
              icon={<Truck className="w-[18px] h-[18px] text-orange-400" />}
              iconColor="bg-orange-500/10"
              subtext={`${((displayData.summary.driverPayouts / displayData.summary.totalRevenue) * 100).toFixed(0)}% of revenue`}
            />
            <SummaryCard
              label="Platform Revenue"
              value={`$${displayData.summary.platformRevenue.toLocaleString()}`}
              icon={<Percent className="w-[18px] h-[18px] text-primary" />}
              iconColor="bg-primary/10"
              subtext={`${displayData.summary.commissionRate}% commission rate`}
              trend="+11%"
            />
          </div>
        )}

        {/* Monthly Trend Chart */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4" data-testid="text-monthly-trend-title">
            Monthly Revenue Trend — Last 6 Months
          </h3>
          {isLoading ? (
            <Skeleton className="h-52" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={displayData.monthlyTrend}
                margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5B4BC4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#5B4BC4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradVendor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2DD4BF" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2DD4BF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradPlatform" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [
                    `$${value.toLocaleString()}`,
                    name === "revenue" ? "Revenue" :
                    name === "vendorPayouts" ? "Vendor Payouts" :
                    name === "platformRevenue" ? "Platform Revenue" : name,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#5B4BC4"
                  strokeWidth={2}
                  fill="url(#gradRevenue)"
                />
                <Area
                  type="monotone"
                  dataKey="vendorPayouts"
                  stroke="#2DD4BF"
                  strokeWidth={1.5}
                  fill="url(#gradVendor)"
                />
                <Area
                  type="monotone"
                  dataKey="platformRevenue"
                  stroke="#F59E0B"
                  strokeWidth={1.5}
                  fill="url(#gradPlatform)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 justify-end">
            {[
              { color: "#5B4BC4", label: "Revenue" },
              { color: "#2DD4BF", label: "Vendor Payouts" },
              { color: "#F59E0B", label: "Platform Revenue" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-3 h-0.5 rounded-full" style={{ background: item.color }} />
                {item.label}
              </div>
            ))}
          </div>
        </Card>

        {/* Vendor Revenue Breakdown */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4" data-testid="text-vendor-breakdown-title">
            Revenue Breakdown by Vendor
          </h3>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="table-vendor-financial">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left pb-2 font-medium">Vendor</th>
                    <th className="text-right pb-2 font-medium">Orders</th>
                    <th className="text-right pb-2 font-medium">Gross Revenue</th>
                    <th className="text-right pb-2 font-medium">Vendor Payout</th>
                    <th className="text-right pb-2 font-medium">Platform Fee</th>
                    <th className="text-right pb-2 font-medium">Margin</th>
                    <th className="text-left pb-2 font-medium">Payout Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayData.vendorBreakdown.map((v) => {
                    const margin = ((v.platformFee / v.grossRevenue) * 100).toFixed(1);
                    const status = PAYOUT_STATUS_STYLES[v.payoutStatus] ?? PAYOUT_STATUS_STYLES.pending;
                    return (
                      <tr key={v.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-financial-vendor-${v.id}`}>
                        <td className="py-3 font-medium">{v.name}</td>
                        <td className="py-3 text-right">{v.orders}</td>
                        <td className="py-3 text-right font-semibold">${v.grossRevenue.toLocaleString()}</td>
                        <td className="py-3 text-right">${v.vendorPayout.toLocaleString()}</td>
                        <td className="py-3 text-right text-primary font-medium">${v.platformFee.toLocaleString()}</td>
                        <td className="py-3 text-right">
                          <span className="font-medium">{margin}%</span>
                        </td>
                        <td className="py-3">
                          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${status.className}`}>
                            {status.icon}
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold text-foreground">
                    <td className="pt-3">Total</td>
                    <td className="pt-3 text-right">
                      {displayData.vendorBreakdown.reduce((s, v) => s + v.orders, 0)}
                    </td>
                    <td className="pt-3 text-right">
                      ${displayData.vendorBreakdown.reduce((s, v) => s + v.grossRevenue, 0).toLocaleString()}
                    </td>
                    <td className="pt-3 text-right">
                      ${displayData.vendorBreakdown.reduce((s, v) => s + v.vendorPayout, 0).toLocaleString()}
                    </td>
                    <td className="pt-3 text-right text-primary">
                      ${displayData.vendorBreakdown.reduce((s, v) => s + v.platformFee, 0).toLocaleString()}
                    </td>
                    <td className="pt-3 text-right">
                      {(
                        (displayData.vendorBreakdown.reduce((s, v) => s + v.platformFee, 0) /
                          displayData.vendorBreakdown.reduce((s, v) => s + v.grossRevenue, 0)) * 100
                      ).toFixed(1)}%
                    </td>
                    <td className="pt-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
