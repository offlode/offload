import { QueryClient, QueryFunction } from "@tanstack/react-query";

// P0-9: Resolve API base URL
// 1. Explicit env var (sandbox / staging)
// 2. Native Capacitor → production API
// 3. Relative '' for dev (Vite proxy) and web builds
const PRODUCTION_API = "https://api.offloadusa.com";

function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (window as any).Capacitor;
  if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) return true;
  if (typeof location !== "undefined") {
    const proto = location.protocol;
    if (proto === "capacitor:" || proto === "ionic:" || proto === "file:") return true;
  }
  return false;
}

const isNative = isNativePlatform();

const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (isNative ? PRODUCTION_API : "");

// P0-5: Auth token persistence via localStorage
const AUTH_TOKEN_KEY = "offload_auth_token";

let _authToken: string | null =
  typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
let _currentUserId: number | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }
}

export function clearAuthToken() {
  _authToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
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

// P1-16: Try to parse JSON error bodies for cleaner error messages
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const rawText = (await res.text()) || res.statusText;
    let message = `${res.status}: ${rawText}`;
    try {
      const parsed = JSON.parse(rawText);
      if (parsed.error || parsed.message) {
        message = parsed.error || parsed.message;
      }
    } catch {
      // Not JSON — keep the raw text
    }
    throw new Error(message);
  }
}

// P0-10: Extended apiRequest — detects FormData and skips JSON Content-Type
export async function apiRequest(path: string, options?: RequestInit): Promise<Response>;
export async function apiRequest(method: string, path: string, body?: unknown): Promise<Response>;
export async function apiRequest(
  pathOrMethod: string,
  pathOrOptions?: string | RequestInit,
  body?: unknown,
): Promise<Response> {
  let path: string;
  let options: RequestInit | undefined;

  if (typeof pathOrOptions === "string") {
    // Called as apiRequest('POST', '/api/quotes', payload)
    path = pathOrOptions;
    options = {
      method: pathOrMethod,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
  } else {
    // Called as apiRequest('/api/foo', { method: 'POST', ... })
    path = pathOrMethod;
    options = pathOrOptions;
  }

  const isFormData = options?.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options?.headers as Record<string, string>),
  };

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
