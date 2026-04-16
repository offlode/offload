import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import type { FieldError } from "@/lib/inline-validation";
import { scrollToFirstError, fieldBorderClass } from "@/lib/inline-validation";
import { InlineFieldError } from "@/components/field-error";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  // Hash routing: URL is /#/reset-password?token=xxx
  const token = useMemo(() => {
    const hash = window.location.hash; // e.g. #/reset-password?token=abc
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return "";
    const params = new URLSearchParams(hash.slice(qIdx));
    return params.get("token") || "";
  }, []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  const clearError = (field: string) => {
    setFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: FieldError[] = [];

    if (!password) {
      errors.push({ field: "password", message: "Password is required" });
    } else if (password.length < 6) {
      errors.push({ field: "password", message: "Password must be at least 6 characters" });
    }
    if (!confirmPassword) {
      errors.push({ field: "confirmPassword", message: "Please confirm your password" });
    } else if (password !== confirmPassword) {
      errors.push({ field: "confirmPassword", message: "Passwords do not match" });
    }
    if (!token) {
      errors.push({ field: "password", message: "Invalid reset link. Please request a new one." });
    }
    if (errors.length > 0) {
      setFieldErrors(errors);
      scrollToFirstError(errors);
      return;
    }
    setFieldErrors([]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFieldErrors([{ field: "password", message: data.error || "Failed to reset password" }]);
      } else {
        setSuccess(true);
      }
    } catch (_) {
      setFieldErrors([{ field: "password", message: "Something went wrong. Please try again." }]);
    }
    setIsLoading(false);
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-extrabold text-white">Invalid Link</h1>
          <p className="text-sm text-muted-foreground">
            This password reset link is invalid or has expired.
          </p>
          <button
            type="button"
            onClick={() => navigate("/forgot-password")}
            className="mt-4 w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all"
          >
            Request New Link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-6 pt-16 pb-8">
      <div className="w-full max-w-sm flex flex-col items-center">
        <h1 className="text-2xl font-extrabold text-white tracking-tight mb-2">
          Set New Password
        </h1>
        <p className="text-sm text-muted-foreground mb-8 text-center">
          Enter your new password below.
        </p>

        {success ? (
          <div className="w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-foreground font-medium">Password reset successful</p>
            <p className="text-sm text-muted-foreground">
              Your password has been updated. You can now log in with your new password.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="mt-6 w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all"
            >
              Go to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full space-y-4">
            {/* New Password */}
            <div className="relative">
              <label htmlFor="new-password" className="sr-only">New Password</label>
              <input
                id="new-password"
                type={showPassword ? "text" : "password"}
                placeholder="New password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                autoComplete="new-password"
                className={`w-full h-12 px-4 pr-12 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("password", fieldErrors)}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
              <InlineFieldError field="password" errors={fieldErrors} />
            </div>

            {/* Confirm Password */}
            <div className="relative">
              <label htmlFor="confirm-password" className="sr-only">Confirm Password</label>
              <input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); clearError("confirmPassword"); }}
                autoComplete="new-password"
                className={`w-full h-12 px-4 pr-12 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("confirmPassword", fieldErrors)}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
              <InlineFieldError field="confirmPassword" errors={fieldErrors} />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[50px] rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Resetting...
                </span>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
