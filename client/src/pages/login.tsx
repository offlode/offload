import { useState } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { FieldError } from "@/lib/inline-validation";
import { scrollToFirstError, fieldBorderClass } from "@/lib/inline-validation";
import { InlineFieldError } from "@/components/field-error";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  // Clear field error when user types
  const clearError = (field: string) => {
    setFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: FieldError[] = [];
    if (!email.trim()) errors.push({ field: "email", message: "Email is required" });
    if (!password.trim()) errors.push({ field: "password", message: "Password is required" });
    if (errors.length > 0) {
      setFieldErrors(errors);
      scrollToFirstError(errors);
      return;
    }
    setFieldErrors([]);

    setIsLoading(true);
    try {
      const user = await login(email, password);
      // Wait one tick for React to flush auth state before navigating
      await new Promise(r => setTimeout(r, 50));
      navigateByRole(user.role);
    } catch (err: any) {
      // Show inline error instead of toast for invalid credentials
      setFieldErrors([
        { field: "email", message: "" },
        { field: "password", message: "Invalid email or password. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  function navigateByRole(role: string) {
    switch (role) {
      case "customer": navigate("/"); break;
      case "driver": navigate("/driver"); break;
      case "laundromat": navigate("/staff"); break;
      case "manager": navigate("/manager"); break;
      case "admin": navigate("/admin"); break;
      default: navigate("/");
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-6 pt-16 pb-8">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Logo */}
        <h1
          data-testid="text-app-name"
          className="text-3xl font-extrabold text-white tracking-tight mb-12"
        >
          Offload
        </h1>

        {/* Form */}
        <form onSubmit={handleLogin} className="w-full space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <input
              data-testid="input-email"
              id="email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
              autoComplete="email"
              className={`w-full h-12 px-4 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("email", fieldErrors)}`}
            />
            <InlineFieldError field="email" errors={fieldErrors} />
          </div>

          {/* Password */}
          <div className="relative">
            <label htmlFor="password" className="sr-only">
              Password
            </label>
            <input
              data-testid="input-password"
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
              autoComplete="current-password"
              className={`w-full h-12 px-4 pr-12 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("password", fieldErrors)}`}
            />
            <button
              data-testid="button-toggle-password"
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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
              Forgot Password?
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
                Logging in...
              </span>
            ) : (
              "Log In"
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 w-full my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-sm text-muted-foreground">or continue with</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Google Button */}
        <button
          data-testid="button-google-login"
          type="button"
          className="w-full h-[50px] rounded-full border border-border bg-transparent text-foreground font-semibold text-base hover:bg-card transition-all flex items-center justify-center gap-3"
          onClick={() => toast({ title: "Google Sign-In", description: "Google authentication is coming soon. Please use email login for now." })}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        {/* Sign Up Link */}
        <p className="mt-8 text-sm text-muted-foreground">
          Don't have an account?{" "}
          <button
            data-testid="link-signup"
            type="button"
            onClick={() => navigate("/role-select")}
            className="text-primary hover:text-primary/80 font-semibold transition-colors"
          >
            Sign Up
          </button>
        </p>
      </div>
    </div>
  );
}
