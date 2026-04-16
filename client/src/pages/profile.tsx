import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  User, Package, DollarSign, Star, Heart, MapPin, CreditCard,
  Bell, Shield, Settings, HelpCircle, LogOut, ChevronRight,
  Truck, Sun, Moon, LayoutDashboard, X, Check, ChevronDown, ArrowLeft
} from "lucide-react";
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

  // Notification prefs (in React state since no backend)
  const [notifPrefs, setNotifPrefs] = useState({
    orderUpdates: true,
    promotions: true,
    driverMessages: true,
    email: true,
    push: true,
  });

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
              value={String(user?.rating || 5.0)}
              color="bg-amber-500/15 text-amber-400"
            />
          </div>
        </Card>
      </div>

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
              toast({ title: "Favorite Vendors", description: `You have ${vendors?.length || 0} vendors available. Favorites coming soon!` });
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
            onClick={() => setNotifOpen(true)}
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
            onClick={() => setHelpOpen(true)}
          />
          <SettingsRow
            icon={<LogOut className="w-4 h-4" />}
            label="Sign Out"
            color="bg-red-500/15 text-red-400"
            onClick={() => setSignOutOpen(true)}
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

      {/* Notifications Sheet */}
      <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
        <SheetContent side="bottom" className="max-h-[60vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Notification Preferences</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {[
              { key: "orderUpdates" as const, label: "Order Updates", desc: "Status changes and delivery alerts" },
              { key: "promotions" as const, label: "Promotions", desc: "Deals and special offers" },
              { key: "driverMessages" as const, label: "Driver Messages", desc: "Messages from your driver" },
              { key: "email" as const, label: "Email Notifications", desc: "Receive updates by email" },
              { key: "push" as const, label: "Push Notifications", desc: "Real-time mobile alerts" },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={notifPrefs[item.key]}
                  onCheckedChange={(v) => setNotifPrefs(p => ({ ...p, [item.key]: v }))}
                  data-testid={`toggle-notif-${item.key}`}
                />
              </div>
            ))}
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
              onClick={() => {
                setWashPrefsOpen(false);
                toast({ title: "Preferences saved", description: "Your wash preferences have been updated." });
              }}
              data-testid="button-save-wash-prefs"
            >
              Save Preferences
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
                  We offer Small (10 lbs, $15), Medium (15 lbs, $22), Large (20 lbs, $30), and Extra Large (25 lbs, $40) bags. Pick the size that fits your load.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </SheetContent>
      </Sheet>

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
    </div>
  );
}
