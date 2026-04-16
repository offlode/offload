import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Search,
  SlidersHorizontal,
  Package,
  TrendingUp,
  Clock,
  CheckCircle2,
} from "lucide-react";
import ManagerLayout from "./layout";
import { NotificationBell } from "@/components/notification-bell";
import { apiRequest } from "@/lib/queryClient";
import type { Order, User } from "@shared/schema";

type FilterTab = "all" | "active" | "delivered" | "cancelled";

const statusDisplay: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-500/15 text-yellow-400" },
  confirmed: { label: "Confirmed", className: "bg-blue-500/15 text-blue-400" },
  driver_assigned: { label: "Driver Assigned", className: "bg-primary/15 text-primary" },
  driver_en_route_pickup: { label: "Driver Picking Up", className: "bg-primary/15 text-primary" },
  pickup_in_progress: { label: "Pickup In Progress", className: "bg-blue-500/15 text-blue-400" },
  picked_up: { label: "Picked Up", className: "bg-green-500/15 text-green-400" },
  at_laundromat: { label: "At Laundromat", className: "bg-blue-500/15 text-blue-400" },
  weighing: { label: "Weighing", className: "bg-blue-500/15 text-blue-400" },
  washing: { label: "Washing", className: "bg-blue-500/15 text-blue-400" },
  drying: { label: "Drying", className: "bg-blue-500/15 text-blue-400" },
  folding: { label: "Folding", className: "bg-blue-500/15 text-blue-400" },
  wash_complete: { label: "Wash Complete", className: "bg-green-500/15 text-green-400" },
  packing: { label: "Packing", className: "bg-blue-500/15 text-blue-400" },
  ready_for_delivery: { label: "Ready for Delivery", className: "bg-primary/15 text-primary" },
  driver_en_route_delivery: { label: "Out for Delivery", className: "bg-orange-500/15 text-orange-400" },
  out_for_delivery: { label: "Out for Delivery", className: "bg-orange-500/15 text-orange-400" },
  delivered: { label: "Delivered", className: "bg-green-500/15 text-green-400" },
  cancelled: { label: "Cancelled", className: "bg-red-500/15 text-red-400" },
};

function parseBags(bags: string): { type: string; quantity: number; price: number }[] {
  try {
    return JSON.parse(bags);
  } catch {
    return [];
  }
}

function formatBagType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
}

const activeStatuses = [
  "confirmed",
  "driver_assigned",
  "pickup_in_progress",
  "picked_up",
  "at_laundromat",
  "washing",
  "wash_complete",
  "packing",
  "ready_for_delivery",
  "out_for_delivery",
  "pending",
];

