import { useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { OffloadLogo } from "@/components/offload-logo";
import { useI18n } from "@/i18n";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError(t("forgot.email_required"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t("forgot.email_invalid"));
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      setSent(true);
    } catch (err: any) {
      setError(t("forgot.generic_error"));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t("forgot.sent_title")}</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t("forgot.sent_message", { email })}
          </p>
          <p className="text-muted-foreground text-xs">{t("forgot.sent_expiry")}</p>
          <Link href="/login" className="inline-block mt-4 text-primary hover:text-primary/80 text-sm font-medium transition-colors">
              &larr; {t("forgot.back_to_login")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <OffloadLogo size={48} className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">{t("forgot.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("forgot.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
              {t("forgot.email_label")}
            </label>
            <input
              id="email"
              type="email"
              data-testid="input-email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder={t("forgot.email_placeholder")}
              className={`w-full px-4 py-3 rounded-lg bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-colors ${
                error ? "border-red-500" : "border-border"
              }`}
              autoFocus
            />
            {error && (
              <p className="mt-1.5 text-red-400 text-xs" data-testid="error-email">{error}</p>
            )}
          </div>

          <button
            type="submit"
            data-testid="button-submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-primary hover:bg-primary/90 text-foreground font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t("forgot.sending") : t("forgot.submit")}
          </button>
        </form>

        <div className="text-center">
          <Link href="/login" className="text-primary hover:text-primary/80 text-sm font-medium transition-colors">
              &larr; {t("forgot.back_to_login")}
          </Link>
        </div>

      </div>
    </div>
  );
}
