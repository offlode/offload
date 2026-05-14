import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, Settings, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

// P0-7: Flat 6-field shape matching backend + profile.tsx
interface NotifPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  orderUpdates: boolean;
  promotions: boolean;
  weeklyDigest: boolean;
}

const DEFAULT_PREFS: NotifPreferences = {
  emailEnabled: true,
  smsEnabled: false,
  pushEnabled: true,
  orderUpdates: true,
  promotions: true,
  weeklyDigest: false,
};

const FILTER_OPTIONS = ["All", "Order", "Delivery", "Promo"] as const;

function notifIcon(type: string) {
  if (type.includes("order") || type.includes("status")) return "bg-blue-500/15 text-blue-400";
  if (type.includes("delivery") || type.includes("driver")) return "bg-emerald-500/15 text-emerald-400";
  if (type.includes("promo") || type.includes("loyalty")) return "bg-amber-500/15 text-amber-400";
  return "bg-primary/15 text-primary";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<"inbox" | "settings">("inbox");
  const [filter, setFilter] = useState("All");

  // Fetch notifications
  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
  });

  // Fetch preferences (flat shape)
  const { data: serverPrefs } = useQuery<NotifPreferences>({
    queryKey: ["/api/notification-preferences"],
    enabled: !!user && tab === "settings",
  });

  const [localPrefs, setLocalPrefs] = useState<NotifPreferences>(DEFAULT_PREFS);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // P1-8: Hydrate localPrefs from server on first load
  useEffect(() => {
    if (serverPrefs) setLocalPrefs(serverPrefs);
  }, [serverPrefs]);

  const effectivePrefs = localPrefs;

  // Save preferences (debounced)
  const saveMutation = useMutation({
    mutationFn: async (updated: NotifPreferences) => {
      await apiRequest("/api/notification-preferences", {
        method: "PUT",
        body: JSON.stringify(updated),
      });
    },
    onError: () => {
      toast({ title: "Failed to save preferences", variant: "destructive" });
    },
  });

  const togglePref = useCallback((key: keyof NotifPreferences) => {
    setLocalPrefs(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => saveMutation.mutate(updated), 800);
      return updated;
    });
  }, [saveMutation]);

  // P1-15: Mark read uses PATCH, matching notification-bell.tsx
  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/notifications/${id}/read`, { method: "PATCH" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const filteredNotifs = notifications?.filter(n => {
    if (filter === "All") return true;
    return n.type.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div className="pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-xl font-bold" data-testid="text-notif-title">Notifications</h1>
        <p className="text-sm text-muted-foreground">Stay updated on your orders</p>
      </div>

      {/* Tabs */}
      <div className="px-5 mb-4">
        <div className="flex bg-muted rounded-xl p-1 gap-1">
          <button
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === "inbox" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            }`}
            onClick={() => setTab("inbox")}
            data-testid="tab-inbox"
          >
            <Inbox className="w-4 h-4 inline-block mr-1.5" />
            Inbox
          </button>
          <button
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === "settings" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            }`}
            onClick={() => setTab("settings")}
            data-testid="tab-settings"
          >
            <Settings className="w-4 h-4 inline-block mr-1.5" />
            Settings
          </button>
        </div>
      </div>

      {tab === "inbox" ? (
        <>
          {/* Filter chips */}
          <div className="px-5 mb-4 flex gap-2">
            {FILTER_OPTIONS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                data-testid={`filter-${f.toLowerCase()}`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Notification list */}
          <div className="px-5 space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))
            ) : filteredNotifs && filteredNotifs.length > 0 ? (
              filteredNotifs.map(n => (
                <Card
                  key={n.id}
                  className={`p-4 cursor-pointer transition-all duration-200 hover:border-primary/30 ${
                    !n.read ? "border-l-2 border-l-primary bg-primary/5" : ""
                  }`}
                  onClick={() => !n.read && markReadMutation.mutate(n.id)}
                  data-testid={`notif-${n.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${notifIcon(n.type)}`}>
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm ${!n.read ? "font-semibold" : "font-medium"}`}>
                          {n.title}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    </div>
                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                    )}
                  </div>
                </Card>
              ))
            ) : (
              <Card className="p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">No notifications yet</p>
                <p className="text-xs text-muted-foreground">
                  We'll notify you when there's something new.
                </p>
              </Card>
            )}
          </div>
        </>
      ) : (
        /* Settings tab — flat 6 booleans */
        <div className="px-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            Choose how you'd like to be notified.
          </p>

          {/* Channels section */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Channels</p>
            <Card className="p-4 space-y-4">
              {([
                { key: "pushEnabled" as const, label: "Push Notifications", desc: "Real-time mobile alerts" },
                { key: "emailEnabled" as const, label: "Email Notifications", desc: "Receive updates by email" },
                { key: "smsEnabled" as const, label: "SMS Notifications", desc: "Receive updates by text message" },
              ] as const).map(item => (
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch
                    checked={effectivePrefs[item.key]}
                    onCheckedChange={() => togglePref(item.key)}
                    data-testid={`pref-${item.key}`}
                  />
                </div>
              ))}
            </Card>
          </div>

          {/* What to receive section */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">What to Receive</p>
            <Card className="p-4 space-y-4">
              {([
                { key: "orderUpdates" as const, label: "Order Updates", desc: "Status changes and delivery alerts" },
                { key: "promotions" as const, label: "Promotions", desc: "Deals and special offers" },
                { key: "weeklyDigest" as const, label: "Weekly Digest", desc: "Weekly summary of activity" },
              ] as const).map(item => (
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch
                    checked={effectivePrefs[item.key]}
                    onCheckedChange={() => togglePref(item.key)}
                    data-testid={`pref-${item.key}`}
                  />
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