export default function ManagerOrders() {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  // Fetch customer data for all unique customer IDs
  const customerIds = Array.from(new Set(orders.map((o) => o.customerId)));
  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/manager-customers", ...customerIds],
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

  const userMap = new Map(allUsers.map((u: User) => [u.id, u]));

  // Metrics
  const totalOrders = orders.length;
  const activeCount = orders.filter((o) => activeStatuses.includes(o.status)).length;
  const completedCount = orders.filter((o) => o.status === "delivered").length;

  const filteredOrders = orders
    .filter((o) => {
      if (activeTab === "active") return activeStatuses.includes(o.status);
      if (activeTab === "delivered") return o.status === "delivered";
      if (activeTab === "cancelled") return o.status === "cancelled";
      return true;
    })
    .filter((o) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const cust = userMap.get(o.customerId);
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        (cust?.name || "").toLowerCase().includes(q) ||
        o.pickupAddress.toLowerCase().includes(q)
      );
    });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "delivered", label: "Delivered" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <ManagerLayout>
      <div className="px-5 pt-14 pb-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <h1 className="text-xl font-bold text-white" data-testid="manager-orders-title">
              Orders
            </h1>
            <p className="text-gray-500 text-sm">Manage your laundry orders</p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              data-testid="btn-search"
              onClick={() => setSearchOpen(!searchOpen)}
              className="w-9 h-9 rounded-full bg-card flex items-center justify-center border border-white/5"
            >
              <Search className="w-4 h-4 text-gray-400" />
            </button>
            <button
              data-testid="btn-filter"
              className="w-9 h-9 rounded-full bg-card flex items-center justify-center border border-white/5"
            >
              <SlidersHorizontal className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="mt-3 mb-2">
            <input
              data-testid="input-search"
              type="text"
              placeholder="Search orders, customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-white/5 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
              autoFocus
            />
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-3 gap-2 mt-4 mb-4">
          <div
            className="bg-card rounded-xl p-3 border border-white/5 text-center"
            data-testid="metric-total-orders"
          >
            <div className="flex justify-center mb-1">
              <Package className="w-4 h-4 text-primary" />
            </div>
            <p className="text-white font-bold text-lg leading-none">{totalOrders}</p>
            <p className="text-gray-500 text-[10px] mt-0.5">Total</p>
          </div>
          <div
            className="bg-card rounded-xl p-3 border border-white/5 text-center"
            data-testid="metric-active-orders"
          >
            <div className="flex justify-center mb-1">
              <Clock className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-white font-bold text-lg leading-none">{activeCount}</p>
            <p className="text-gray-500 text-[10px] mt-0.5">Active</p>
          </div>
          <div
            className="bg-card rounded-xl p-3 border border-white/5 text-center"
            data-testid="metric-completed-orders"
          >
            <div className="flex justify-center mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            </div>
            <p className="text-white font-bold text-lg leading-none">{completedCount}</p>
            <p className="text-gray-500 text-[10px] mt-0.5">Completed</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-none" data-testid="manager-filter-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              data-testid={`tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? "bg-white text-black"
                  : "bg-muted text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Order Cards */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const bags = parseBags(order.bags);
              const customer = userMap.get(order.customerId);
              const customerName = customer?.name || `Customer #${order.customerId}`;
              const status = statusDisplay[order.status] || {
                label: order.status,
                className: "bg-gray-500/15 text-gray-400",
              };
              const bagSummary = bags
                .map((b) => `${b.quantity}x ${formatBagType(b.type)} bag`)
                .join(" | ");

              return (
                <div
                  key={order.id}
                  data-testid={`order-card-${order.id}`}
                  className="bg-card rounded-2xl p-4 border border-white/5"
                >
                  {/* Top: avatar + name + price */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {customerName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm">{customerName}</p>
                      <p className="text-gray-500 text-xs">{order.orderNumber}</p>
                    </div>
                    <p className="text-white font-semibold text-sm">
                      ${order.total?.toFixed(2)}
                    </p>
                  </div>

                  {/* Status badge + date */}
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${status.className}`}
                      data-testid={`order-status-${order.id}`}
                    >
                      {status.label}
                    </span>
                    <span className="text-gray-600 text-[10px]">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Bags */}
                  <div className="text-xs text-gray-400 mb-1">
                    <span className="text-gray-500">Bags: </span>
                    {bagSummary || "—"}
                  </div>

                  {/* Special instructions */}
                  {order.customerNotes && (
                    <p className="text-xs text-gray-500 mb-3">
                      <span className="text-gray-400">Notes: </span>
                      {order.customerNotes}
                    </p>
                  )}

                  {/* Payment status */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-gray-500 text-xs">Payment:</span>
                    <span
                      className={`text-xs font-medium ${
                        order.paymentStatus === "paid"
                          ? "text-green-400"
                          : order.paymentStatus === "failed"
                          ? "text-red-400"
                          : "text-yellow-400"
                      }`}
                      data-testid={`order-payment-${order.id}`}
                    >
                      {order.paymentStatus || "pending"}
                    </span>
                  </div>

                  {/* View Details */}
                  <button
                    data-testid={`btn-view-details-${order.id}`}
                    className="w-full mt-2 py-2.5 rounded-full border border-white/10 text-white text-sm font-medium hover:bg-white/5 transition-colors"
                  >
                    View Details
                  </button>
                </div>
              );
            })}

            {filteredOrders.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No orders found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </ManagerLayout>
  );
}
