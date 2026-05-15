import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import { OffloadLogo } from "@/components/offload-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CLOTHING_TYPES, DEFAULT_PREFS,
} from "./profile/useProfileData";
import type { ClothingPrefs } from "./profile/useProfileData";

export default function WashPreferencesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const userId = user?.id;

  const [washPrefs, setWashPrefs] = useState<Record<string, ClothingPrefs>>(() => {
    const initial: Record<string, ClothingPrefs> = {};
    CLOTHING_TYPES.forEach(type => { initial[type] = { ...DEFAULT_PREFS }; });
    return initial;
  });

  const { data: userData } = useQuery({
    queryKey: ["/api/users", userId],
    queryFn: async () => {
      const res = await apiRequest(`/api/users/${userId}`);
      return res.json();
    },
    enabled: !!userId,
  });

  // Hydrate wash prefs from user data
  useEffect(() => {
    if (userData?.preferences && typeof userData.preferences === "object") {
      setWashPrefs(prev => {
        const merged: Record<string, ClothingPrefs> = { ...prev };
        for (const type of CLOTHING_TYPES) {
          if (userData.preferences[type]) {
            merged[type] = { ...DEFAULT_PREFS, ...userData.preferences[type] };
          }
        }
        return merged;
      });
    }
  }, [userData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ preferences: JSON.stringify(washPrefs) }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      toast({ title: t("wash_prefs.saved") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button
            onClick={() => navigate("/profile")}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <OffloadLogo size={24} />
            <h1 className="text-base font-bold">{t("wash_prefs.title")}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <p className="text-sm text-muted-foreground mb-6">{t("wash_prefs.subtitle")}</p>

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
                    <Label className="text-xs text-muted-foreground mb-1 block">{t("wash_prefs.water_temp")}</Label>
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
                    <Label className="text-xs text-muted-foreground mb-1 block">{t("wash_prefs.dry_method")}</Label>
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
                    <Label className="text-xs text-muted-foreground mb-1 block">{t("wash_prefs.detergent")}</Label>
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
                    <Label className="text-xs text-muted-foreground">{t("wash_prefs.softener")}</Label>
                    <Switch
                      checked={prefs.softener}
                      onCheckedChange={(v) => updateType("softener", v)}
                    />
                  </div>
                  {/* Bleach */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">{t("wash_prefs.bleach")}</Label>
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
                    <Label className="text-xs text-muted-foreground mb-1 block">{t("wash_prefs.starch")}</Label>
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
                    <Label className="text-xs text-muted-foreground mb-1 block">{t("wash_prefs.fold_style")}</Label>
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
                    <Label className="text-xs text-muted-foreground mb-1 block">{t("wash_prefs.notes")}</Label>
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

        <Button
          className="w-full mt-6"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          data-testid="button-save-wash-prefs"
        >
          {saveMutation.isPending ? t("wash_prefs.saving") : t("wash_prefs.save_all")}
        </Button>
      </div>
    </div>
  );
}
