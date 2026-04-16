import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  Store,
  Truck,
  LayoutGrid,
} from "lucide-react";
import ManagerLayout from "./layout";
import { useToast } from "@/hooks/use-toast";

interface VendorBreakdown {
  vendorId: number;
  vendorName: string;
  orders: number;
  revenue: number;
  payout: number;
  pending: number;
}

interface EarningsData {
  totalRevenue: number;
  totalVendorPayouts: number;
  totalDriverPayouts: number;
  platformRevenue: number;
  vendorBreakdown: VendorBreakdown[];
}

function StatCard({
  label,
  value,
  icon,
  iconBg,
  valueColor = "text-white",
  testId,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  valueColor?: string;
  testId?: string;
}) {
  return (
    <div className="bg-card rounded-2xl p-4 border border-white/5" data-testid={testId}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-xl ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-gray-500 text-xs mt-0.5">{label}</p>
    </div>
  );
}

export default function ManagerPayouts() {
  const { toast } = useToast();

  const { data: earnings, isLoading } = useQuery<EarningsData>({
    queryKey: ["/api/manager/earnings"],
  });

  const handleProcessPayout = (vendorName: string, amount: number) => {
    toast({
      title: "Payout processed",
      description: `$${amount.toFixed(2)} payout initiated for ${vendorName}`,
    });
  };

  return (
    <ManagerLayout>
      <div className="px-5 pt-6 pb-8 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/manager">
            <button
              data-testid="btn-back"
              className="w-9 h-9 rounded-full bg-card flex items-center justify-center border border-white/5"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white">Payouts</h1>
            <p className="text-gray-500 text-xs">Revenue breakdown and vendor payouts</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : earnings ? (
          <>
            {/* Revenue Overview Cards */}
            <div className="grid grid-cols-2 gap-3" data-testid="earnings-overview">
              <StatCard
                label="Total Revenue"
                value={`$${earnings.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                icon={<DollarSign className="w-4 h-4 text-green-400" />}
                iconBg="bg-green-500/10"
                valueColor="text-green-400"
                testId="text-total-revenue"
              />
              <StatCard
                label="Platform Revenue"
                value={`$${earnings.platformRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                icon={<TrendingUp className="w-4 h-4 text-primary" />}
                iconBg="bg-primary/10"
                valueColor="text-primary"
                testId="text-platform-revenue"
              />
              <StatCard
                label="Vendor Payouts"
                value={`$${earnings.totalVendorPayouts.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                icon={<Store className="w-4 h-4 text-blue-400" />}
                iconBg="bg-blue-500/10"
                valueColor="text-blue-400"
                testId="text-vendor-payouts"
              />
              <StatCard
                label="Driver Payouts"
                value={`$${earnings.totalDriverPayouts.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                icon={<Truck className="w-4 h-4 text-orange-400" />}
                iconBg="bg-orange-500/10"
                valueColor="text-orange-400"
                testId="text-driver-payouts"
              />
            </div>

            {/* Vendor Breakdown Table */}
            <div
              className="bg-card rounded-2xl border border-white/5 overflow-hidden"
              data-testid="vendor-breakdown"
            >
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                <LayoutGrid className="w-4 h-4 text-gray-400" />
                <h3 className="text-white font-semibold text-sm">Vendor Breakdown</h3>
              </div>

              {earnings.vendorBreakdown.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No vendor data available
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {earnings.vendorBreakdown.map((v) => (
                    <div
                      key={v.vendorId}
                      className="px-4 py-3"
                      data-testid={`vendor-row-${v.vendorId}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-white font-medium text-sm">{v.vendorName}</p>
                          <p className="text-gray-500 text-xs">{v.orders} orders completed</p>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-semibold text-sm">
                            ${v.revenue.toFixed(2)}
                          </p>
                          <p className="text-gray-500 text-[10px]">revenue</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex gap-4 text-xs">
                          <span className="text-gray-400">
                            Payout:{" "}
                            <span className="text-blue-400 font-medium">
                              ${v.payout.toFixed(2)}
                            </span>
                          </span>
                          {v.pending > 0 && (
                            <span className="text-gray-400">
                              Pending:{" "}
                              <span className="text-yellow-400 font-medium">
                                ${v.pending.toFixed(2)}
                              </span>
                            </span>
                          )}
                        </div>
                        <button
                          data-testid={`btn-process-payout-${v.vendorId}`}
                          onClick={() => handleProcessPayout(v.vendorName, v.pending > 0 ? v.pending : v.payout)}
                          className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                        >
                          Process Payout
                        </button>
                      </div>

                      {/* Revenue bar */}
                      {earnings.totalRevenue > 0 && (
                        <div className="mt-2">
                          <div className="w-full bg-[#333] rounded-full h-1">
                            <div
                              className="bg-primary h-1 rounded-full transition-all"
                              style={{
                                width: `${Math.min((v.revenue / earnings.totalRevenue) * 100, 100)}%`,
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-gray-600 mt-0.5">
                            {((v.revenue / earnings.totalRevenue) * 100).toFixed(1)}% of total
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Global Process All Payouts */}
            <button
              data-testid="btn-process-all-payouts"
              onClick={() =>
                toast({
                  title: "All payouts processed",
                  description: `$${earnings.totalVendorPayouts.toFixed(2)} in vendor payouts initiated`,
                })
              }
              className="w-full py-3 rounded-full bg-green-500 text-white font-semibold text-sm hover:bg-green-600 transition-colors"
            >
              Process All Pending Payouts
            </button>
          </>
        ) : (
          <div className="text-center py-12 text-gray-500 text-sm">
            Failed to load earnings data
          </div>
        )}
      </div>
    </ManagerLayout>
  );
}
