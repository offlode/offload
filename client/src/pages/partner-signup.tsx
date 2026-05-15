import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Building2, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import { OffloadLogo } from "@/components/offload-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

export default function PartnerSignupPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    businessName: "",
    businessLegalEntity: "",
    ein: "",
    addressLine: "",
    city: "",
    state: "",
    zip: "",
    numberOfWashers: "",
    numberOfDryers: "",
    dailyCapacityLbs: "",
    servicesOfferedJson: "",
    operatingHoursJson: "",
    yearsInBusiness: "",
    agreesToQualityStandards: false,
    agreesToPricing: false,
    agreesToTermsOfService: false,
    agreesToBackgroundCheck: false,
    whyJoin: "",
  });

  const setField = (key: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const body = {
        applicantType: "laundromat" as const,
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        businessName: form.businessName || null,
        businessLegalEntity: form.businessLegalEntity || null,
        ein: form.ein || null,
        addressLine: form.addressLine || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        numberOfWashers: form.numberOfWashers ? Number(form.numberOfWashers) : null,
        numberOfDryers: form.numberOfDryers ? Number(form.numberOfDryers) : null,
        dailyCapacityLbs: form.dailyCapacityLbs ? Number(form.dailyCapacityLbs) : null,
        servicesOfferedJson: form.servicesOfferedJson || null,
        operatingHoursJson: form.operatingHoursJson || null,
        yearsInBusiness: form.yearsInBusiness ? Number(form.yearsInBusiness) : null,
        agreesToQualityStandards: form.agreesToQualityStandards ? 1 : 0,
        agreesToPricing: form.agreesToPricing ? 1 : 0,
        agreesToTermsOfService: form.agreesToTermsOfService ? 1 : 0,
        agreesToBackgroundCheck: form.agreesToBackgroundCheck ? 1 : 0,
        whyJoin: form.whyJoin || null,
      };
      const res = await fetch(`${API_BASE}/api/partner-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Submission failed" }));
        throw new Error(err.error || "Submission failed");
      }
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: err.message || t("common.error"), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-3">{t("partner.success_title")}</h1>
          <p className="text-sm text-muted-foreground mb-8">{t("partner.success_message")}</p>
          <Button onClick={() => navigate("/login")} className="w-full">
            {t("partner.back_to_login")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button
            onClick={() => navigate("/login")}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <OffloadLogo size={24} />
            <h1 className="text-base font-bold">{t("partner.title")}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{t("partner.heading")}</h2>
            <p className="text-xs text-muted-foreground">{t("partner.subheading")}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Contact Info */}
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">{t("partner.contact_info")}</h3>
            <div>
              <Label className="text-xs">{t("partner.full_name")} *</Label>
              <Input required value={form.fullName} onChange={e => setField("fullName", e.target.value)} className="h-10 mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("partner.email")} *</Label>
              <Input required type="email" value={form.email} onChange={e => setField("email", e.target.value)} className="h-10 mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("partner.phone")} *</Label>
              <Input required type="tel" value={form.phone} onChange={e => setField("phone", e.target.value)} className="h-10 mt-1" />
            </div>
          </Card>

          {/* Business Info */}
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">{t("partner.business_info")}</h3>
            <div>
              <Label className="text-xs">{t("partner.business_name")}</Label>
              <Input value={form.businessName} onChange={e => setField("businessName", e.target.value)} className="h-10 mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("partner.legal_entity")}</Label>
              <Input value={form.businessLegalEntity} onChange={e => setField("businessLegalEntity", e.target.value)} className="h-10 mt-1" placeholder="LLC, Corp, etc." />
            </div>
            <div>
              <Label className="text-xs">{t("partner.ein")}</Label>
              <Input value={form.ein} onChange={e => setField("ein", e.target.value)} className="h-10 mt-1" />
            </div>
          </Card>

          {/* Address */}
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">{t("partner.address")}</h3>
            <div>
              <Label className="text-xs">{t("partner.address_line")}</Label>
              <Input value={form.addressLine} onChange={e => setField("addressLine", e.target.value)} className="h-10 mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t("partner.city")}</Label>
                <Input value={form.city} onChange={e => setField("city", e.target.value)} className="h-10 mt-1" />
              </div>
              <div>
                <Label className="text-xs">{t("partner.state")}</Label>
                <Input value={form.state} onChange={e => setField("state", e.target.value)} className="h-10 mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t("partner.zip")}</Label>
              <Input value={form.zip} onChange={e => setField("zip", e.target.value)} className="h-10 mt-1" />
            </div>
          </Card>

          {/* Equipment & Capacity */}
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">{t("partner.equipment")}</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t("partner.num_washers")}</Label>
                <Input type="number" min="0" value={form.numberOfWashers} onChange={e => setField("numberOfWashers", e.target.value)} className="h-10 mt-1" />
              </div>
              <div>
                <Label className="text-xs">{t("partner.num_dryers")}</Label>
                <Input type="number" min="0" value={form.numberOfDryers} onChange={e => setField("numberOfDryers", e.target.value)} className="h-10 mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t("partner.daily_capacity")}</Label>
              <Input type="number" min="0" value={form.dailyCapacityLbs} onChange={e => setField("dailyCapacityLbs", e.target.value)} className="h-10 mt-1" placeholder="lbs/day" />
            </div>
            <div>
              <Label className="text-xs">{t("partner.services_offered")}</Label>
              <Input value={form.servicesOfferedJson} onChange={e => setField("servicesOfferedJson", e.target.value)} className="h-10 mt-1" placeholder="Wash & fold, dry cleaning, ..." />
            </div>
            <div>
              <Label className="text-xs">{t("partner.operating_hours")}</Label>
              <Input value={form.operatingHoursJson} onChange={e => setField("operatingHoursJson", e.target.value)} className="h-10 mt-1" placeholder="Mon-Fri 7am-9pm, Sat-Sun 8am-6pm" />
            </div>
            <div>
              <Label className="text-xs">{t("partner.years_in_business")}</Label>
              <Input type="number" min="0" value={form.yearsInBusiness} onChange={e => setField("yearsInBusiness", e.target.value)} className="h-10 mt-1" />
            </div>
          </Card>

          {/* Why Join */}
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">{t("partner.why_join")}</h3>
            <Input value={form.whyJoin} onChange={e => setField("whyJoin", e.target.value)} className="h-10" placeholder={t("partner.why_join_placeholder")} />
          </Card>

          {/* Agreements */}
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">{t("partner.agreements")}</h3>
            <div className="flex items-center justify-between">
              <Label className="text-xs flex-1">{t("partner.agree_quality")}</Label>
              <Switch checked={form.agreesToQualityStandards} onCheckedChange={v => setField("agreesToQualityStandards", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs flex-1">{t("partner.agree_pricing")}</Label>
              <Switch checked={form.agreesToPricing} onCheckedChange={v => setField("agreesToPricing", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs flex-1">{t("partner.agree_tos")}</Label>
              <Switch checked={form.agreesToTermsOfService} onCheckedChange={v => setField("agreesToTermsOfService", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs flex-1">{t("partner.agree_background")}</Label>
              <Switch checked={form.agreesToBackgroundCheck} onCheckedChange={v => setField("agreesToBackgroundCheck", v)} />
            </div>
          </Card>

          <Button type="submit" className="w-full h-12" disabled={isLoading}>
            {isLoading ? t("partner.submitting") : t("partner.submit")}
          </Button>
        </form>
      </div>
    </div>
  );
}
