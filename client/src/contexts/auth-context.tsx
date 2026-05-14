import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { User } from "@shared/schema";
import { apiRequest, setCurrentUserId, setAuthToken, clearAuthToken, getAuthToken, queryClient, setOnUnauthorized, suppressUnauthorizedHandler } from "@/lib/queryClient";
import { useIOSPushRegistration } from "@/hooks/use-ios-push-registration";

type Pending2FA = { userId: number; tempToken?: string } | null;

type AuthContextType = {
  user: User | null;
  setUser: (user: User | null) => void;
  isAuthenticated: boolean;
  bootstrapping: boolean;
  logout: () => void;
  login: (email: string, password: string) => Promise<User | null>;
  register: (data: { name: string; email: string; phone?: string; password: string; role: string }) => Promise<User>;
  pending2FA: Pending2FA;
  verify2FA: (code: string) => Promise<User>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {},
  isAuthenticated: false,
  bootstrapping: true,
  logout: () => {},
  login: async () => { throw new Error("Not initialized"); },
  register: async () => { throw new Error("Not initialized"); },
  pending2FA: null,
  verify2FA: async () => { throw new Error("Not initialized"); },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [pending2FA, setPending2FA] = useState<Pending2FA>(null);
  const [bootstrapping, setBootstrapping] = useState(() => !!getAuthToken());
  useIOSPushRegistration(user);

  // Keep the module-level userId and token in sync with the current user
  useEffect(() => {
    setCurrentUserId(user ? user.id : null);
  }, [user]);

  // P0-5: On mount, if a token exists in localStorage, hydrate user from /api/auth/me
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setBootstrapping(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        suppressUnauthorizedHandler(true);
        const res = await apiRequest("/api/auth/me");
        const data = await res.json();
        if (!cancelled && data?.user) {
          setUserState(data.user);
          setCurrentUserId(data.user.id);
        }
      } catch {
        // 401 or network error — clear stale token
        if (!cancelled) {
          clearAuthToken();
          setCurrentUserId(null);
        }
      } finally {
        suppressUnauthorizedHandler(false);
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // P0-6: Global 401 interceptor — use hash routing for redirect
  useEffect(() => {
    setOnUnauthorized(() => {
      try {
        setUserState(null);
        setCurrentUserId(null);
        clearAuthToken();
        queryClient.clear();
      } finally {
        if (typeof window !== "undefined") {
          const hashPath = window.location.hash.replace(/^#/, "") || "/";
          const bypassPaths = ["/login", "/register", "/role-select", "/forgot-password", "/reset-password", "/"];
          if (!bypassPaths.includes(hashPath)) {
            window.location.hash = "#/login";
          }
        }
      }
    });
    return () => setOnUnauthorized(null);
  }, []);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    setCurrentUserId(u ? u.id : null);
    if (!u) {
      clearAuthToken();
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch (_) {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      clearAuthToken();
      try {
        queryClient.clear();
      } catch (_) {
        // Defensive: never let cache clearing block logout completion
      }
    }
  }, [setUser]);

  // P1-12: Removed dead `if (!res.ok)` branches — apiRequest already throws on non-2xx
  const login = useCallback(async (email: string, password: string): Promise<User | null> => {
    try {
      const res = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (data.requires2FA) {
        setPending2FA({ userId: data.userId, tempToken: data.tempToken });
        return null;
      }

      if (data.token) {
        setAuthToken(data.token);
      }
      setUser(data.user);
      return data.user;
    } catch (err: any) {
      throw new Error(err.message || "Login failed");
    }
  }, [setUser]);

  const verify2FA = useCallback(async (code: string): Promise<User> => {
    if (!pending2FA) throw new Error("No pending 2FA challenge");
    const isBackupCode = code.length > 6;
    const body: Record<string, unknown> = { userId: pending2FA.userId };
    if (isBackupCode) {
      body.backupCode = code;
    } else {
      body.token = code;
    }
    try {
      const res = await apiRequest("/api/auth/2fa-challenge", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.token) {
        setAuthToken(data.token);
      }
      setPending2FA(null);
      setUser(data.user);
      return data.user;
    } catch (err: any) {
      throw new Error(err.message || "2FA verification failed");
    }
  }, [pending2FA, setUser]);

  const register = useCallback(async (data: { name: string; email: string; phone?: string; password: string; role: string }): Promise<User> => {
    try {
      const res = await apiRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.token) {
        setAuthToken(result.token);
      }
      setUser(result.user);
      return result.user;
    } catch (err: any) {
      throw new Error(err.message || "Registration failed");
    }
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ user, setUser, isAuthenticated: !!user, bootstrapping, logout, login, register, pending2FA, verify2FA }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
