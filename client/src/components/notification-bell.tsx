import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Bell, Check, CheckCheck, Trash2,
  Package, Truck, MapPin, UserCheck, Droplets, Wind, Shirt,
  PackageCheck, Building, ClipboardCheck, Calendar, XCircle, CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Notification } from "@shared/schema";

const ICON_MAP: Record<string, typeof Bell> = {
  Calendar, UserCheck, Truck, MapPin, Package, Building,
  ClipboardCheck, Droplets, Wind, Shirt, PackageCheck,
  Check, CheckCircle, XCircle, Bell,
};

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  order_update: "Orders",
  driver_update: "Driver",
  system: "System",
  payment: "Payments",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "border-l-4 border-l-red-500",
  normal: "",
  low: "opacity-80",
};

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [, navigate] = useLocation();

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const res = await apiRequest(`/api/notifications?userId=${user.id}`);
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 15000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count", user?.id],
    queryFn: async () => {
      if (!user) return { count: 0 };
      const res = await apiRequest(`/api/notifications/unread-count?userId=${user.id}`);
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 15000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/notifications/${id}/read`, { method: "PATCH" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await apiRequest("/api/notifications/mark-all-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/notifications/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const unreadCount = unreadData?.count || 0;

  const filteredNotifications = activeCategory === "all"
    ? notifications
    : notifications.filter(n => (n as any).category === activeCategory || n.type === activeCategory);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markReadMutation.mutate(notification.id);
    }
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
      setOpen(false);
    }
  };

  function getIcon(notification: Notification) {
    const iconName = (notification as any).icon;
    if (iconName && ICON_MAP[iconName]) {
      const Icon = ICON_MAP[iconName];
      return <Icon className="w-4 h-4" />;
    }
    // Fallback to type-based icons
    const typeIcons: Record<string, string> = {
      order_update: "Package",
      consent_request: "ClipboardCheck",
      payment: "Check",
      sla_warning: "Bell",
      review_request: "CheckCircle",
      new_message: "Bell",
    };
    const fallbackIcon = typeIcons[notification.type];
    if (fallbackIcon && ICON_MAP[fallbackIcon]) {
      const Icon = ICON_MAP[fallbackIcon];
      return <Icon className="w-4 h-4" />;
    }
    return <Bell className="w-4 h-4" />;
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[360px] p-0 bg-card border-border">
        <SheetHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
          <SheetTitle className="text-white">Notifications</SheetTitle>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-primary text-xs"
              onClick={() => markAllReadMutation.mutate()}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          )}
        </SheetHeader>

        {/* Category Filter Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-border overflow-x-auto scrollbar-none">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeCategory === key
                  ? "bg-primary/20 text-primary"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              data-testid={`filter-${key}`}
            >
              {label}
            </button>
          ))}
        </div>

        <ScrollArea className="h-[calc(100vh-130px)]">
          {filteredNotifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-[#333]">
              {filteredNotifications.map((n) => (
                <div
                  key={n.id}
                  className={`relative group ${PRIORITY_COLORS[(n as any).priority || "normal"]}`}
                >
                  <button
                    className={`w-full text-left p-4 hover:bg-muted transition-colors ${
                      !n.read ? "bg-card/50" : ""
                    }`}
                    onClick={() => handleNotificationClick(n)}
                    data-testid={`notification-${n.id}`}
                  >
                    <div className="flex gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        !n.read ? "bg-primary/20 text-primary" : "bg-[#333] text-gray-400"
                      }`}>
                        {getIcon(n)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium truncate ${!n.read ? "text-white" : "text-gray-400"}`}>
                            {n.title}
                          </p>
                          {!n.read && (
                            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-primary" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                        <p className="text-[10px] text-gray-600 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                  {/* Delete button (visible on hover) */}
                  <button
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-red-500/10 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(n.id);
                    }}
                    data-testid={`delete-notification-${n.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-gray-500 hover:text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
