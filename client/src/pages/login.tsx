import { useState } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import type { FieldError } from "@/lib/inline-validation";
import { scrollToFirstError, fieldBorderClass } from "@/lib/inline-validation";
import { InlineFieldError } from "@/components/field-error";
import { AppleSignInButton } from "@/components/apple-sign-in-button";
import { OffloadLogo } from "@/components/offload-logo";
import { useI18n } from "@/i18n";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login, pending2FA, verify2FA } = useAuth();
  const { t } = useI18n();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  // 2FA state
  const [twoFACode, setTwoFACode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [twoFAError, setTwoFAError] = useState("");
  const [twoFALoading, setTwoFALoading] = useState(false);

  // Clear field error when user types
  const clearError = (field: string) => {
    setFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: FieldError[] = [];
    if (!email.trim()) errors.push({ field: "email", message: t("login.email_required") });
    if (!password.trim()) errors.push({ field: "password", message: t("login.password_required") });
    if (errors.length > 0) {
      setFieldErrors(errors);
      scrollToFirstError(errors);
      return;
    }
    setFieldErrors([]);

    setIsLoading(true);
    try {
      const user = await login(email, password);
      if (user) {
        // Login complete (no 2FA required)
        await new Promise(r => setTimeout(r, 50));
        navigateByRole(user.role);
      }
      // If user is null, 2FA is required — pending2FA state will trigger challenge UI
    } catch (err: any) {
      // Show inline error instead of toast for invalid credentials
      setFieldErrors([
        { field: "email", message: "" },
        { field: "password", message: t("login.invalid_credentials") },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFACode.trim()) {
      setTwoFAError(useBackupCode ? t("login.backup_code_required") : t("login.verification_code_required"));
      return;
    }
    setTwoFAError("");
    setTwoFALoading(true);
    try {
      const user = await verify2FA(twoFACode.trim());
      await new Promise(r => setTimeout(r, 50));
      navigateByRole(user.role);
    } catch (err: any) {
      setTwoFAError(err.message || t("login.invalid_code"));
    } finally {
      setTwoFALoading(false);
    }
  };

  function navigateByRole(role: string) {
    switch (role) {
      case "customer": navigate("/"); break;
      case "driver": navigate("/driver"); break;
      case "laundromat":
      case "vendor":
      case "staff":
      case "laundromat_owner":
      case "laundromat_employee":
      case "operator":
      case "wash_operator":
        navigate("/staff"); break;
      case "manager": navigate("/manager"); break;
      case "admin":
      case "super_admin":
        navigate("/admin"); break;
      default: navigate("/");
    }
  }

  // 2FA challenge screen
  if (pending2FA) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center px-6 pt-16 pb-8">
        <div className="w-full max-w-sm flex flex-col items-center">
          {/* Shield icon */}
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-2">{t("login.two_fa_title")}</h1>
          <p className="text-sm text-muted-foreground text-center mb-8">
            {useBackupCode
              ? t("login.two_fa_backup_prompt")
              : t("login.two_fa_authenticator_prompt")}
          </p>

          <form onSubmit={handle2FASubmit} className="w-full space-y-4">
            <div>
              <label htmlFor="2fa-code" className="text-xs text-muted-foreground mb-1.5 block">
                {useBackupCode ? t("login.two_fa_backup_label") : t("login.two_fa_code_label")}
              </label>
              <input
                data-testid="input-2fa-code"
                id="2fa-code"
                type="text"
                inputMode={useBackupCode ? "text" : "numeric"}
                maxLength={useBackupCode ? 24 : 6}
                placeholder={useBackupCode ? "xxxx-xxxx-xxxx" : "000000"}
                value={twoFACode}
                onChange={(e) => {
                  setTwoFACode(e.target.value);
                  setTwoFAError("");
                }}
                autoComplete="one-time-code"
                autoFocus
                className="w-full h-12 px-4 rounded-xl bg-card border text-foreground text-center text-lg tracking-widest placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
              {twoFAError && (
                <p className="text-xs text-red-500 mt-1.5">{twoFAError}</p>
              )}
            </div>

            <button
              data-testid="button-verify-2fa"
              type="submit"
              disabled={twoFALoading}
              className="w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {twoFALoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t("login.two_fa_verifying")}
                </span>
              ) : (
                t("login.two_fa_verify")
              )}
            </button>
          </form>

          <button
            data-testid="link-toggle-backup-code"
            type="button"
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setTwoFACode("");
              setTwoFAError("");
            }}
            className="mt-4 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            {useBackupCode ? t("login.two_fa_use_authenticator") : t("login.two_fa_use_backup")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-6 pt-16 pb-8">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Logo */}
        <div className="flex flex-col items-center mb-12">
          <OffloadLogo size={56} className="mb-3" />
          <h1
            data-testid="text-app-name"
            className="text-3xl font-extrabold text-primary tracking-tight"
          >
            Offload
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="w-full space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="text-xs text-muted-foreground mb-1.5 block">
              {t("login.email_label")}
            </label>
            <input
              data-testid="input-email"
              id="email"
              type="email"
              placeholder={t("login.email_label")}
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
              autoComplete="email"
              className={`w-full h-12 px-4 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("email", fieldErrors)}`}
            />
            <InlineFieldError field="email" errors={fieldErrors} />
          </div>

          {/* Password */}
          <div className="relative">
            <label htmlFor="password" className="text-xs text-muted-foreground mb-1.5 block">
              {t("login.password_label")}
            </label>
            <input
              data-testid="input-password"
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder={t("login.password_label")}
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
              autoComplete="current-password"
              className={`w-full h-12 px-4 pr-12 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("password", fieldErrors)}`}
            />
            <button
              data-testid="button-toggle-password"
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-4 bottom-3.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
            <InlineFieldError field="password" errors={fieldErrors} />
          </div>

          {/* Forgot Password */}
          <div className="flex justify-end">
            <button
              data-testid="link-forgot-password"
              type="button"
              className="text-sm text-primary hover:text-primary/80 transition-colors"
              onClick={() => navigate("/forgot-password")}

            >
              {t("login.forgot_password")}
            </button>
          </div>

          {/* Login Button */}
          <button
            data-testid="button-login"
            type="submit"
            disabled={isLoading}
            className="w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t("login.logging_in")}
              </span>
            ) : (
              t("login.log_in")
            )}
          </button>
        </form>

        {/* Sign in with Apple (native iOS only) */}
        <div className="w-full mt-6">
          <AppleSignInButton onSuccess={navigateByRole} />
        </div>

        {/* Sign Up Link */}
        <p className="mt-8 text-sm text-muted-foreground">
          {t("login.no_account")}{" "}
          <button
            data-testid="link-signup"
            type="button"
            onClick={() => navigate("/role-select")}
            className="text-primary hover:text-primary/80 font-semibold transition-colors"
          >
            {t("login.sign_up")}
          </button>
        </p>

        {/* Partner CTA */}
        <p className="mt-4 text-xs text-muted-foreground">
          <button
            data-testid="link-become-partner"
            type="button"
            onClick={() => navigate("/become-a-partner")}
            className="text-primary hover:text-primary/80 transition-colors"
          >
            {t("partner.cta")}
          </button>
        </p>
      </div>
    </div>
  );
}
