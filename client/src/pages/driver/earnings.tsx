import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  DollarSign,
  TrendingUp,
  Star,
  Calendar,
  ArrowUpRight,
  Package,
  Clock,
  Award,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import DriverLayout from "./layout";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
import type { Driver } from "@shared/schema";

type EarningsData = {
  driverId: number;
  driverName: string;
  totalTrips: number;
  todayTrips: number;
  todayEarnings: number;
  todayTips: number;
  totalEarnings: number;
  pendingPayout: number;
  nextPayoutDate: string;
  avgPerTrip: number;
  bestDayEarnings: number;
  weeklyData: { day: string; earnings: number; trips: number }[];
  tripHistory: {
    id: number;
    orderNumber: string;
    pickupAddress: string;
    deliveryAddress: string;
    earnings: number;
    tip: number;
    timestamp: string;
    status: string;
  }[];
  rating: number | null;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-white/10 rounded-xl px-3 py-2 text-xs shadow-lg">
        <p className="text-gray-400 mb-1">{label}</p>
        <p className="text-white font-bold">${payload[0].value.toFixed(2)}</p>
      </div>
    );
  }
  return null;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-card rounded-2xl p-4 border border-white/5 flex flex-col gap-2">
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent ?? "bg-primary/15"}`}
      >
        <Icon className={`w-5 h-5 ${accent ? "text-white" : "text-primary"}`} />
      </div>
      <div>
        <p className="text-white font-bold text-lg leading-tight">{value}</p>
        <p className="text-gray-500 text-xs">{label}</p>
        {sub && <p className="text-gray-600 text-[10px] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const FALLBACK_WEEKLY = [
  { day: "Mon", earnings: 62.5, trips: 7 },
  { day: "Tue", earnings: 85.0, trips: 10 },
  { day: "Wed", earnings: 44.5, trips: 5 },
  { day: "Thu", earnings: 97.0, trips: 11 },
  { day: "Fri", earnings: 120.5, trips: 14 },
  { day: "Sat", earnings: 78.0, trips: 9 },
  { day: "Sun", earnings: 55.5, trips: 6 },
];

export default function DriverEarnings() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();

  const userId = user?.id;

  const { data: driver } = useQuery<Driver>({
    queryKey: ["/api/drivers/user", userId],
    queryFn: async () => {
      const res = await apiRequest(`/api/drivers/user/${userId}`);
      return res.json();
    },
    enabled: !!userId && isAuthenticated,
  });

  const driverId = driver?.id;

  const { data: earnings, isLoading } = useQuery<EarningsData>({
    queryKey: ["/api/driver/earnings", driverId],
    queryFn: async () => {
      const res = await apiRequest(`/api/driver/earnings?driverId=${driverId}`);
      return res.json();
    },
    enabled: !!driverId,
  });

  // Redirect if not authenticated (after all hooks)
  if (!isAuthenticated) {
    navigate("/login");
    return null;
  }

  const weeklyData = earnings?.weeklyData ?? FALLBACK_WEEKLY;
  const todayEarnings = earnings?.todayEarnings ?? 0;
  const todayTrips = earnings?.todayTrips ?? driver?.todayTrips ?? 0;
  const todayTips = earnings?.todayTips ?? 0;
  const totalEarnings = earnings?.totalEarnings ?? driver?.totalEarnings ?? 0;
  const pendingPayout = earnings?.pendingPayout ?? driver?.pendingPayout ?? 0;
  const avgPerTrip = earnings?.avgPerTrip ?? driver?.payoutPerTrip ?? 0;
  const bestDay = earnings?.bestDayEarnings ?? 0;
  const tripHistory = earnings?.tripHistory ?? [];

  const nextPayoutDate = earnings?.nextPayoutDate
    ? new Date(earnings.nextPayoutDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "Next Friday";

  return (
    <DriverLayout>
      <div className="px-5 pt-14 space-y-6 pb-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-white" data-testid="text-earnings-title">
            Earnings
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Track your income and payouts</p>
        </div>

        {/* Today's Summary Card */}
        <div
          data-testid="card-today-summary"
          className="bg-primary rounded-2xl p-5"
        >
          <p className="text-white/70 text-xs font-medium mb-4 uppercase tracking-wider">
            Today's Summary
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div data-testid="stat-today-trips" className="text-center">
              <p className="text-white font-bold text-2xl">{todayTrips}</p>
              <p className="text-white/60 text-[11px] mt-0.5">Trips</p>
            </div>
            <div data-testid="stat-today-earnings" className="text-center border-x border-white/15">
              <p className="text-white font-bold text-2xl">${todayEarnings.toFixed(0)}</p>
              <p className="text-white/60 text-[11px] mt-0.5">Earned</p>
            </div>
            <div data-testid="stat-today-tips" className="text-center">
              <p className="text-white font-bold text-2xl">${todayTips.toFixed(0)}</p>
              <p className="text-white/60 text-[11px] mt-0.5">Tips</p>
            </div>
          </div>
        </div>

        {/* Payout Info */}
        <div
          data-testid="card-payout-info"
          className="bg-card rounded-2xl p-4 border border-white/5 flex items-center justify-between"
        >
          <div>
            <p className="text-gray-400 text-xs mb-1">Pending Payout</p>
            <p className="text-white font-bold text-xl" data-testid="text-pending-payout">
              ${pendingPayout.toFixed(2)}
            </p>
            <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Next payout: <span className="text-gray-300">{nextPayoutDate}</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
            <ArrowUpRight className="w-6 h-6 text-primary" />
          </div>
        </div>

        {/* Weekly Chart */}
        <div data-testid="chart-weekly-earnings" className="bg-card rounded-2xl p-4 border border-white/5">
          <p className="text-white font-semibold text-sm mb-4">Last 7 Days</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weeklyData} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#6B7280", fontSize: 11 }}
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar
                dataKey="earnings"
                fill="url(#earningsGradient)"
                radius={[6, 6, 0, 0]}
              />
              <defs>
                <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5B4BC4" stopOpacity={1} />
                  <stop offset="100%" stopColor="#4a3ba3" stopOpacity={0.7} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Lifetime Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={DollarSign}
            label="Lifetime"
            value={`$${totalEarnings >= 1000 ? (totalEarnings / 1000).toFixed(1) + "k" : totalEarnings.toFixed(0)}`}
            sub="Total earned"
          />
          <StatCard
            icon={TrendingUp}
            label="Avg / trip"
            value={`$${avgPerTrip.toFixed(2)}`}
            sub="Per delivery"
            accent="bg-blue-500/15"
          />
          <StatCard
            icon={Award}
            label="Best day"
            value={`$${bestDay.toFixed(0)}`}
            sub="Single day"
            accent="bg-amber-500/15"
          />
        </div>

        {/* Trip History */}
        <div>
          <h2 className="text-white font-semibold text-base mb-3" data-testid="text-trip-history-heading">
            Trip History
          </h2>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card rounded-2xl p-4 border border-white/5 animate-pulse h-20" />
              ))}
            </div>
          ) : tripHistory.length === 0 ? (
            <div className="text-center py-10">
              <Package className="w-10 h-10 text-gray-700 mx-auto mb-2" />
              <p className="text-gray-600 text-sm">No trips yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tripHistory.map((trip) => (
                <div
                  key={trip.id}
                  data-testid={`card-trip-${trip.id}`}
                  className="bg-card rounded-2xl p-4 border border-white/5"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">#{trip.orderNumber}</p>
                      <p className="text-gray-500 text-xs truncate mt-0.5">
                        {trip.pickupAddress.split(",")[0]} → {trip.deliveryAddress.split(",")[0]}
                      </p>
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      <p className="text-green-400 font-bold text-sm" data-testid={`text-trip-earnings-${trip.id}`}>
                        +${trip.earnings.toFixed(2)}
                      </p>
                      {trip.tip > 0 && (
                        <p className="text-amber-400 text-[11px] flex items-center justify-end gap-0.5">
                          <Star className="w-2.5 h-2.5" />
                          ${trip.tip.toFixed(2)} tip
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-600 text-[11px] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(trip.timestamp).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DriverLayout>
  );
}
