import { useState } from "react";
import { apiRequest, setAuthToken } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";

type Props = {
  onSuccess?: (role: string) => void;
};

// Detects whether we're running inside the Capacitor native shell so that the
// button only attempts the native flow on iOS. On the deployed web site, the
// button is hidden (Apple requires native iOS for Sign in with Apple via this
// plugin; web requires a different OAuth flow).
function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (window as any).Capacitor;
  return !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
}

export function AppleSignInButton({ onSuccess }: Props) {
  const { setUser } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Hide on non-native (web) builds — Apple's native flow is used for App Store compliance.
  if (!isCapacitorNative()) return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      // Lazy-load the plugin so it only runs on native
      const mod = await import("@capacitor-community/apple-sign-in");
      const SignInWithApple = mod.SignInWithApple;
      const nonce = Math.random().toString(36).substring(2);
      const result = await SignInWithApple.authorize({
        clientId: "com.offloadusa.app",
        redirectURI: "https://api.offloadusa.com/api/auth/apple/callback",
        scopes: "email name",
        state: Math.random().toString(36).substring(2),
        nonce,
      });

      const r: any = result?.response || result;
      const identityToken = r?.identityToken;
      if (!identityToken) {
        throw new Error("No identity token returned by Apple");
      }

      const res = await apiRequest("/api/auth/apple", {
        method: "POST",
        body: JSON.stringify({
          identityToken,
          fullName: r?.fullName || null,
          user: r?.user || null,
          nonce,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Apple sign-in failed");
      if (data.token) setAuthToken(data.token);
      setUser(data.user);
      onSuccess?.(data.user.role);
    } catch (err: any) {
      // User-cancelled errors should be silent
      const msg = String(err?.message || err || "");
      if (msg.toLowerCase().includes("cancel") || msg.includes("1001")) {
        // user cancelled — do nothing
      } else {
        toast({ title: "Apple Sign-In failed", description: msg || "Please try again." });
      }
    } finally {
      setLoading(false);
    }
  };

  // Apple HIG-compliant "Sign in with Apple" button styling.
  // Matches ASAuthorizationAppleIDButton.Style.black: solid black fill,
  // white Apple logo left of centered text, 44pt minimum height, rounded
  // rectangle (6px radius), system font at ~17px.
  return (
    <button
      data-testid="button-apple-signin"
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="w-full h-[44px] min-h-[44px] rounded-[6px] bg-black text-white text-[17px] tracking-normal hover:bg-[#1a1a1a] active:bg-[#333] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-[6px] shadow-sm"
      style={{ fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif', fontWeight: 600, letterSpacing: '-0.01em' }}
      aria-label="Sign in with Apple"
    >
      {/* Apple logo — matches native ASAuthorizationAppleIDButton proportions */}
      <svg width="15" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
      </svg>
      <span>{loading ? "Signing in\u2026" : "Sign in with Apple"}</span>
    </button>
  );
}
