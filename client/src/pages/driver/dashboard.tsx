import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  CheckCircle2,
  MapPin,
  DollarSign,
  Star,
  Navigation,
  MessageSquare,
  Package,
  Clock,
} from "lucide-react";
import DriverLayout from "./layout";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { NotificationBell } from "@/components/notification-bell";
import type { Driver, Order, User } from "@shared/schema";

type FilterTab = "all" | "pickup" | "delivery";

type EarningsData = {
  driverId: number;
  driverName: string;
  totalTrips: number;
  todayTrips: number;
  todayEarnings: number;
  totalEarnings: number;
  pendingPayout: number;
  rating: number | null;
};

const statusLabels: Record<string, string> = {
  driver_assigned: "PICKUP",
  pickup_in_progress: "PICKUP",
  picked_up: "IN TRANSIT",
  out_for_delivery: "DELIVERY",
  delivered: "COMPLETED",
};

const statusColors: Record<string, string> = {
  PICKUP: "bg-primary/20 text-primary",
  "IN TRANSIT": "bg-blue-500/20 text-blue-400",
  DELIVERY: "bg-orange-500/20 text-orange-400",
  COMPLETED: "bg-green-500/20 text-green-400",
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function parseBags(bags: string): { type: string; quantity: number; price: number }[] {
  try {
    return JSON.parse(bags);
  } catch {
    return [];
  }
}

function getStatusLabel(status: string): string {
  return statusLabels[status] || status.toUpperCase().replace(/_/g, " ");
}

export default function DriverDashboard() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const { user, isAuthenticated } = useAuth();

  const userId = user?.id;

  // Fetch driver record by userId
  const { data: driver } = useQuery<Driver>({
    queryKey: ["/api/drivers/user", userId],
    queryFn: async () => {
      const res = await apiRequest(`/api/drivers/user/${userId}`);
      return res.json();
    },
    enabled: !!userId && isAuthenticated,
  });

  const driverId = driver?.id;

  // Fetch assigned orders
  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders", `driverId=${driverId}`],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders?driverId=${driverId}`);
      return res.json();
    },
    enabled: !!driverId,
  });

  // Fetch earnings
  const { data: earnings } = useQuery<EarningsData>({
    queryKey: ["/api/driver/earnings", driverId],
    queryFn: async () => {
      const res = await apiRequest(`/api/driver/earnings?driverId=${driverId}`);
      return res.json();
    },
    enabled: !!driverId,
  });

  // Fetch customer info for each order
  const customerIds = Array.from(new Set(orders.map((o) => o.customerId)));
  const { data: customers = [] } = useQuery<User[]>({
    queryKey: ["/api/driver-customers", ...customerIds],
    queryFn: async () => {
      const results = await Promise.all(
        customerIds.map(async (id) => {
          try {
            const res = await apiRequest(`/api/users/${id}`);
            return res.json();
          } catch {
            return null;
          }
        })
      );
      return results.filter(Boolean);
    },
    enabled: customerIds.length > 0,
  });

  // Redirect if not authenticated (after all hooks)
  if (!isAuthenticated) {
    navigate("/login");
    return null;
  }

  const customerMap = new Map(customers.map((c: User) => [c.id, c]));

  const activeOrders = orders.filter(
    (o) => !["delivered", "cancelled"].includes(o.status)
  );

  const filteredOrders =
    activeTab === "all"
      ? activeOrders
      : activeTab === "pickup"
      ? activeOrders.filter((o) =>
          ["driver_assigned", "pickup_in_progress"].includes(o.status)
        )
      : activeOrders.filter((o) =>
          ["out_for_delivery"].includes(o.status)
        );

  const driverName = driver?.name || user?.name || "Driver";

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pickup", label: "Pickup" },
    { key: "delivery", label: "Delivery" },
  ];

  const completedToday = orders.filter((o) => {
    if (o.status !== "delivered" || !o.deliveredAt) return false;
    return new Date(o.deliveredAt).toDateString() === new Date().toDateString();
  });

  return (
    <DriverLayout>
      <div className="px-5 pt-14 space-y-6">
        {/* Greeting + Notification Bell */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white" data-testid="driver-greeting">
            {getGreeting()}, {driverName} 👋
          </h1>
          <NotificationBell />
        </div>

        {/* Today's Performance Card */}
        <div
          className="bg-primary rounded-2xl p-5"
          data-testid="performance-card"
        >
          <p className="text-white/80 text-xs font-medium mb-4">Today's Performance</p>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="flex justify-center mb-1">
                <CheckCircle2 className="w-4 h-4 text-white/80" />
              </div>
              <p className="text-white font-bold text-sm" data-testid="stat-completed">
                {earnings?.todayTrips ?? completedToday.length}
              </p>
              <p className="text-white/60 text-[10px]">Completed</p>
            </div>
            <div className="text-center">
              <div className="flex justify-center mb-1">
                <MapPin className="w-4 h-4 text-white/80" />
              </div>
              <p className="text-white font-bold text-sm" data-testid="stat-trips">
                {earnings?.totalTrips ?? 0}
              </p>
              <p className="text-white/60 text-[10px]">Total Trips</p>
            </div>
            <div className="text-center">
              <div className="flex justify-center mb-1">
                <DollarSign className="w-4 h-4 text-white/80" />
              </div>
              <p className="text-white font-bold text-sm" data-testid="stat-earnings">
                ${earnings?.todayEarnings?.toFixed(0) ?? "0"}
              </p>
              <p className="text-white/60 text-[10px]">Today</p>
            </div>
            <div className="text-center">
              <div className="flex justify-center mb-1">
                <Star className="w-4 h-4 text-white/80" />
              </div>
              <p className="text-white font-bold text-sm" data-testid="stat-rating">
                {earnings?.rating?.toFixed(1) ?? driver?.rating?.toFixed(1) ?? "—"}
              </p>
              <p className="text-white/60 text-[10px]">Rating</p>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2" data-testid="driver-filter-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              data-testid={`tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-white text-black"
                  : "bg-muted text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Your Routes */}
        <div>
          <h2 className="text-white font-semibold text-base mb-3" data-testid="routes-heading">
            Your Routes ({filteredOrders.length})
          </h2>

          {ordersLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => {
                const bags = parseBags(order.bags);
                const totalBags = bags.reduce((sum, b) => sum + (b.quantity || 1), 0);
                const label = getStatusLabel(order.status);
                const colorClass = statusColors[label] || "bg-gray-500/20 text-gray-400";
                const street = order.pickupAddress.split(",")[0];
                const customer = customerMap.get(order.customerId);
                const customerName = customer?.name || `Customer #${order.customerId}`;

                const scheduledTime = order.scheduledPickup
                  ? new Date(order.scheduledPickup).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "—";

                return (
                  <div
                    key={order.id}
                    data-testid={`route-card-${order.id}`}
                    className="bg-card rounded-2xl p-4 border border-white/5"
                  >
                    {/* Top: badge + time */}
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${colorClass}`}
                        data-testid={`badge-status-${order.id}`}
                      >
                        {label}
                      </span>
                      <span className="text-gray-500 text-xs flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {scheduledTime}
                      </span>
                    </div>

                    {/* Customer */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">
                        {customerName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm" data-testid={`text-customer-${order.id}`}>
                          {customerName}
                        </p>
                        <p className="text-gray-500 text-xs truncate">{street}</p>
                      </div>
                    </div>

                    {/* Order info */}
                    <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        {order.orderNumber}
                      </span>
                      <span>{totalBags} bag{totalBags > 1 ? "s" : ""}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Link href={`/driver/order/${order.id}`} className="flex-1">
                        <button
                          data-testid={`btn-view-details-${order.id}`}
                          className="w-full py-2.5 rounded-full border border-white/10 text-white text-sm font-medium hover:bg-white/5 transition-colors"
                        >
                          View Details
                        </button>
                      </Link>
                      <Link href={`/driver/navigation/${order.id}`} className="flex-1">
                        <button
                          data-testid={`btn-start-pickup-${order.id}`}
                          className="w-full py-2.5 rounded-full bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                          Navigate
                        </button>
                      </Link>
                    </div>
                  </div>
                );
              })}

              {filteredOrders.length === 0 && (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No routes found</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Completed Today */}
        {completedToday.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-base mb-3" data-testid="completed-heading">
              Completed Today ({completedToday.length})
            </h2>
            <div className="space-y-2">
              {completedToday.map((order) => {
                const customer = customerMap.get(order.customerId);
                const customerName = customer?.name || `Customer #${order.customerId}`;
                return (
                  <div
                    key={order.id}
                    data-testid={`completed-card-${order.id}`}
                    className="bg-card rounded-xl p-3 border border-white/5 flex items-center gap-3"
                  >
                    <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{customerName}</p>
                      <p className="text-gray-500 text-xs">{order.orderNumber}</p>
                    </div>
                    <span className="text-green-400 text-xs font-medium">
                      ${order.driverPayout?.toFixed(2) ?? "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Action Cards */}
        <div>
          <h2 className="text-white font-semibold text-base mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              data-testid="quick-action-navigation"
              className="bg-card rounded-2xl p-4 border border-white/5 text-left hover:bg-muted transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
                <Navigation className="w-5 h-5 text-blue-400" />
              </div>
              <p className="text-white text-sm font-medium">Navigation</p>
              <p className="text-gray-500 text-xs mt-0.5">Open maps app</p>
            </button>
            <button
              data-testid="quick-action-messages"
              className="bg-card rounded-2xl p-4 border border-white/5 text-left hover:bg-muted transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mb-3">
                <MessageSquare className="w-5 h-5 text-green-400" />
              </div>
              <p className="text-white text-sm font-medium">Messages</p>
              <p className="text-gray-500 text-xs mt-0.5">Customer support</p>
            </button>
          </div>
        </div>
      </div>
    </DriverLayout>
  );
}
