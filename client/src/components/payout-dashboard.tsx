import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, Clock, CreditCard, Check, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";

interface PayoutDashboardProps {
  userType: "vendor" | "driver";
  entityId: number; // vendorId or driverId
}

export function PayoutDashboard({ userType, entityId }: PayoutDashboardProps) {
  const { user } = useAuth();

  // Fetch earnings data
  const earningsEndpoint = userType === "vendor"
    ? `/api/vendor/earnings?vendorId=${entityId}`
    : `/api/driver/earnings?driverId=${entityId}`;

  const { data: earnings, isLoading: earningsLoading } = useQuery<any>({
    queryKey: [earningsEndpoint],
    enabled: !!entityId,
  });

  // Fetch Stripe Connect status
  const { data: connectStatus } = useQuery<any>({
    queryKey: [`/api/payments/connect-status/${user?.id}`],
    enabled: !!user?.id,
  });

  const totalEarnings = userType === "vendor"
    ? (earnings?.totalRevenue || earnings?.totalPayout || 0)
    : (earnings?.totalEarnings || 0);
  const pendingPayout = userType === "vendor"
    ? (earnings?.pendingPayout || 0)
    : (earnings?.pendingPayout || 0);
  const todayEarnings = userType === "driver"
    ? (earnings?.todayEarnings || 0)
    : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          Earnings & Payouts
        </h3>
        {!connectStatus?.stripeReady && (
          <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-400">Setup Required</Badge>
        )}
      </div>

      {/* Stats Cards */}
      {earningsLoading ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <p className="text-xs text-muted-foreground">Total Earnings</p>
            </div>
            <p className="text-xl font-bold" data-testid="text-total-earnings">
              ${totalEarnings.toFixed(2)}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <p className="text-xs text-muted-foreground">Pending Payout</p>
            </div>
            <p className="text-xl font-bold text-amber-400" data-testid="text-pending-payout">
              ${pendingPayout.toFixed(2)}
            </p>
          </Card>

          {userType === "driver" && (
            <>
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <p className="text-xs text-muted-foreground">Today</p>
                </div>
                <p className="text-xl font-bold">${todayEarnings.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground">{earnings?.todayTrips || 0} trips</p>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-4 h-4 text-blue-400" />
                  <p className="text-xs text-muted-foreground">Per Trip</p>
                </div>
                <p className="text-xl font-bold">$8.50</p>
                <p className="text-[10px] text-muted-foreground">{earnings?.totalTrips || 0} total trips</p>
              </Card>
            </>
          )}

          {userType === "vendor" && (
            <>
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <p className="text-xs text-muted-foreground">Revenue</p>
                </div>
                <p className="text-xl font-bold">${(earnings?.totalRevenue || 0).toFixed(2)}</p>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-4 h-4 text-blue-400" />
                  <p className="text-xs text-muted-foreground">Orders</p>
                </div>
                <p className="text-xl font-bold">{earnings?.completedOrders || 0}</p>
                <p className="text-[10px] text-muted-foreground">{earnings?.activeOrders || 0} active</p>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Stripe Connect Card */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            connectStatus?.connected ? "bg-emerald-500/15" : "bg-primary/10"
          }`}>
            {connectStatus?.connected ? (
              <Check className="w-5 h-5 text-emerald-400" />
            ) : (
              <CreditCard className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="flex-1">
            {connectStatus?.connected ? (
              <>
                <p className="text-sm font-semibold text-emerald-400">Stripe Connected</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Account: {connectStatus.accountId?.substring(0, 15)}...
                </p>
                <div className="flex gap-1.5 mt-2">
                  {connectStatus.payoutsEnabled && (
                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-400">Payouts Enabled</Badge>
                  )}
                  {connectStatus.chargesEnabled && (
                    <Badge variant="secondary" className="text-[10px] bg-blue-500/15 text-blue-400">Charges Enabled</Badge>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">Payout onboarding unavailable</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Vendor payout onboarding is not yet available. Please contact support.
                </p>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Payout Split Info */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-3">Payout Structure</h4>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform Fee</span>
            <span>18%</span>
          </div>
          {userType === "vendor" && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vendor Share</span>
              <span className="font-semibold text-emerald-400">65% of remaining</span>
            </div>
          )}
          {userType === "driver" && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Driver Share</span>
              <span className="font-semibold text-emerald-400">$8.50/trip</span>
            </div>
          )}
          <div className="pt-2 border-t border-border text-[10px] text-muted-foreground">
            Payouts are processed weekly.
          </div>
        </div>
      </Card>
    </div>
  );
}
