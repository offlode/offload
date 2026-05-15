import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import type { User as UserType, Address, PaymentMethod, Order, Vendor } from "@shared/schema";
import type { FieldError } from "@/lib/inline-validation";
import { scrollToFirstError } from "@/lib/inline-validation";

export const CLOTHING_TYPES = [
  "shirts", "pants", "underwear", "bedding", "towels", "delicates", "baby clothing", "mixed",
] as const;

export type ClothingType = typeof CLOTHING_TYPES[number];

export interface ClothingPrefs {
  temp: string;
  dry: string;
  detergent: string;
  softener: boolean;
  bleach: string;
  starch: string;
  fold: string;
  notes: string;
}

export const DEFAULT_PREFS: ClothingPrefs = {
  temp: "cold",
  dry: "medium heat",
  detergent: "standard",
  softener: false,
  bleach: "never",
  starch: "none",
  fold: "standard",
  notes: "",
};

export function useProfileData() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user: authUser, logout } = useAuth();
  const userId = authUser?.id;

  // ── Sheet/dialog open states ──
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [washPrefsOpen, setWashPrefsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [twoFAOpen, setTwoFAOpen] = useState(false);
  const [disable2FAOpen, setDisable2FAOpen] = useState(false);

  // C4: Handle ?openWashPrefs=1&returnTo=wizard URL params
  const [returnToWizard, setReturnToWizard] = useState(false);
  useEffect(() => {
    const hashSearch = window.location.hash.split("?")[1] || "";
    const params = new URLSearchParams(hashSearch);
    if (params.get("openWashPrefs") === "1") {
      setWashPrefsOpen(true);
      if (params.get("returnTo") === "wizard") {
        setReturnToWizard(true);
      }
    }
  }, []);

  // ── 2FA state ──
  const [twoFASecret, setTwoFASecret] = useState<{ qrUrl: string; secret: string; backupCodes: string[] } | null>(null);
  const [twoFACode, setTwoFACode] = useState("");
  const [twoFASetupDone, setTwoFASetupDone] = useState(false);
  const [disable2FACode, setDisable2FACode] = useState("");

  // ── Profile edit state ──
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [profileFieldErrors, setProfileFieldErrors] = useState<FieldError[]>([]);

  const clearProfileError = (field: string) => {
    setProfileFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  // ── Certified vendor preference ──
  const [certifiedOnly, setCertifiedOnly] = useState<boolean>(() => {
    const stored = localStorage.getItem("offload_certified_only");
    return stored !== null ? stored === "true" : true;
  });

  // ── Wash prefs ──
  const [washPrefs, setWashPrefs] = useState<Record<string, ClothingPrefs>>(() => {
    const initial: Record<string, ClothingPrefs> = {};
    CLOTHING_TYPES.forEach(type => { initial[type] = { ...DEFAULT_PREFS }; });
    return initial;
  });

  // ── Preferred laundromat ──
  const [preferredLaundromatId, setPreferredLaundromatId] = useState<string>("");

  // ── Queries ──
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

  // ── Effects ──
  useEffect(() => {
    if (user && (user as any).twoFactorEnabled) {
      setTwoFASetupDone(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const saved = (user as any)?.preferences;
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      const hasClothingTypes = CLOTHING_TYPES.some(type => saved[type] && typeof saved[type] === "object");
      if (hasClothingTypes) {
        setWashPrefs(prev => {
          const updated = { ...prev };
          CLOTHING_TYPES.forEach(type => {
            if (saved[type] && typeof saved[type] === "object") {
              updated[type] = { ...DEFAULT_PREFS, ...saved[type] };
            }
          });
          return updated;
        });
      }
    }
  }, [user]);

  useEffect(() => {
    if (user && (user as any).preferredLaundromatId) {
      setPreferredLaundromatId(String((user as any).preferredLaundromatId));
    }
  }, [user]);

  // ── Mutations ──
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
      queryClient.setQueryData(["/api/notification-preferences"], updated);
      if (notifDebounceRef.current) clearTimeout(notifDebounceRef.current);
      notifDebounceRef.current = setTimeout(() => {
        notifMutation.mutate(updated);
      }, 500);
    },
    [notifPrefs, notifMutation],
  );

  const savePreferredLaundromat = useMutation({
    mutationFn: async (laundromatId: string) => {
      const res = await apiRequest("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ preferred_laundromat_id: laundromatId || null }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      toast({ title: "Preferred laundromat saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName, email: editEmail, phone: editPhone }),
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
        body: JSON.stringify({ preferences: JSON.stringify(washPrefs) }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      setWashPrefsOpen(false);
      toast({ title: "Preferences saved", description: "Your wash preferences have been updated." });
      if (returnToWizard) {
        setReturnToWizard(false);
        setTimeout(() => navigate("/order/new"), 600);
      }
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
      setTwoFASecret({ qrUrl, secret: data.secret || "", backupCodes: data.backupCodes || [] });
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

  // ── Computed values ──
  const favoriteVendor = vendors?.reduce((best: any, v: any) => {
    if (!best) return v;
    return (v.rating || 0) > (best.rating || 0) ? v : best;
  }, null);

  const totalOrders = user?.totalOrders || orders?.length || 0;
  const completedOrders = orders?.filter(o => o.status === "delivered") || [];
  const totalSpent = user?.totalSpent || completedOrders.reduce((sum, o) => sum + (o.total || 0), 0);

  const memberDate = user?.memberSince
    ? new Date(user.memberSince).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

  return {
    // Auth
    authUser, userId, logout,
    // Navigation
    navigate, toast,
    // Data
    user, userLoading, addresses, paymentMethods, orders, vendors, notifPrefs,
    // Computed
    favoriteVendor, totalOrders, totalSpent, memberDate,
    // Sheet/dialog states
    editProfileOpen, setEditProfileOpen,
    washPrefsOpen, setWashPrefsOpen,
    helpOpen, setHelpOpen,
    signOutOpen, setSignOutOpen,
    deleteAccountOpen, setDeleteAccountOpen,
    accountDeleted, setAccountDeleted,
    twoFAOpen, setTwoFAOpen,
    disable2FAOpen, setDisable2FAOpen,
    // Profile edit
    editName, setEditName, editEmail, setEditEmail, editPhone, setEditPhone,
    profileFieldErrors, clearProfileError, handleSaveProfile, updateUserMutation,
    // Wash prefs
    washPrefs, setWashPrefs, saveWashPrefsMutation,
    // Certified
    certifiedOnly, setCertifiedOnly,
    // Preferred laundromat
    preferredLaundromatId, setPreferredLaundromatId, savePreferredLaundromat,
    // Notifications
    handleNotifToggle,
    // 2FA
    twoFASecret, twoFACode, setTwoFACode, twoFASetupDone,
    twoFASetupMutation, twoFAVerifyMutation,
    disable2FACode, setDisable2FACode, disable2FAMutation,
    // Account
    deleteAccountMutation,
  };
}
