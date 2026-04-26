import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    // Extract token from URL hash query params
    const hash = window.location.hash;
    const queryPart = hash.split("?")[1];
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      const t = params.get("token");
      if (t) setToken(t);
    }
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!password) errs.password = "Password is required";
    else if (password.length < 8) errs.password = "Password must be at least 8 characters";
    if (!confirmPassword) errs.confirm = "Please confirm your password";
    else if (password !== confirmPassword) errs.confirm = "Passwords don't match";
    setErrors(errs);
    return Object.keys(errs).length === 0;

  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    if (!token) {
      setServerError("Invalid reset link. Please request a new one.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      setSuccess(true);
      // Redirect to login after 3 seconds
      setTimeout(() => setLocation("/login"), 3000);
    } catch (err: any) {
      const msg = err?.message || "Something went wrong. Please try again.";
      setServerError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#010101] p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Password reset</h1>
          <p className="text-[#999] text-sm">Your password has been updated. Redirecting to login...</p>
          <Link href="/login">
            <a className="inline-block mt-4 text-[#5B4BC4] hover:text-[#5B4BC4]/80 text-sm font-medium transition-colors">
              Go to login now
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
          <h1 className="text-2xl font-bold text-white">Choose a new password</h1>
          <p className="text-[#999] text-sm">Enter your new password below.</p>
        </div>

        {serverError && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-red-400 text-sm" data-testid="error-server">{serverError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#ccc] mb-1.5">
              New password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                data-testid="input-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: "" })); }}
                placeholder="At least 8 characters"
                className={`w-full px-4 py-3 pr-12 rounded-lg bg-[#1A1A1A] border text-white placeholder:text-[#666] focus:outline-none focus:ring-2 focus:ring-[#5B4BC4] transition-colors ${
                  errors.password ? "border-red-500" : "border-[#2E2E2E]"
                }`}

              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666] hover:text-[#999] transition-colors"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1.5 text-red-400 text-xs" data-testid="error-password">{errors.password}</p>
            )}
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-[#ccc] mb-1.5">
              Confirm password
            </label>
            <input
              id="confirm"
              type={showPassword ? "text" : "password"}
              data-testid="input-confirm-password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setErrors(prev => ({ ...prev, confirm: "" })); }}
              placeholder="Type your password again"
              className={`w-full px-4 py-3 rounded-lg bg-[#1A1A1A] border text-white placeholder:text-[#666] focus:outline-none focus:ring-2 focus:ring-[#5B4BC4] transition-colors ${
                errors.confirm ? "border-red-500" : "border-[#2E2E2E]"
              }`}
            />
            {errors.confirm && (
              <p className="mt-1.5 text-red-400 text-xs" data-testid="error-confirm">{errors.confirm}</p>
            )}
          </div>

          <button
            type="submit"
            data-testid="button-submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-[#5B4BC4] hover:bg-[#4A3BA3] text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Resetting..." : "Reset password"}
          </button>
        </form>

        <div className="text-center">
          <Link href="/login">
            <a className="text-[#5B4BC4] hover:text-[#5B4BC4]/80 text-sm font-medium transition-colors">
              &larr; Back to login
            </a>
          </Link>
        </div>

      </div>
    </div>
  );
}
