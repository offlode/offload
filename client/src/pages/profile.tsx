import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  User, Package, DollarSign, Star, Heart, MapPin, CreditCard,
  Bell, Shield, Settings, HelpCircle, LogOut, ChevronRight,
  Truck, Sun, Moon, LayoutDashboard, X, Check, ChevronDown, ArrowLeft,
  Trash2, Lock, Smartphone, QrCode, Copy, Loader2
} from "lucide-react";
import { CertifiedPanel } from "@/components/ui/certified-panel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/contexts/auth-context";
import type { User as UserType, Address, PaymentMethod, Order, Vendor } from "@shared/schema";
import type { FieldError } from "@/lib/inline-validation";
import { scrollToFirstError, fieldBorderClass } from "@/lib/inline-validation";
import { InlineFieldError } from "@/components/field-error";

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string;
}) {
  return (
    <div className="text-center">
      <div className={`w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function SettingsRow({ icon, label, value, onClick, color, rightElement }: {
  icon: React.ReactNode; label: string; value?: string; onClick?: () => void; color?: string; rightElement?: React.ReactNode;
}) {
  return (
    <button
      className="flex items-center gap-3 py-3 w-full text-left transition-colors hover:bg-muted/30"
      onClick={onClick}
      data-testid={`settings-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color || "bg-primary/10 text-primary"}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {value && <p className="text-xs text-muted-foreground">{value}</p>}
      </div>
      {rightElement || <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
    </button>
  );
}

export default function ProfilePage() {
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user: authUser, logout } = useAuth();
  const userId = authUser?.id;

  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [washPrefsOpen, setWashPrefsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [twoFAOpen, setTwoFAOpen] = useState(false);
  const [twoFASecret, setTwoFASecret] = useState<{ qrUrl: string; secret: string; backupCodes: string[] } | null>(null);
  const [twoFACode, setTwoFACode] = useState("");
  const [twoFASetupDone, setTwoFASetupDone] = useState(false);
  const [disable2FAOpen, setDisable2FAOpen] = useState(false);
  const [disable2FACode, setDisable2FACode] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [profileFieldErrors, setProfileFieldErrors] = useState<FieldError[]>([]);

  const clearProfileError = (field: string) => {
    setProfileFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const handleSaveProfile = () => {
    const errors: FieldError[] = [];
    if (!editName.trim()) errors.push({ field: "editName", message: "Name is required" });
    if (!editEmail.trim()) errors.push({ field: "editEmail", message: "Email is required" });
    if (errors.length > 0) {
      setProfileFieldErrors(errors);
      scrollToFirstError(errors);
      return;
    }
    setProfileFieldErrors([]);
    updateUserMutation.mutate();
  };

  // Notification prefs from backend
  const notifDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: notifPrefs } = useQuery<{
    emailEnabled: boolean;
    smsEnabled: boolean;
    pushEnabled: boolean;
    orderUpdates: boolean;
    promotions: boolean;
    weeklyDigest: boolean;
  }>({
    queryKey: ["/api/notification-preferences"],
    queryFn: async () => {
      const res = await apiRequest("/api/notification-preferences");
      return res.json();
    },
    enabled: !!userId,
  });

  const notifMutation = useMutation({
    mutationFn: async (prefs: {
      emailEnabled: boolean;
      smsEnabled: boolean;
      pushEnabled: boolean;
      orderUpdates: boolean;
      promotions: boolean;
      weeklyDigest: boolean;
    }) => {
      const res = await apiRequest("/api/notification-preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      });
      return res.json();
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] });
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleNotifToggle = useCallback(
    (key: string, value: boolean) => {
      if (!notifPrefs) return;
      const updated = { ...notifPrefs, [key]: value };
      // Optimistic update
      queryClient.setQueryData(["/api/notification-preferences"], updated);
      // Debounce the PUT call
      if (notifDebounceRef.current) clearTimeout(notifDebounceRef.current);
      notifDebounceRef.current = setTimeout(() => {
        notifMutation.mutate(updated);
      }, 500);
    },
    [notifPrefs, notifMutation],
  );

  // Wash prefs (in React state)
  const [washPrefs, setWashPrefs] = useState({
    detergent: "standard",
    foldingStyle: "standard",
    hangers: false,
    fragrance: true,
  });

  const { data: user, isLoading: userLoading } = useQuery<UserType>({
    queryKey: ["/api/users", userId],
    queryFn: async () => {
      const res = await apiRequest(`/api/users/${userId}`);
      return res.json();
    },
    enabled: !!userId,
  });

  // Check if user already has 2FA enabled
  useEffect(() => {
    if (user && (user as any).twoFactorEnabled) {
      setTwoFASetupDone(true);
    }
  }, [user]);

  const { data: addresses } = useQuery<Address[]>({
    queryKey: ["/api/addresses", userId],
    queryFn: async () => {
      const res = await apiRequest(`/api/addresses?userId=${userId}`);
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: paymentMethods } = useQuery<PaymentMethod[]>({
    queryKey: ["/api/payment-methods", userId],
    queryFn: async () => {
      const res = await apiRequest(`/api/payment-methods?userId=${userId}`);
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: orders } = useQuery<Order[]>({
    queryKey: ["/api/orders", `customerId=${userId}`],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders?customerId=${userId}`);
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const updateUserMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName,
          email: editEmail,
          phone: editPhone,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      setEditProfileOpen(false);
      toast({ title: "Profile updated", description: "Your information has been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const saveWashPrefsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          preferredDetergent: washPrefs.detergent,
          preferences: JSON.stringify(washPrefs),
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      setWashPrefsOpen(false);
      toast({ title: "Preferences saved", description: "Your wash preferences have been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/users/me", { method: "DELETE" });
      return res.json();
    },
    onSuccess: () => {
      setDeleteAccountOpen(false);
      setAccountDeleted(true);
      setTimeout(async () => {
        await logout();
        navigate("/login");
      }, 3000);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete account", description: err.message, variant: "destructive" });
    },
  });

  // 2FA setup
  const twoFASetupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/2fa/setup", { method: "POST" });
      return res.json();
    },
    onSuccess: (data) => {
      const uri = data.uri || "";
      const qrUrl = uri
        ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`
        : "";
      setTwoFASecret({
        qrUrl,
        secret: data.secret || "",
        backupCodes: data.backupCodes || [],
      });
    },
    onError: (err: Error) => {
      toast({ title: "2FA setup failed", description: err.message, variant: "destructive" });
    },
  });

  const twoFAVerifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/2fa/verify", {
        method: "POST",
        body: JSON.stringify({ token: twoFACode }),
      });
      return res.json();
    },
    onSuccess: () => {
      setTwoFASetupDone(true);
      toast({ title: "2FA enabled", description: "Your account is now protected with two-factor authentication." });
    },
    onError: (err: Error) => {
      toast({ title: "Invalid code", description: err.message, variant: "destructive" });
    },
  });

  const disable2FAMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/2fa", {
        method: "DELETE",
        body: JSON.stringify({ token: disable2FACode }),
      });
      return res.json();
    },
    onSuccess: () => {
      setTwoFASetupDone(false);
      setDisable2FAOpen(false);
      setDisable2FACode("");
      toast({ title: "2FA disabled", description: "Two-factor authentication has been removed from your account." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to disable 2FA", description: err.message, variant: "destructive" });
    },
  });

  // Favorite vendor = most-used or highest-rated from order history
  const favoriteVendor = vendors?.reduce((best: any, v: any) => {
    if (!best) return v;
    return (v.rating || 0) > (best.rating || 0) ? v : best;
  }, null);

  // Use authoritative user account data, fallback to computed from orders
  const totalOrders = user?.totalOrders || orders?.length || 0;
  const completedOrders = orders?.filter(o => o.status === "delivered") || [];
  const totalSpent = user?.totalSpent || completedOrders.reduce((sum, o) => sum + (o.total || 0), 0);

  const memberDate = user?.memberSince
    ? new Date(user.memberSince).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

  return (
    <div className="pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" data-testid="text-profile-title">Profile</h1>
            <p className="text-sm text-muted-foreground">Your account & preferences</p>
          </div>
          <Button
            variant="secondary"
            size="icon"
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
            aria-label="Toggle theme"
            className="transition-all active:scale-90"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* User Card */}
      <div className="px-5 my-4">
        {userLoading ? (
          <Card className="p-5">
            <div className="flex items-center gap-4">
              <Skeleton className="w-14 h-14 rounded-full" />
              <div>
                <Skeleton className="h-5 w-24 mb-1" />
                <Skeleton className="h-3 w-36 mb-1" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                <User className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="text-base font-bold" data-testid="text-user-name">{user?.name || "User"}</p>
                <p className="text-xs text-muted-foreground">{user?.email || ""}</p>
                {memberDate && <p className="text-[10px] text-muted-foreground mt-0.5">Member since {memberDate}</p>}
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Stats */}
      <div className="px-5 mb-4">
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              icon={<Package className="w-5 h-5" />}
              label="Orders"
              value={String(totalOrders)}
              color="bg-emerald-500/15 text-emerald-400"
            />
            <StatCard
              icon={<DollarSign className="w-5 h-5" />}
              label="Total Spent"
              value={`$${totalSpent.toFixed(2)}`}
              color="bg-emerald-500/15 text-emerald-400"
            />
            <StatCard
              icon={<Star className="w-5 h-5" />}
              label="Rating"
              value={user?.rating != null ? String(user.rating) : "--"}
              color="bg-amber-500/15 text-amber-400"
            />
          </div>
        </Card>
      </div>

      {/* Favorite Vendor Badge */}
      {favoriteVendor && (
        <div className="px-5 mb-4">
          <Card className="p-4 border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Star className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-500 font-semibold">Favorite Vendor</p>
                <p className="text-sm font-bold">{favoriteVendor.name}</p>
                <p className="text-xs text-muted-foreground">{favoriteVendor.rating?.toFixed(1)}★ · {favoriteVendor.reviewCount || 0} reviews</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      <div className="px-5 mb-4">
        <div className="grid grid-cols-3 gap-3">
          <Link href="/orders">
            <Card className="p-3 text-center cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-95" data-testid="card-quick-track">
              <Truck className="w-5 h-5 text-cyan-400 mx-auto mb-1.5" />
              <p className="text-[11px] font-medium">Track Order</p>
            </Card>
          </Link>
          <Card
            className="p-3 text-center cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-95"
            onClick={() => {
              toast({ title: "Favorite Vendors", description: `You have ${vendors?.length || 0} vendors available. Your preferred providers will appear here as you complete more orders.` });
            }}
            data-testid="card-quick-favorites"
          >
            <Heart className="w-5 h-5 text-pink-400 mx-auto mb-1.5" />
            <p className="text-[11px] font-medium">Favorites</p>
          </Card>
          <Card
            className="p-3 text-center cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-95"
            onClick={() => setWashPrefsOpen(true)}
            data-testid="card-quick-wash"
          >
            <Settings className="w-5 h-5 text-primary mx-auto mb-1.5" />
            <p className="text-[11px] font-medium">Wash Settings</p>
          </Card>
        </div>
      </div>

      {/* Account Settings */}
      <div className="px-5 mb-4">
        <h3 className="text-sm font-semibold mb-2">Account Settings</h3>
        <Card className="px-4 divide-y divide-border">
          <SettingsRow
            icon={<User className="w-4 h-4" />}
            label="Personal Information"
            value={user?.name || ""}
            color="bg-blue-500/15 text-blue-400"
            onClick={() => {
              setEditName(user?.name || "");
              setEditEmail(user?.email || "");
              setEditPhone(user?.phone || "");
              setEditProfileOpen(true);
            }}
          />
          <SettingsRow
            icon={<MapPin className="w-4 h-4" />}
            label="Saved Addresses"
            value={`${addresses?.length || 0} addresses`}
            color="bg-cyan-500/15 text-cyan-400"
            onClick={() => navigate("/addresses")}
          />
          <SettingsRow
            icon={<CreditCard className="w-4 h-4" />}
            label="Payment Methods"
            value={`${paymentMethods?.length || 0} on file`}
            color="bg-amber-500/15 text-amber-400"
            onClick={() => navigate("/payments")}
          />
        </Card>
      </div>

      {/* Preferences */}
      <div className="px-5 mb-4">
        <h3 className="text-sm font-semibold mb-2">Preferences</h3>
        <Card className="px-4 divide-y divide-border">
          <SettingsRow
            icon={<Bell className="w-4 h-4" />}
            label="Notifications"
            value="Manage alerts"
            color="bg-primary/15 text-primary"
            onClick={() => navigate("/notifications")}
          />
          <SettingsRow
            icon={<Shield className="w-4 h-4" />}
            label="Offload Certified"
            value="Prefer certified vendors"
            color="bg-amber-500/15 text-amber-400"
            rightElement={
              <Switch
                defaultChecked={true}
                onCheckedChange={(v) => {
                  toast({ title: v ? "Certified mode on" : "Certified mode off", description: v ? "Only certified vendors will be shown." : "All vendors will be shown." });
                }}
                data-testid="toggle-certified-pref"
              />
            }
            onClick={() => {}}
          />
          <SettingsRow
            icon={<Heart className="w-4 h-4" />}
            label="Favorite Vendors"
            value={`${vendors?.length || 0} available`}
            color="bg-red-500/15 text-red-400"
            onClick={() => {
              toast({ title: "Favorite Vendors", description: "Browse and favorite vendors from the schedule page." });
            }}
          />
          <SettingsRow
            icon={<Settings className="w-4 h-4" />}
            label="Custom Wash Preferences"
            value="Set your defaults"
            color="bg-orange-500/15 text-orange-400"
            onClick={() => setWashPrefsOpen(true)}
          />
        </Card>
      </div>

      {/* Two-Factor Authentication */}
      <div className="px-5 mb-4">
        <h3 className="text-sm font-semibold mb-2">Security</h3>
        <Card className="px-4 divide-y divide-border">
          <SettingsRow
            icon={<Lock className="w-4 h-4" />}
            label="Two-Factor Authentication"
            value={twoFASetupDone ? "Enabled" : "Protect your account"}
            color={twoFASetupDone ? "bg-emerald-500/15 text-emerald-400" : "bg-primary/15 text-primary"}
            onClick={() => {
              if (!twoFASetupDone) {
                setTwoFAOpen(true);
                twoFASetupMutation.mutate();
              } else {
                setDisable2FAOpen(true);
              }
            }}
            rightElement={twoFASetupDone ? (
              <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400 text-[10px]">Active</Badge>
            ) : undefined}
          />
        </Card>
      </div>

      {/* Offload Certified Education Panel */}
      <div className="px-5 mb-4">
        <CertifiedPanel />
      </div>

      {/* Support */}
      <div className="px-5 mb-4">
        <h3 className="text-sm font-semibold mb-2">Support</h3>
        <Card className="px-4 divide-y divide-border">
          {(authUser?.role === "admin" || authUser?.role === "manager") && (
            <SettingsRow
              icon={<LayoutDashboard className="w-4 h-4" />}
              label="Admin Dashboard"
              value="Manage operations"
              color="bg-primary/15 text-primary"
              onClick={() => navigate("/admin")}
            />
          )}
          <SettingsRow
            icon={<HelpCircle className="w-4 h-4" />}
            label="Help Center"
            value="FAQs and support"
            color="bg-muted text-muted-foreground"
            onClick={() => navigate("/help")}
          />
          <SettingsRow
            icon={<LogOut className="w-4 h-4" />}
            label="Sign Out"
            color="bg-red-500/15 text-red-400"
            onClick={() => setSignOutOpen(true)}
          />
        </Card>
      </div>

      {/* Danger Zone — Account Deletion */}
      <div className="px-5 mb-4">
        <h3 className="text-sm font-semibold mb-2 text-red-500">Danger Zone</h3>
        <Card className="px-4 border-red-500/20">
          <SettingsRow
            icon={<Trash2 className="w-4 h-4" />}
            label="Delete My Account"
            value="Permanently delete all data"
            color="bg-red-500/15 text-red-500"
            onClick={() => setDeleteAccountOpen(true)}
          />
        </Card>
      </div>

      {/* Edit Profile Sheet */}
      <Sheet open={editProfileOpen} onOpenChange={setEditProfileOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
          <SheetHeader className="flex flex-row items-center gap-3 pb-2">
            <button
              onClick={() => setEditProfileOpen(false)}
              data-testid="button-back-personal-info"
              aria-label="Go back"
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors active:scale-95 -ml-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <SheetTitle className="!mt-0">Personal Information</SheetTitle>
          </SheetHeader>
          <div className="mt-5 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Full Name</Label>
              <Input
                value={editName}
                onChange={e => { setEditName(e.target.value); clearProfileError("editName"); }}
                placeholder="Enter your full name"
                className={`h-12 rounded-xl bg-card ${fieldBorderClass("editName", profileFieldErrors)}`}
                data-testid="input-edit-name"
                data-field="editName"
              />
              <InlineFieldError field="editName" errors={profileFieldErrors} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Email</Label>
              <Input
                type="email"
                value={editEmail}
                onChange={e => { setEditEmail(e.target.value); clearProfileError("editEmail"); }}
                placeholder="Enter your email"
                className={`h-12 rounded-xl bg-card ${fieldBorderClass("editEmail", profileFieldErrors)}`}
                data-testid="input-edit-email"
                data-field="editEmail"
              />
              <InlineFieldError field="editEmail" errors={profileFieldErrors} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Phone</Label>
              <Input
                type="tel"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                placeholder="Enter your phone number"
                className="h-12 rounded-xl bg-card"
                data-testid="input-edit-phone"
              />
            </div>
            <button
              className="w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              disabled={updateUserMutation.isPending}
              onClick={handleSaveProfile}
              data-testid="button-save-profile"
            >
              {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Wash Prefs Sheet */}
      <Sheet open={washPrefsOpen} onOpenChange={setWashPrefsOpen}>
        <SheetContent side="bottom" className="max-h-[60vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Wash Preferences</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Detergent</Label>
              <div className="grid grid-cols-3 gap-2">
                {["standard", "hypoallergenic", "eco"].map(d => (
                  <button
                    key={d}
                    className={`p-2 rounded-lg text-xs font-medium text-center transition-all ${
                      washPrefs.detergent === d
                        ? "bg-primary/10 border-2 border-primary"
                        : "bg-card border border-border hover:border-primary/20"
                    }`}
                    onClick={() => setWashPrefs(p => ({ ...p, detergent: d }))}
                    data-testid={`wash-detergent-${d}`}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Folding Style</Label>
              <div className="grid grid-cols-2 gap-2">
                {["standard", "konmari"].map(f => (
                  <button
                    key={f}
                    className={`p-2 rounded-lg text-xs font-medium text-center transition-all ${
                      washPrefs.foldingStyle === f
                        ? "bg-primary/10 border-2 border-primary"
                        : "bg-card border border-border hover:border-primary/20"
                    }`}
                    onClick={() => setWashPrefs(p => ({ ...p, foldingStyle: f }))}
                    data-testid={`wash-folding-${f}`}
                  >
                    {f === "konmari" ? "KonMari" : "Standard"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Use Hangers</p>
                <p className="text-xs text-muted-foreground">Hang dress shirts and blouses</p>
              </div>
              <Switch
                checked={washPrefs.hangers}
                onCheckedChange={(v) => setWashPrefs(p => ({ ...p, hangers: v }))}
                data-testid="toggle-wash-hangers"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Add Fragrance</p>
                <p className="text-xs text-muted-foreground">Light lavender scent</p>
              </div>
              <Switch
                checked={washPrefs.fragrance}
                onCheckedChange={(v) => setWashPrefs(p => ({ ...p, fragrance: v }))}
                data-testid="toggle-wash-fragrance"
              />
            </div>
            <Button
              className="w-full"
              disabled={saveWashPrefsMutation.isPending}
              onClick={() => saveWashPrefsMutation.mutate()}
              data-testid="button-save-wash-prefs"
            >
              {saveWashPrefsMutation.isPending ? "Saving..." : "Save Preferences"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Help Center Sheet */}
      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Help Center</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <Accordion type="single" collapsible>
              <AccordionItem value="1">
                <AccordionTrigger className="text-sm" data-testid="faq-1">How does Offload work?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  Schedule a pickup, and our driver collects your laundry. It's washed by a certified vendor and delivered back fresh and folded — usually within 48 hours.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="2">
                <AccordionTrigger className="text-sm" data-testid="faq-2">What's "Offload Certified"?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  Certified vendors meet our quality standards for care, speed, and reliability. We regularly audit them to ensure your clothes are treated with the best care.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="3">
                <AccordionTrigger className="text-sm" data-testid="faq-3">Can I cancel an order?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  Yes! You can cancel orders that are pending, confirmed, or have a driver assigned. Once pickup starts, cancellation is no longer available.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="4">
                <AccordionTrigger className="text-sm" data-testid="faq-4">How do I file a dispute?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  After delivery, open the order details and tap "File a Dispute". Describe the issue and our team will review it within 24 hours.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="5">
                <AccordionTrigger className="text-sm" data-testid="faq-5">What bag sizes are available?</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  We offer Small (up to 10 lbs, $24.99), Medium (up to 20 lbs, $44.99), Large (up to 30 lbs, $59.99), and XL (up to 50 lbs, $89.99) bags. If your laundry goes slightly over, it's just $2.50 per additional pound.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </SheetContent>
      </Sheet>

      {/* 2FA Setup Sheet */}
      <Sheet open={twoFAOpen} onOpenChange={setTwoFAOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Enable Two-Factor Authentication</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {twoFASetupMutation.isPending ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Setting up...</span>
              </div>
            ) : twoFASecret ? (
              <>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                  </p>
                  {twoFASecret.qrUrl ? (
                    <div className="flex justify-center mb-3">
                      <img
                        src={twoFASecret.qrUrl}
                        alt="2FA QR Code"
                        className="w-48 h-48 rounded-lg bg-white p-2"
                      />
                    </div>
                  ) : (
                    <Card className="p-4 mb-3">
                      <div className="flex items-center justify-center gap-2">
                        <QrCode className="w-5 h-5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">QR code unavailable — use manual entry</p>
                      </div>
                    </Card>
                  )}
                  {twoFASecret.secret && (
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{twoFASecret.secret}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(twoFASecret.secret);
                          toast({ title: "Copied!", description: "Secret key copied to clipboard." });
                        }}
                        className="p-1 rounded hover:bg-muted"
                      >
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Backup codes */}
                {twoFASecret.backupCodes.length > 0 && (
                  <Card className="p-4">
                    <p className="text-xs font-semibold mb-2">Backup Codes — save these somewhere safe</p>
                    <div className="grid grid-cols-2 gap-1">
                      {twoFASecret.backupCodes.map((code, i) => (
                        <code key={i} className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded text-center">{code}</code>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Verify */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Enter the 6-digit code from your app</Label>
                  <Input
                    value={twoFACode}
                    onChange={e => setTwoFACode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="h-12 text-center text-lg font-mono tracking-widest"
                    maxLength={6}
                    data-testid="input-2fa-code"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={twoFACode.length !== 6 || twoFAVerifyMutation.isPending}
                  onClick={() => twoFAVerifyMutation.mutate()}
                  data-testid="button-verify-2fa"
                >
                  {twoFAVerifyMutation.isPending ? "Verifying..." : "Enable 2FA"}
                </Button>
              </>
            ) : (
              <p className="text-sm text-destructive text-center">Failed to initialize 2FA setup. Please try again.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Disable 2FA Confirmation */}
      <AlertDialog open={disable2FAOpen} onOpenChange={setDisable2FAOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Two-Factor Authentication</AlertDialogTitle>
            <AlertDialogDescription>
              Enter your current 6-digit authenticator code to disable 2FA.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              value={disable2FACode}
              onChange={e => setDisable2FACode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="h-12 text-center text-lg font-mono tracking-widest"
              maxLength={6}
              data-testid="input-disable-2fa-code"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDisable2FACode("")}
              data-testid="button-disable-2fa-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disable2FAMutation.mutate()}
              disabled={disable2FACode.length !== 6 || disable2FAMutation.isPending}
              className="bg-red-500 text-white hover:bg-red-600 focus:ring-red-500"
              data-testid="button-disable-2fa-confirm"
            >
              {disable2FAMutation.isPending ? "Disabling..." : "Disable 2FA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sign Out Confirmation */}
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need to log back in to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-signout-cancel">Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setSignOutOpen(false);
                await logout();
                navigate("/login");
                toast({ title: "Signed out", description: "See you next time!" });
              }}
              data-testid="button-signout-confirm"
            >
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Account Confirmation */}
      <AlertDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500">Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete your account? This cannot be undone. All your orders, payment methods, saved addresses, and personal data will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAccountMutation.mutate()}
              disabled={deleteAccountMutation.isPending}
              className="bg-red-500 text-white hover:bg-red-600 focus:ring-red-500"
              data-testid="button-delete-confirm"
            >
              {deleteAccountMutation.isPending ? "Deleting..." : "Yes, Delete My Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Account Deleted Success Screen */}
      {accountDeleted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
          <div className="text-center px-8">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold mb-2">Your account has been deleted.</h2>
            <p className="text-sm text-muted-foreground">Goodbye. Redirecting...</p>
          </div>
        </div>
      )}
    </div>
  );
}
