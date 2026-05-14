import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { User } from "@shared/schema";
import { apiRequest, setCurrentUserId, setAuthToken, queryClient, setOnUnauthorized } from "@/lib/queryClient";
import { useIOSPushRegistration } from "@/hooks/use-ios-push-registration";

type Pending2FA = { userId: number; tempToken?: string } | null;

type AuthContextType = {
  user: User | null;
  setUser: (user: User | null) => void;
  isAuthenticated: boolean;
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
  logout: () => {},
  login: async () => { throw new Error("Not initialized"); },
  register: async () => { throw new Error("Not initialized"); },
  pending2FA: null,
  verify2FA: async () => { throw new Error("Not initialized"); },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [pending2FA, setPending2FA] = useState<Pending2FA>(null);
  useIOSPushRegistration(user);

  // Keep the module-level userId and token in sync with the current user
  useEffect(() => {
    setCurrentUserId(user ? user.id : null);
  }, [user]);

  // Global 401 interceptor: server returned 401 on an authenticated request
  // (e.g. expired session). Clear token, clear cache, redirect to /login.
  useEffect(() => {
    setOnUnauthorized(() => {
      try {
        setUserState(null);
        setCurrentUserId(null);
        setAuthToken(null);
        queryClient.clear();
      } finally {
        if (typeof window !== "undefined") {
          const path = window.location.pathname;
          if (path !== "/login" && path !== "/register" && path !== "/" && !path.startsWith("/auth")) {
            window.location.href = "/login";
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
      setAuthToken(null);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch (_) {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      setAuthToken(null);
      try {
        queryClient.clear();
      } catch (_) {
        // Defensive: never let cache clearing block logout completion
      }
    }
  }, [setUser]);

  const login = useCallback(async (email: string, password: string): Promise<User | null> => {
    const res = await apiRequest("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");

    // If server requires 2FA, don't complete login yet
    if (data.requires2FA) {
      setPending2FA({ userId: data.userId, tempToken: data.tempToken });
      return null;
    }

    // Store server-issued session token
    if (data.token) {
      setAuthToken(data.token);
    }
    setUser(data.user);
    return data.user;
  }, [setUser]);

  const verify2FA = useCallback(async (code: string): Promise<User> => {
    if (!pending2FA) throw new Error("No pending 2FA challenge");
    // If code is longer than 6 characters, treat it as a backup code
    const isBackupCode = code.length > 6;
    const body: Record<string, unknown> = { userId: pending2FA.userId };
    if (isBackupCode) {
      body.backupCode = code;
    } else {
      body.token = code;
    }
    const res = await apiRequest("/api/auth/2fa-challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "2FA verification failed");
    // Complete login with the full auth token
    if (data.token) {
      setAuthToken(data.token);
    }
    setPending2FA(null);
    setUser(data.user);
    return data.user;
  }, [pending2FA, setUser]);

  const register = useCallback(async (data: { name: string; email: string; phone?: string; password: string; role: string }): Promise<User> => {
    const res = await apiRequest("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Registration failed");
    // Store server-issued session token
    if (result.token) {
      setAuthToken(result.token);
    }
    setUser(result.user);
    return result.user;
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ user, setUser, isAuthenticated: !!user, logout, login, register, pending2FA, verify2FA }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
