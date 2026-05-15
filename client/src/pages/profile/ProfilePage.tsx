import { Link } from "wouter";
import {
  User, Package, DollarSign, Star, Heart, MapPin, CreditCard,
  Bell, Shield, Settings, HelpCircle, LogOut, ChevronRight,
  Truck, Sun, Moon, LayoutDashboard, Check, Globe, Trash2, Lock,
} from "lucide-react";
import { CertifiedPanel } from "@/components/ui/certified-panel";
import { useI18n } from "@/i18n";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "@/components/theme-provider";
import { useProfileData, CLOTHING_TYPES, DEFAULT_PREFS } from "./useProfileData";
import type { ClothingPrefs } from "./useProfileData";
import { ProfileSecurity } from "./ProfileSecurity";
import { ProfileSettings } from "./ProfileSettings";

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
  const { language, setLanguage } = useI18n();
  const data = useProfileData();

  const {
    authUser, navigate, toast,
    user, userLoading, addresses, paymentMethods, vendors,
    favoriteVendor, totalOrders, totalSpent, memberDate,
    editProfileOpen, setEditProfileOpen,
    washPrefsOpen, setWashPrefsOpen,
    helpOpen, setHelpOpen,
    signOutOpen, setSignOutOpen,
    deleteAccountOpen, setDeleteAccountOpen,
    accountDeleted,
    twoFAOpen, setTwoFAOpen,
    disable2FAOpen, setDisable2FAOpen,
    twoFASetupDone, twoFASetupMutation,
    editName, setEditName, editEmail, setEditEmail, editPhone, setEditPhone,
    profileFieldErrors, clearProfileError, handleSaveProfile, updateUserMutation,
    washPrefs, setWashPrefs, saveWashPrefsMutation,
    certifiedOnly, setCertifiedOnly,
    preferredLaundromatId, setPreferredLaundromatId, savePreferredLaundromat,
    twoFASecret, twoFACode, setTwoFACode, twoFAVerifyMutation,
    disable2FACode, setDisable2FACode, disable2FAMutation,
    deleteAccountMutation, logout, notifPrefs, handleNotifToggle,
  } = data;

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
              value={userLoading ? "--" : String(totalOrders)}
              color="bg-emerald-500/15 text-emerald-400"
            />
            <StatCard
              icon={<DollarSign className="w-5 h-5" />}
              label="Total Spent"
              value={userLoading ? "--" : `$${totalSpent.toFixed(2)}`}
              color="bg-emerald-500/15 text-emerald-400"
            />
            <div aria-label={user?.rating != null ? `Rating: ${Number(user.rating).toFixed(1)} out of 5` : "Rating not available"}>
              <StatCard
                icon={<Star className="w-5 h-5" />}
                label="Rating"
                value={user?.rating != null ? Number(user.rating).toFixed(1) : "--"}
                color="bg-amber-500/15 text-amber-400"
              />
            </div>
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
                <p className="text-xs text-amber-500 font-semibold">Top-rated vendor</p>
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
            id="wash-prefs"
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
          <SettingsRow
            icon={<Globe className="w-4 h-4" />}
            label="Language"
            value={language === "en" ? "English" : "Español"}
            color="bg-sky-500/15 text-sky-400"
            onClick={() => {
              setLanguage(language === "en" ? "es" : "en");
              toast({ title: language === "en" ? "Idioma cambiado a Español" : "Language changed to English" });
            }}
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
                id="certified"
                checked={certifiedOnly}
                onCheckedChange={(v) => {
                  setCertifiedOnly(v);
                  localStorage.setItem("offload_certified_only", String(v));
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
            label="Wash Preferences"
            value="Per-clothing-type wash settings"
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
      <ProfileSettings
        editProfileOpen={editProfileOpen}
        setEditProfileOpen={setEditProfileOpen}
        editName={editName}
        setEditName={setEditName}
        editEmail={editEmail}
        setEditEmail={setEditEmail}
        editPhone={editPhone}
        setEditPhone={setEditPhone}
        profileFieldErrors={profileFieldErrors}
        clearProfileError={clearProfileError}
        handleSaveProfile={handleSaveProfile}
        updateUserMutation={updateUserMutation}
      />

      {/* Wash Prefs Sheet — Per-clothing-type structured editor */}
      <Sheet open={washPrefsOpen} onOpenChange={setWashPrefsOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Wash Preferences</SheetTitle>
            <p className="text-xs text-muted-foreground">Set preferences per clothing type. These apply automatically to all future orders.</p>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            <Accordion type="single" collapsible className="space-y-1">
              {CLOTHING_TYPES.map(type => {
                const prefs = washPrefs[type] || DEFAULT_PREFS;
                const updateType = (key: keyof ClothingPrefs, value: string | boolean) => {
                  setWashPrefs(prev => ({
                    ...prev,
                    [type]: { ...(prev[type] || DEFAULT_PREFS), [key]: value },
                  }));
                };
                return (
                  <AccordionItem key={type} value={type} className="border rounded-xl px-3">
                    <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline" data-testid={`wash-prefs-${type}`}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pb-3">
                      {/* Water Temperature */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Water Temperature</Label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {["cold", "warm", "hot"].map(v => (
                            <button
                              key={v}
                              className={`p-1.5 rounded-lg text-xs font-medium text-center transition-all ${
                                prefs.temp === v
                                  ? "bg-primary/10 border-2 border-primary"
                                  : "bg-card border border-border hover:border-primary/20"
                              }`}
                              onClick={() => updateType("temp", v)}
                            >
                              {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Dry Method */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Dry Method</Label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {["low heat", "medium heat", "high heat", "hang dry", "no dry"].map(v => (
                            <button
                              key={v}
                              className={`p-1.5 rounded-lg text-[10px] font-medium text-center transition-all ${
                                prefs.dry === v
                                  ? "bg-primary/10 border-2 border-primary"
                                  : "bg-card border border-border hover:border-primary/20"
                              }`}
                              onClick={() => updateType("dry", v)}
                            >
                              {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Detergent */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Detergent</Label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {["standard", "hypoallergenic", "scented", "unscented"].map(v => (
                            <button
                              key={v}
                              className={`p-1.5 rounded-lg text-xs font-medium text-center transition-all ${
                                prefs.detergent === v
                                  ? "bg-primary/10 border-2 border-primary"
                                  : "bg-card border border-border hover:border-primary/20"
                              }`}
                              onClick={() => updateType("detergent", v)}
                            >
                              {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Softener */}
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Softener</Label>
                        <Switch
                          checked={prefs.softener}
                          onCheckedChange={(v) => updateType("softener", v)}
                        />
                      </div>
                      {/* Bleach */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Bleach</Label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {["never", "standard", "chlorine-free"].map(v => (
                            <button
                              key={v}
                              className={`p-1.5 rounded-lg text-[10px] font-medium text-center transition-all ${
                                prefs.bleach === v
                                  ? "bg-primary/10 border-2 border-primary"
                                  : "bg-card border border-border hover:border-primary/20"
                              }`}
                              onClick={() => updateType("bleach", v)}
                            >
                              {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Starch */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Starch</Label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {["none", "light", "medium", "heavy"].map(v => (
                            <button
                              key={v}
                              className={`p-1.5 rounded-lg text-[10px] font-medium text-center transition-all ${
                                prefs.starch === v
                                  ? "bg-primary/10 border-2 border-primary"
                                  : "bg-card border border-border hover:border-primary/20"
                              }`}
                              onClick={() => updateType("starch", v)}
                            >
                              {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Fold Style */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Fold Style</Label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {["standard", "hung", "rolled"].map(v => (
                            <button
                              key={v}
                              className={`p-1.5 rounded-lg text-xs font-medium text-center transition-all ${
                                prefs.fold === v
                                  ? "bg-primary/10 border-2 border-primary"
                                  : "bg-card border border-border hover:border-primary/20"
                              }`}
                              onClick={() => updateType("fold", v)}
                            >
                              {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Notes */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Notes</Label>
                        <Input
                          value={prefs.notes}
                          onChange={e => updateType("notes", e.target.value)}
                          placeholder={`Special instructions for ${type}...`}
                          className="h-9 text-xs"
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {/* Preferred Laundromat */}
            {vendors && vendors.length > 0 && (
              <div className="pt-2">
                <Label className="text-xs text-muted-foreground mb-1 block">Preferred Laundromat</Label>
                <Select
                  value={preferredLaundromatId}
                  onValueChange={(v) => {
                    setPreferredLaundromatId(v);
                    savePreferredLaundromat.mutate(v);
                  }}
                >
                  <SelectTrigger className="h-11 text-sm" data-testid="select-preferred-laundromat">
                    <SelectValue placeholder="No preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No preference</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.name}{v.certified ? " (Certified)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              className="w-full mt-4"
              disabled={saveWashPrefsMutation.isPending}
              onClick={() => saveWashPrefsMutation.mutate()}
              data-testid="button-save-wash-prefs"
            >
              {saveWashPrefsMutation.isPending ? "Saving..." : "Save All Preferences"}
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

      {/* 2FA Sheets */}
      <ProfileSecurity
        twoFAOpen={twoFAOpen}
        setTwoFAOpen={setTwoFAOpen}
        twoFASetupMutation={twoFASetupMutation}
        twoFASecret={twoFASecret}
        twoFACode={twoFACode}
        setTwoFACode={setTwoFACode}
        twoFAVerifyMutation={twoFAVerifyMutation}
        disable2FAOpen={disable2FAOpen}
        setDisable2FAOpen={setDisable2FAOpen}
        disable2FACode={disable2FACode}
        setDisable2FACode={setDisable2FACode}
        disable2FAMutation={disable2FAMutation}
        toast={toast}
      />

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
