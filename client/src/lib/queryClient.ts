import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Detect runtime environment:
// 1. Native Capacitor (iOS/Android): location.protocol is "capacitor:" or "http:" with localhost — must use absolute API URL
// 2. Deployed web: __PORT_5000__ is replaced by deploy_website with proxy path
// 3. Local dev: __PORT_5000__ remains, falls back to relative "" (Vite proxy)
const PRODUCTION_API = "https://api.offloadusa.com";

function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    // 1. Capacitor native runtime detection (most reliable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
      return PRODUCTION_API;
    }
    // 2. Protocol-based detection for native shells
    if (typeof location !== "undefined") {
      const proto = location.protocol;
      if (proto === "capacitor:" || proto === "ionic:" || proto === "file:") {
        return PRODUCTION_API;
      }
    }
  }
  // 3. Web build: deploy_website replaces __PORT_5000__ at deploy time
  return "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
}

const API_BASE = resolveApiBase();

// Module-level auth token store — set via setAuthToken() from auth context
let _authToken: string | null = null;
let _currentUserId: number | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}

export function getAuthToken(): string | null {
  return _authToken;
}

export function setCurrentUserId(id: number | null) {
  _currentUserId = id;
}

export function getCurrentUserId(): number | null {
  return _currentUserId;
}

// Global 401 interceptor — auth context registers a handler that clears
// session token, clears the React Query cache, and redirects to /login.
// Endpoints that legitimately may return 401 (e.g. probing /api/auth/me
// at app startup) can opt out by including them in the bypass list below.
type UnauthorizedHandler = () => void;
let _onUnauthorized: UnauthorizedHandler | null = null;
let _suppressUnauthorized = false;

export function setOnUnauthorized(handler: UnauthorizedHandler | null) {
  _onUnauthorized = handler;
}

export function suppressUnauthorizedHandler(suppress: boolean) {
  _suppressUnauthorized = suppress;
}

// Paths that are allowed to return 401 without triggering global logout.
// These are auth-probing endpoints called before/after login.
const UNAUTHORIZED_BYPASS_PATHS = [
  "/api/auth/me",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
];

function shouldBypassUnauthorized(path: string): boolean {
  if (_suppressUnauthorized) return true;
  return UNAUTHORIZED_BYPASS_PATHS.some((p) => path.startsWith(p));
}

function handleUnauthorizedResponse(path: string, status: number) {
  if (status !== 401) return;
  if (shouldBypassUnauthorized(path)) return;
  if (_onUnauthorized) {
    try {
      _onUnauthorized();
    } catch (_) {
      // Never let handler errors crash the request pipeline
    }
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(path: string, options?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  // Inject Bearer token for native clients; browser sessions also use the HTTP-only cookie
  if (_authToken) {
    headers["Authorization"] = `Bearer ${_authToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });
  if (res.status === 401) {
    handleUnauthorizedResponse(path, res.status);
  }
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const path = queryKey[0] as string;

    const headers: Record<string, string> = {};
    if (_authToken) {
      headers["Authorization"] = `Bearer ${_authToken}`;
    }

    const res = await fetch(`${API_BASE}${path}`, { headers, credentials: "include" });

    if (res.status === 401) {
      // Bypass global handler only when caller opts into "returnNull" semantics
      // (still trigger handler for protected query endpoints expecting auth)
      if (unauthorizedBehavior === "throw") {
        handleUnauthorizedResponse(path, res.status);
      } else {
        return null;
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
