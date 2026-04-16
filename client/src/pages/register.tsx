import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { FieldError } from "@/lib/inline-validation";
import { scrollToFirstError, fieldBorderClass } from "@/lib/inline-validation";
import { InlineFieldError } from "@/components/field-error";

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const { register: authRegister, setUser } = useAuth();
  const { toast } = useToast();

  // Read role from window (set by role-select page) — wouter hash routing
  // doesn't support query params in hash paths reliably
  const role = (window as any).__offload_register_role || "customer";

  const roleLabelMap: Record<string, string> = {
    customer: "Customer",
    staff: "Manager",
    driver: "Driver",
  };

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  const clearError = (field: string) => {
    setFieldErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: FieldError[] = [];
    if (!fullName.trim()) errors.push({ field: "fullName", message: "Full name is required" });
    if (!email.trim()) errors.push({ field: "email", message: "Email is required" });
    if (!password.trim()) errors.push({ field: "password", message: "Password is required" });
    else if (password.length < 6) errors.push({ field: "password", message: "Password must be at least 6 characters" });
    if (!confirmPassword.trim()) errors.push({ field: "confirmPassword", message: "Please confirm your password" });
    else if (password !== confirmPassword) errors.push({ field: "confirmPassword", message: "Passwords do not match" });
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

      // Clean up role from window
      delete (window as any).__offload_register_role;

      toast({ title: `Welcome to Offload, ${user.name.split(" ")[0]}!`, description: "Your account is ready. Let's get started." });

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
        title: "Registration failed",
        description: err.message || "Something went wrong. Please try again.",
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
        <h1
          data-testid="text-app-name"
          className="text-3xl font-extrabold text-white tracking-tight mb-3"
        >
          Offload
        </h1>

        {/* Heading */}
        <h2 className="text-xl font-bold text-foreground mb-3">Create Account</h2>

        {/* Role Badge */}
        <div className="mb-6">
          <span
            data-testid="badge-role"
            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/20"
          >
            Registering as: {roleLabelMap[role] || role}
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} className="w-full space-y-4">
          {/* Full Name */}
          <div>
            <label htmlFor="fullName" className="sr-only">Full Name</label>
            <input
              data-testid="input-fullname"
              id="fullName"
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); clearError("fullName"); }}
              autoComplete="name"
              className={`w-full h-12 px-4 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("fullName", fieldErrors)}`}
            />
            <InlineFieldError field="fullName" errors={fieldErrors} />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="reg-email" className="sr-only">Email</label>
            <input
              data-testid="input-email"
              id="reg-email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
              autoComplete="email"
              className={`w-full h-12 px-4 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${fieldBorderClass("email", fieldErrors)}`}
            />
            <InlineFieldError field="email" errors={fieldErrors} />
          </div>

          {/* Phone with country code */}
          <div>
            <label htmlFor="reg-phone" className="sr-only">Phone Number</label>
            <div className="flex items-center h-12 rounded-xl bg-card border border-border overflow-hidden focus-within:ring-2 focus-within:ring-primary/50">
              <span className="flex items-center gap-1.5 pl-4 pr-2 text-muted-foreground text-sm border-r border-border">
                <span className="text-base">🇺🇸</span>
                <span>+1</span>
              </span>
              <input
                data-testid="input-phone"
                id="reg-phone"
                type="tel"
                placeholder="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                className="flex-1 h-full px-3 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Password */}
          <div className="relative">
            <label htmlFor="reg-password" className="sr-only">Password</label>
            <input
              data-testid="input-password"
              id="reg-password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
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

          {/* Confirm Password */}
          <div className="relative">
            <label htmlFor="confirm-password" className="sr-only">Confirm Password</label>
            <input
              data-testid="input-confirm-password"
              id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm Password"
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
                Creating account...
              </span>
            ) : (
              "Sign Up"
            )}
          </button>
        </form>

        {/* Login Link */}
        <p className="mt-8 text-sm text-muted-foreground text-center">
          Already have an account?{" "}
          <button
            data-testid="link-login"
            type="button"
            onClick={() => navigate("/login")}
            className="text-primary hover:text-primary/80 font-semibold transition-colors"
          >
            Log in
          </button>
        </p>
      </div>
    </div>
  );
}
