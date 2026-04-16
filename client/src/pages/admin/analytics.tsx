import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  DollarSign, Package, TrendingUp, Percent,
  Users, ArrowUpRight, Star
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "./layout";

// Chart colors matching CSS variable hex equivalents
const CHART_COLORS = {
  primary: "#5B4BC4",
  teal: "#2DD4BF",
  blue: "#3B82F6",
  amber: "#F59E0B",
  red: "#EF4444",
};

interface AnalyticsData {
  revenueByDay: { day: string; revenue: number; orders: number }[];
  kpis: {
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    platformCommission: number;
  };
  orderStatusBreakdown: { name: string; value: number }[];
  acquisitionFunnel: { stage: string; count: number; percentage: number }[];
  topVendors: {
    id: number;
    name: string;
    orders: number;
    rating: number;
    revenue: number;
    tier: string;
  }[];
}

function KpiCard({
  label, value, icon, iconColor, trend,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconColor: string;
  trend?: string;
}) {
  return (
    <Card className="p-4" data-testid={`kpi-${label.toLowerCase().replace(/\s/g, "-")}`}>
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
    </Card>
  );
}

const STATUS_COLORS: Record<string, string> = {
  delivered: CHART_COLORS.teal,
  washing: CHART_COLORS.blue,
  pending: CHART_COLORS.amber,
  cancelled: CHART_COLORS.red,
  out_for_delivery: CHART_COLORS.primary,
};

const TIER_BADGES: Record<string, { label: string; className: string }> = {
  elite: { label: "Elite", className: "bg-primary/15 text-primary dark:text-primary/80" },
  premium: { label: "Premium", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  standard: { label: "Standard", className: "bg-muted text-muted-foreground" },
};

export default function AdminAnalytics() {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics"],
  });

  // Simulated data for display while API is pending/unavailable
  const simulatedRevenue = [
    { day: "Mon", revenue: 1240, orders: 18 },
    { day: "Tue", revenue: 1890, orders: 27 },
    { day: "Wed", revenue: 1560, orders: 22 },
    { day: "Thu", revenue: 2100, orders: 31 },
    { day: "Fri", revenue: 2780, orders: 41 },
    { day: "Sat", revenue: 3200, orders: 48 },
    { day: "Sun", revenue: 2450, orders: 36 },
  ];

  const simulatedKpis = {
    totalRevenue: 15220,
    totalOrders: 223,
    avgOrderValue: 68.25,
    platformCommission: 1978.6,
  };

  const simulatedStatusBreakdown = [
    { name: "Delivered", value: 145 },
    { name: "In Progress", value: 42 },
    { name: "Pending", value: 21 },
    { name: "Cancelled", value: 15 },
  ];

  const simulatedFunnel = [
    { stage: "Registered", count: 1840, percentage: 100 },
    { stage: "First Order", count: 1102, percentage: 60 },
    { stage: "Repeat Customer", count: 551, percentage: 30 },
    { stage: "Subscriber", count: 184, percentage: 10 },
  ];

  const simulatedVendors = [
    { id: 1, name: "Fresh & Clean Co.", orders: 84, rating: 4.9, revenue: 5880, tier: "elite" },
    { id: 2, name: "City Wash Center", orders: 61, rating: 4.7, revenue: 4270, tier: "premium" },
    { id: 3, name: "Sparkle Laundry", orders: 43, rating: 4.6, revenue: 3010, tier: "premium" },
    { id: 4, name: "QuickWash Express", orders: 35, rating: 4.3, revenue: 2450, tier: "standard" },
  ];

  const revenueData = data?.revenueByDay ?? simulatedRevenue;
  const kpis = data?.kpis ?? simulatedKpis;
  const statusBreakdown = data?.orderStatusBreakdown ?? simulatedStatusBreakdown;
  const funnel = data?.acquisitionFunnel ?? simulatedFunnel;
  const vendors = data?.topVendors ?? simulatedVendors;

  const pieColors = [CHART_COLORS.teal, CHART_COLORS.primary, CHART_COLORS.amber, CHART_COLORS.red, CHART_COLORS.blue];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold" data-testid="text-analytics-title">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Platform performance — last 7 days</p>
        </div>

        {/* KPI Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Total Revenue"
              value={`$${kpis.totalRevenue.toLocaleString()}`}
              icon={<DollarSign className="w-[18px] h-[18px] text-emerald-400" />}
              iconColor="bg-emerald-500/10"
              trend="+12%"
            />
            <KpiCard
              label="Total Orders"
              value={kpis.totalOrders.toString()}
              icon={<Package className="w-[18px] h-[18px] text-blue-400" />}
              iconColor="bg-blue-500/10"
              trend="+8%"
            />
            <KpiCard
              label="Avg Order Value"
              value={`$${kpis.avgOrderValue.toFixed(2)}`}
              icon={<TrendingUp className="w-[18px] h-[18px] text-primary" />}
              iconColor="bg-primary/10"
              trend="+3%"
            />
            <KpiCard
              label="Platform Commission"
              value={`$${kpis.platformCommission.toLocaleString()}`}
              icon={<Percent className="w-[18px] h-[18px] text-primary" />}
              iconColor="bg-primary/10"
              trend="+15%"
            />
          </div>
        )}

        {/* Revenue Bar Chart + Status Pie */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Revenue Chart */}
          <Card className="p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold mb-4" data-testid="text-revenue-chart-title">
              Revenue — Last 7 Days
            </h3>
            {isLoading ? (
              <Skeleton className="h-48" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revenueData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => [
                      name === "revenue" ? `$${value}` : value,
                      name === "revenue" ? "Revenue" : "Orders",
                    ]}
                  />
                  <Bar dataKey="revenue" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Status Pie */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-4" data-testid="text-status-pie-title">
              Order Status Breakdown
            </h3>
            {isLoading ? (
              <Skeleton className="h-48" />
            ) : (
              <div>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={72}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {statusBreakdown.map((_, index) => (
                        <Cell key={index} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {statusBreakdown.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: pieColors[i % pieColors.length] }}
                        />
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                      <span className="font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Acquisition Funnel + Top Vendors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Acquisition Funnel */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Customer Acquisition Funnel</h3>
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {funnel.map((stage, i) => {
                  const colors = [CHART_COLORS.primary, CHART_COLORS.blue, CHART_COLORS.teal, CHART_COLORS.amber];
                  return (
                    <div key={stage.stage} data-testid={`funnel-stage-${i}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{stage.stage}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{stage.percentage}%</span>
                          <span className="text-xs font-semibold">{stage.count.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${stage.percentage}%`,
                            background: colors[i % colors.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Top Vendors */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Top Performing Vendors</h3>
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="table-top-vendors">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left pb-2 font-medium">Vendor</th>
                      <th className="text-right pb-2 font-medium">Orders</th>
                      <th className="text-right pb-2 font-medium">Rating</th>
                      <th className="text-right pb-2 font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {vendors.map((v) => {
                      const tier = TIER_BADGES[v.tier] ?? TIER_BADGES.standard;
                      return (
                        <tr key={v.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-vendor-${v.id}`}>
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate max-w-[120px]">{v.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tier.className}`}>
                                {tier.label}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 text-right">{v.orders}</td>
                          <td className="py-2.5 text-right">
                            <span className="text-amber-500 font-medium">{v.rating}</span>
                          </td>
                          <td className="py-2.5 text-right font-semibold">${v.revenue.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
