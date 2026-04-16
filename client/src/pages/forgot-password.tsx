import { useState } from "react";
<<<<<<< HEAD
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { FieldError } from "@/lib/inline-validation";
import { scrollToFirstError, fieldBorderClass } from "@/lib/inline-validation";
import { InlineFieldError } from "@/components/field-error";

export default function ForgotPasswordPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  const clearError = (field: string) => {
    setFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: FieldError[] = [];
    if (!email.trim()) {
      errors.push({ field: "email", message: "Email is required" });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ field: "email", message: "Please enter a valid email address" });
    }
    if (errors.length > 0) {
      setFieldErrors(errors);
      scrollToFirstError(errors);
      return;
    }
    setFieldErrors([]);
    setIsLoading(true);
    try {
      await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch (_) {
      // Always show success regardless
    }
    setIsLoading(false);
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-6 pt-16 pb-8">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Back button */}
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="self-start mb-8 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to login</span>
        </button>

        <h1 className="text-2xl font-extrabold text-white tracking-tight mb-2">
          Reset Password
        </h1>
        <p className="text-sm text-muted-foreground mb-8 text-center">
          Enter your email and we'll send you a link to reset your password.
        </p>

        {submitted ? (
          <div className="w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-foreground font-medium">Check your email</p>
            <p className="text-sm text-muted-foreground">
              If an account with that email exists, a password reset link has been sent.
              The link expires in 1 hour.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="mt-6 w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div>
              <label htmlFor="reset-email" className="sr-only">Email</label>
              <input
                id="reset-email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                autoComplete="email"
                className={`w-full h-12 px-4 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("email", fieldErrors)}`}
              />
              <InlineFieldError field="email" errors={fieldErrors} />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </span>
              ) : (
                "Send Reset Link"
              )}
            </button>
          </form>
        )}
=======
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (err: any) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#010101] p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-[#5B4BC4]/20 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-[#5B4BC4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Check your email</h1>
          <p className="text-[#999] text-sm leading-relaxed">
            If an account with <span className="text-white font-medium">{email}</span> exists, we've sent a password reset link. Check your inbox and spam folder.
          </p>
          <p className="text-[#666] text-xs">The link expires in 1 hour.</p>
          <Link href="/login">
            <a className="inline-block mt-4 text-[#5B4BC4] hover:text-[#5B4BC4]/80 text-sm font-medium transition-colors">
              &larr; Back to login
            </a>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#010101] p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">Reset your password</h1>
          <p className="text-[#999] text-sm">Enter your email and we'll send you a reset link.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#ccc] mb-1.5">
              Email address
            </label>
            <input
              id="email"
              type="email"
              data-testid="input-email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="you@example.com"
              className={`w-full px-4 py-3 rounded-lg bg-[#1A1A1A] border text-white placeholder:text-[#666] focus:outline-none focus:ring-2 focus:ring-[#5B4BC4] transition-colors ${
                error ? "border-red-500" : "border-[#2E2E2E]"
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
            className="w-full py-3 rounded-lg bg-[#5B4BC4] hover:bg-[#4A3BA3] text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <div className="text-center">
          <Link href="/login">
            <a className="text-[#5B4BC4] hover:text-[#5B4BC4]/80 text-sm font-medium transition-colors">
              &larr; Back to login
            </a>
          </Link>
        </div>
>>>>>>> 9b9fa41 (feat: forgot-password flow, super admin (chaimfischer2@gmail.com), admin role bypass)
      </div>
    </div>
  );
}
