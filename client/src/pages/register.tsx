import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";
import type { FieldError } from "@/lib/inline-validation";
import { scrollToFirstError, fieldBorderClass } from "@/lib/inline-validation";
import { InlineFieldError } from "@/components/field-error";
import { AppleSignInButton } from "@/components/apple-sign-in-button";
import { OffloadLogo } from "@/components/offload-logo";

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const { register: authRegister, setUser } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();

  const role = sessionStorage.getItem("offload_register_role") || "customer";

  const roleLabelMap: Record<string, string> = {
    customer: t("register.role_customer"),
    staff: t("register.role_manager"),
    driver: t("register.role_driver"),
  };

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  // Password strength meter
  const getPasswordStrength = (pw: string): { score: number; label: string; color: string } => {
    if (!pw) return { score: 0, label: "", color: "" };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { score: 20, label: t("register.strength_weak"), color: "bg-red-500" };
    if (score <= 2) return { score: 40, label: t("register.strength_fair"), color: "bg-orange-500" };
    if (score <= 3) return { score: 60, label: t("register.strength_good"), color: "bg-yellow-500" };
    if (score <= 4) return { score: 80, label: t("register.strength_strong"), color: "bg-emerald-500" };
    return { score: 100, label: t("register.strength_very_strong"), color: "bg-emerald-600" };
  };
  const passwordStrength = getPasswordStrength(password);

  const clearError = (field: string) => {
    setFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: FieldError[] = [];
    if (!fullName.trim()) errors.push({ field: "fullName", message: t("register.full_name_required") });
    if (!email.trim()) errors.push({ field: "email", message: t("register.email_required") });
    if (!password.trim()) errors.push({ field: "password", message: t("register.password_required") });
    else if (password.length < 8) errors.push({ field: "password", message: t("register.password_min_length") });
    if (!confirmPassword.trim()) errors.push({ field: "confirmPassword", message: t("register.confirm_required") });
    else if (password !== confirmPassword) errors.push({ field: "confirmPassword", message: t("register.passwords_no_match") });
    if (!agreedToTerms) errors.push({ field: "terms", message: t("register.terms_required") });
    if (errors.length > 0) {
      setFieldErrors(errors);
      scrollToFirstError(errors);
      return;
    }
    setFieldErrors([]);

    setIsLoading(true);
    try {
      const user = await authRegister({
        name: fullName,
        email,
        phone: phone || undefined,
        password,
        role: role === "staff" ? "laundromat" : role,
      });

      // Clean up role from sessionStorage
      sessionStorage.removeItem("offload_register_role");

      toast({ title: t("register.welcome_toast", { name: user.name.split(" ")[0] }), description: t("register.welcome_description") });

      // Wait one tick for React to flush the auth state update from authRegister
      // before navigating. Without this, RequireAuth sees the old (null) state
      // and bounces back to login.
      await new Promise(r => setTimeout(r, 50));

      // Navigate directly to the appropriate dashboard
      switch (user.role) {
        case "customer":
          navigate("/");
          break;
        case "driver":
          navigate("/driver");
          break;
        case "laundromat":
          navigate("/staff");
          break;
        case "manager":
          navigate("/manager");
          break;
        case "admin":
          navigate("/admin");
          break;
        default:
          navigate("/");
      }
    } catch (err: any) {
      toast({
        title: t("register.registration_failed"),
        description: err.message || t("register.generic_error"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 pt-6 pb-8">
      <div className="w-full max-w-sm mx-auto flex flex-col flex-1">
        {/* Back button */}
        <button
          data-testid="button-back"
          type="button"
          onClick={() => navigate("/role-select")}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-card transition-colors -ml-2 mb-4"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 mb-3">
          <OffloadLogo size={36} />
          <h1
            data-testid="text-app-name"
            className="text-3xl font-extrabold text-primary tracking-tight"
          >
            Offload
          </h1>
        </div>

        {/* Heading */}
        <h2 className="text-xl font-bold text-foreground mb-3">{t("register.create_account")}</h2>

        {/* Role Badge */}
        <div className="mb-6">
          <span
            data-testid="badge-role"
            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/20"
          >
            {t("register.registering_as")} {roleLabelMap[role] || role}
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} className="w-full space-y-4">
          {/* Full Name */}
          <div>
            <label htmlFor="fullName" className="sr-only">{t("register.full_name_placeholder")}</label>
            <input
              data-testid="input-fullname"
              id="fullName"
              name="fullName"
              type="text"
              placeholder={t("register.full_name_placeholder")}
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); clearError("fullName"); }}
              autoComplete="name"
              className={`w-full h-12 px-4 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("fullName", fieldErrors)}`}
            />
            <InlineFieldError field="fullName" errors={fieldErrors} />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="reg-email" className="sr-only">{t("register.email_placeholder")}</label>
            <input
              data-testid="input-email"
              id="reg-email"
              name="email"
              type="email"
              placeholder={t("register.email_placeholder")}
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
              autoComplete="email"
              className={`w-full h-12 px-4 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("email", fieldErrors)}`}
            />
            <InlineFieldError field="email" errors={fieldErrors} />
          </div>

          {/* Phone with country code */}
          <div>
            <label htmlFor="reg-phone" className="sr-only">{t("register.phone_placeholder")}</label>
            <div className="flex items-center h-12 rounded-xl bg-card border border-border overflow-hidden focus-within:ring-2 focus-within:ring-primary/50">
              <span className="flex items-center gap-1.5 pl-4 pr-2 text-muted-foreground text-sm border-r border-border">
                <span className="text-base">🇺🇸</span>
                <span>+1</span>
              </span>
              <input
                data-testid="input-phone"
                id="reg-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder={t("register.phone_placeholder")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel-national"
                className="flex-1 h-full px-3 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Password */}
          <div className="relative">
            <label htmlFor="reg-password" className="sr-only">{t("register.password_placeholder")}</label>
            <input
              data-testid="input-password"
              id="reg-password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder={t("register.password_placeholder")}
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
              autoComplete="new-password"
              className={`w-full h-12 px-4 pr-12 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("password", fieldErrors)}`}
            />
            <button
              data-testid="button-toggle-password"
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            <InlineFieldError field="password" errors={fieldErrors} />
          </div>

          {/* Password Strength Meter */}
          {password.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("register.password_strength")}</span>
                <span className={`text-xs font-medium ${passwordStrength.score >= 60 ? "text-emerald-500" : passwordStrength.score >= 40 ? "text-orange-500" : "text-red-500"}`}>
                  {passwordStrength.label}
                </span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${passwordStrength.color}`}
                  style={{ width: `${passwordStrength.score}%` }}
                />
              </div>
            </div>
          )}

          {/* Confirm Password */}
          <div className="relative">
            <label htmlFor="confirm-password" className="sr-only">{t("register.confirm_password_placeholder")}</label>
            <input
              data-testid="input-confirm-password"
              id="confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder={t("register.confirm_password_placeholder")}
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); clearError("confirmPassword"); }}
              autoComplete="new-password"
              className={`w-full h-12 px-4 pr-12 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("confirmPassword", fieldErrors)}`}
            />
            <button
              data-testid="button-toggle-confirm-password"
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            <InlineFieldError field="confirmPassword" errors={fieldErrors} />
          </div>

          {/* Terms Checkbox */}
          <div>
            <label className="flex items-start gap-2 cursor-pointer" data-field="terms">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => { setAgreedToTerms(e.target.checked); clearError("terms"); }}
                className="mt-0.5 w-4 h-4 rounded border-border accent-primary"
                data-testid="checkbox-terms"
              />
              <span className="text-xs text-muted-foreground leading-snug">
                {t("register.terms_agree")}{" "}
                <a href="/terms" className="text-primary hover:underline font-medium">{t("register.terms_of_service")}</a>
                {" "}{t("register.terms_and")}{" "}
                <a href="/privacy" className="text-primary hover:underline font-medium">{t("register.privacy_policy")}</a>
              </span>
            </label>
            <InlineFieldError field="terms" errors={fieldErrors} />
          </div>

          {/* Sign Up Button */}
          <button
            data-testid="button-signup"
            type="submit"
            disabled={isLoading}
            className="w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t("register.creating_account")}
              </span>
            ) : (
              t("register.sign_up")
            )}
          </button>
        </form>

        {/* Sign in with Apple (native iOS only — only show for customer signups) */}
        {role === "customer" && (
          <>
            <div className="flex items-center gap-3 w-full my-6">
              <div className="flex-1 h-px bg-border" />
              <span className="text-sm text-muted-foreground">{t("register.or")}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="w-full">
              <AppleSignInButton onSuccess={(r) => navigate(r === "customer" ? "/" : `/${r}`)} />
            </div>
          </>
        )}

        {/* Login Link */}
        <p className="mt-8 text-sm text-muted-foreground text-center">
          {t("register.already_have_account")}{" "}
          <button
            data-testid="link-login"
            type="button"
            onClick={() => navigate("/login")}
            className="text-primary hover:text-primary/80 font-semibold transition-colors"
          >
            {t("register.log_in")}
          </button>
        </p>
      </div>
    </div>
  );
}
