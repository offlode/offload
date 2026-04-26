import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import Bugsnag from "@bugsnag/node";
import rateLimit from "express-rate-limit";
import { sanitizeMiddleware } from "./sanitize";
import { scheduleBackups } from "./backup";
import { bootstrapAccounts } from "./bootstrap";
import { storage } from "./storage";

// ── BugSnag Error Tracking ──
if (process.env.BUGSNAG_API_KEY) {
  Bugsnag.start({
    apiKey: process.env.BUGSNAG_API_KEY,
    appType: "server",
    appVersion: process.env.APP_VERSION || "1.0.0",
    releaseStage: process.env.NODE_ENV || "development",
  });
  console.log("[BugSnag] Error tracking initialized");
}

const app = express();
const httpServer = createServer(app);

// ── Socket.io Setup ──
const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.CORS_ORIGINS?.split(",") || ["http://localhost:5000", "https://offloadusa.com"], credentials: true },
  path: "/ws",
});

// ── Socket.io ownership helper (mirrors HTTP getOrderOwnershipAllowed) ──
async function socketCanAccessOrder(orderId: number, userId: number, role: string): Promise<boolean> {
  if (role === "admin" || role === "system") return true;
  const order = await storage.getOrder(orderId);
  if (!order) return false;
  if (role === "customer") return order.customerId === userId;
  if (role === "driver") {
    const drv = await storage.getDriverByUserId(userId);
    return !!drv && order.driverId === drv.id;
  }
  if (role === "vendor" || role === "laundromat" || role === "manager") {
    const v = await (storage as any).getVendorByUserId?.(userId);
    return !!v && order.vendorId === v.id;
  }
  return false;
}

// Authentication middleware for Socket.io — validates session token against
// the same session store used by HTTP. Client must pass `token` (preferred) or
// the legacy `userId` field; legacy is rejected because it was spoofable.
io.use(async (socket, next) => {
  try {
    const token = (socket.handshake.auth?.token as string | undefined)
      || (socket.handshake.headers?.authorization as string | undefined)?.replace(/^Bearer\s+/i, "");
    if (!token) return next(new Error("Authentication required"));
    const session = await storage.getSession(token);
    if (!session) return next(new Error("Session expired or invalid"));
    const user = await storage.getUser(session.userId);
    if (!user) return next(new Error("Invalid user"));
    socket.data.userId = user.id;
    socket.data.role = user.role;
    next();
  } catch (e) {
    next(new Error("Auth failed"));
  }
});

io.on("connection", (socket) => {
  // Join user's personal room (server-controlled, not from client)
  socket.join(`user:${socket.data.userId}`);

  // Join role-based room
  socket.join(`role:${socket.data.role}`);

  // Handle joining order rooms — verify ownership before allowing
  socket.on("join_order", async (orderId: number, ack?: (resp: any) => void) => {
    const id = Number(orderId);
    if (!Number.isFinite(id)) {
      if (typeof ack === "function") ack({ ok: false, error: "Invalid orderId" });
      return;
    }
    const allowed = await socketCanAccessOrder(id, socket.data.userId, socket.data.role);
    if (!allowed) {
      if (typeof ack === "function") ack({ ok: false, error: "Access denied" });
      return;
    }
    socket.join(`order:${id}`);
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("leave_order", (orderId: number) => {
    socket.leave(`order:${Number(orderId)}`);
  });

  // Handle typing indicators — only emit to a room the socket is already in
  socket.on("typing", (data: { orderId: number }) => {
    const room = `order:${Number(data?.orderId)}`;
    if (!socket.rooms.has(room)) return;
    socket.to(room).emit("user_typing", {
      userId: socket.data.userId,
      orderId: Number(data.orderId),
    });
  });

  // Handle read receipts — do not broadcast to all sockets; require room membership
  socket.on("mark_read", (data: { messageId: number; orderId?: number }) => {
    if (data?.orderId != null) {
      const room = `order:${Number(data.orderId)}`;
      if (!socket.rooms.has(room)) return;
      socket.to(room).emit("message_read", {
        messageId: Number(data.messageId),
        readBy: socket.data.userId,
      });
    }
  });
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// ── Global Rate Limiting (100 req/min per IP) ──
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
});
app.use("/api/", globalLimiter);

// ── Input Sanitization (after JSON parsing, before routes) ──
app.use(sanitizeMiddleware);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app, io);

  // Ensure critical accounts (Apple reviewer + admin) exist after every deploy
  // until persistent storage is wired up.
  try {
    await bootstrapAccounts();
  } catch (e) {
    console.error("[Bootstrap] Unhandled error:", (e as Error).message);
  }

  // ── Built-in Error Tracking (ring buffer + file log) ──
  const ERROR_LOG: Array<{ts: string; status: number; method: string; path: string; message: string; stack?: string}> = [];
  const MAX_ERRORS = 500;

  app.get("/api/admin/errors", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Authentication required" });
    res.json({ count: ERROR_LOG.length, errors: ERROR_LOG.slice(-100).reverse() });
  });

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    const entry = {
      ts: new Date().toISOString(),
      status,
      method: req.method,
      path: req.originalUrl,
      message,
      stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
    };
    ERROR_LOG.push(entry);
    if (ERROR_LOG.length > MAX_ERRORS) ERROR_LOG.shift();
    console.error(`[Error ${status}] ${req.method} ${req.originalUrl}: ${message}`);
    if (process.env.BUGSNAG_API_KEY) Bugsnag.notify(err instanceof Error ? err : new Error(message));

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // Global unhandled rejection / exception tracking
  process.on("unhandledRejection", (reason: any) => {
    const entry = {
      ts: new Date().toISOString(),
      status: 500,
      method: "SYSTEM",
      path: "unhandledRejection",
      message: String(reason?.message || reason),
      stack: reason?.stack,
    };
    ERROR_LOG.push(entry);
    if (ERROR_LOG.length > MAX_ERRORS) ERROR_LOG.shift();
    console.error("[Unhandled Rejection]", reason);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    try {
      serveStatic(app);
    } catch (e) {
      console.warn("[Static] Could not serve static files (API-only mode):", (e as Error).message);
      // In API-only mode, serve a simple health check at root
      app.get("/", (_req, res) => res.json({ status: "ok", service: "offload-api" }));
    }
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  // ── Automated DB Backups (every 6 hours) ──
  scheduleBackups("./data.db", 6);

  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})().catch((err) => {
  console.error("[FATAL] Server startup failed:", err);
  process.exit(1);
});
