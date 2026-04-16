import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import Bugsnag from "@bugsnag/node";

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

// Authentication middleware for Socket.io
io.use((socket, next) => {
  const userId = socket.handshake.auth.userId;
  const role = socket.handshake.auth.role;
  if (!userId) return next(new Error("Authentication required"));
  socket.data.userId = Number(userId);
  socket.data.role = role || "customer";
  next();
});

io.on("connection", (socket) => {
  // Join user's personal room
  socket.join(`user:${socket.data.userId}`);

  // Join role-based room
  socket.join(`role:${socket.data.role}`);

  // Handle joining order rooms
  socket.on("join_order", (orderId: number) => {
    socket.join(`order:${orderId}`);
  });

  socket.on("leave_order", (orderId: number) => {
    socket.leave(`order:${orderId}`);
  });

  // Handle typing indicators
  socket.on("typing", (data: { orderId: number }) => {
    socket.to(`order:${data.orderId}`).emit("user_typing", {
      userId: socket.data.userId,
      orderId: data.orderId,
    });
  });

  // Handle read receipts
  socket.on("mark_read", (data: { messageId: number }) => {
    socket.broadcast.emit("message_read", {
      messageId: data.messageId,
      readBy: socket.data.userId,
    });
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
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
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
})();
