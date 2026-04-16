import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { User } from "@shared/schema";
import { apiRequest, setCurrentUserId, setAuthToken } from "@/lib/queryClient";

type AuthContextType = {
  user: User | null;
  setUser: (user: User | null) => void;
  isAuthenticated: boolean;
  logout: () => void;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; phone?: string; password: string; role: string }) => Promise<User>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {},
  isAuthenticated: false,
  logout: () => {},
  login: async () => { throw new Error("Not initialized"); },
  register: async () => { throw new Error("Not initialized"); },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);

  // Keep the module-level userId and token in sync with the current user
  useEffect(() => {
    setCurrentUserId(user ? user.id : null);
  }, [user]);

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
    }
  }, [setUser]);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const res = await apiRequest("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    // Store server-issued session token
    if (data.token) {
      setAuthToken(data.token);
    }
    setUser(data.user);
    return data.user;
  }, [setUser]);

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
    <AuthContext.Provider value={{ user, setUser, isAuthenticated: !!user, logout, login, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
