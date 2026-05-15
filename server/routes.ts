import type { Express, Request, Response, NextFunction } from "express";
import { registerVoiceRoutes } from "./voice";
import { createServer, type Server } from "http";
import { randomBytes } from "crypto";
import rateLimit from "express-rate-limit";
import type { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { hashPassword } from "./lib/auth";
import { checkRateLimit } from "./lib/errors";
import { getIdempotentResponse, setIdempotentResponse } from "./lib/stripe";
import { requireBearerToken, requireAuth } from "./session";
import { now, setIO, startBackgroundTasks } from "./engines";
import { registerAuthRoutes } from "./routes/auth";
import { registerUserRoutes } from "./routes/users";
import { registerQuotesRoutes } from "./routes/quotes";
import { registerOrdersCoreRoutes } from "./routes/orders-core";
import { registerOrdersOpsRoutes } from "./routes/orders-ops";
import { registerAdminRoutes } from "./routes/admin";
import { registerPaymentRoutes } from "./routes/payments";
import { registerPlatformRoutes } from "./routes/platform";
import { registerWaveLRoutes } from "./routes/wave-l";
import { registerWave2Routes } from "./routes/wave-2";
import { registerDispatchRoutes } from "./routes/dispatch";
import { registerLaundromatRoutes } from "./routes/laundromats";
import { registerPricingAdminRoutes } from "./routes/pricing-admin";
import { startDispatchEngine } from "./dispatch-engine";
import { seedPhaseA } from "./seed-phase-a";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  io?: SocketIOServer,
): Promise<Server> {

  // Set Socket.io reference for emit helpers
  setIO(io);

  // ── Ensure Super Admin exists (env-driven, no personal info in source) ──
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  const superAdminName  = (process.env.SUPER_ADMIN_NAME || "Owner").trim();
  if (superAdminEmail) {
    const existingSuperAdmin = await storage.getUserByEmail(superAdminEmail);
    if (!existingSuperAdmin) {
      const randomPw = randomBytes(32).toString("hex");
      await storage.createUser({
        username: superAdminEmail,
        email: superAdminEmail,
        name: superAdminName,
        role: "admin",
        password: hashPassword(randomPw),
        phone: "",
        memberSince: new Date().toISOString().slice(0, 10),
      });
      console.log(`[Seed] Super admin created via SUPER_ADMIN_EMAIL (use forgot-password to set password)`);
    } else if (existingSuperAdmin.role !== "admin") {
      await storage.updateUser(existingSuperAdmin.id, { role: "admin" });
      console.log(`[Seed] Upgraded existing user to admin role`);
    }
  }

  // Seed WELCOME20 promo code if it doesn't exist
  const welcome = await storage.getPromoCode("WELCOME20");
  if (!welcome) {
    await storage.createPromoCode({
      code: "WELCOME20",
      type: "percentage",
      value: 20,
      maxUses: 10000,
      usedCount: 0,
      isActive: true,
      minOrderAmount: 0,
      expiresAt: null,
      createdAt: now(),
    });
  }

  // (Duplicate super-admin seed block removed — see SUPER_ADMIN_EMAIL env-driven block above.)

  // ── Security headers + CORS for website ──
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    // Allow cross-origin requests from the marketing site and deployed site
    const origin = req.headers.origin;
    const allowedOrigins = [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://offloadusa.com",
      "http://offloadusa.com",
      "https://www.offloadusa.com",
      "https://admin.offloadusa.com",
      // Render hostnames (admin + api + customer + site) — prod
      "https://offload-admin.onrender.com",
      "https://offload-api.onrender.com",
      "https://offload-customer.onrender.com",
      "https://offload-site.onrender.com",
      // Render hostnames — sandbox
      "https://offload-admin-sandbox.onrender.com",
      "https://offload-api-sandbox.onrender.com",
      "https://offload-customer-sandbox.onrender.com",
      // Capacitor native shells (iOS/Android)
      "capacitor://localhost",
      "ionic://localhost",
      "http://localhost",
      "https://localhost",
    ];
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  // CSRF hardening: reject cookie-only auth on state-changing API requests.
  app.use("/api/", requireBearerToken);

  // Start background tasks
  startBackgroundTasks();

  // ── HEALTH CHECK ──
  app.get("/api/health", (_req, res) => {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    res.json({
      status: "healthy",
      uptime: Math.floor(uptime),
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || "1.0.0",
      environment: process.env.NODE_ENV || "development",
    });
  });

  // Wave 2: Expose Stripe publishable key to SPA for Elements integration.
  // Returns empty string when not configured so clients can detect availability
  // without leaking server status. NEVER exposes the secret key.
  app.get("/api/config/stripe", (_req, res) => {
    const pk = process.env.STRIPE_PUBLISHABLE_KEY || "";
    res.json({
      publishableKey: pk,
      configured: pk.startsWith("pk_"),
      mode: pk.startsWith("pk_live_") ? "live" : (pk.startsWith("pk_test_") ? "test" : "none"),
    });
  });

  // OD-7: Expose the Google Maps JavaScript API key to authenticated clients so the
  // embedded tracking-page map can render. The key is referrer-restricted at the GCP
  // level, but we still gate this behind auth + return an empty string if the env
  // var is unset, so the client cleanly falls back to the no-map placeholder.
  app.get("/api/config/maps-key", requireAuth(), (_req, res) => {
    const k = process.env.GOOGLE_MAPS_API_KEY || "";
    res.json({
      mapsKey: k,
      configured: !!k,
    });
  });

  // Public maps key endpoint for the marketing website (offloadusa.com).
  // The key is referrer-restricted at the GCP level so exposing it from a public
  // origin is acceptable. Returns an empty string when unset so the site cleanly
  // falls back to manual address entry.
  app.get("/api/public/maps-key", (req, res) => {
    const k = process.env.GOOGLE_MAPS_API_KEY || "";
    const origin = req.headers.origin;
    if (origin && ["https://offloadusa.com", "https://www.offloadusa.com", "http://localhost:3000", "http://127.0.0.1:3000"].includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
    }
    res.json({
      mapsKey: k,
      configured: !!k,
      libraries: ["places"],
    });
  });

  // ── REQUEST BODY SIZE LIMIT ──
  app.use("/api/", (req, res, next) => {
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    if (contentLength > 5 * 1024 * 1024) { // 5MB limit; photoData is capped separately below
      return res.status(413).json({ error: "Request body too large" });
    }
    next();
  });

  // ── RATE LIMITING MIDDLEWARE ──
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const routePath = req.path.replace(/\/\d+/g, "/:id");
    if (!checkRateLimit(req.method, routePath, ip)) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    next();
  });

  // ── IDEMPOTENCY MIDDLEWARE ──
  app.use("/api/", async (req, res, next) => {
    if ((req.method === "POST" || req.method === "PATCH") && req.headers["idempotency-key"]) {
      const key = req.headers["idempotency-key"] as string;
      const cached = await getIdempotentResponse(key);
      if (cached) {
        return res.status(cached.statusCode).json(cached.response);
      }
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        setIdempotentResponse(key, body, res.statusCode);
        return originalJson(body);
      };
    }
    next();
  });

  // ─────────────────────────────────────────────────────────
  //  SEED DATA — REMOVED FOR PRODUCTION
  // ─────────────────────────────────────────────────────────

  app.post("/api/seed", (_req, res) => {
    return res.status(404).json({ error: "Not found" });
  });

  // ─────────────────────────────────────────────────────────
  //  ROUTE REGISTRATION (sub-routers)
  // ─────────────────────────────────────────────────────────

  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerQuotesRoutes(app);
  registerOrdersCoreRoutes(app);
  registerOrdersOpsRoutes(app);
  registerAdminRoutes(app);
  registerPaymentRoutes(app);
  registerPlatformRoutes(app);
  registerWaveLRoutes(app);
  registerWave2Routes(app);
  registerDispatchRoutes(app);
  registerLaundromatRoutes(app);
  registerPricingAdminRoutes(app);

  // ── API versioning header ──
  app.use((_req, res, next) => {
    res.setHeader("X-API-Version", "1.0.0");
    res.setHeader("X-Powered-By", "Offload");
    next();
  });

  // ── Voice Order endpoints (STT + extraction) ──
  registerVoiceRoutes(app, requireAuth);

  // ── Phase A: dispatch auction background engine ──
  startDispatchEngine();

  // ── Phase A: seed data (super_admin, demo laundromats) ──
  seedPhaseA().catch((err) => {
    console.error("[seed-phase-a] Seed error:", err);
  });

  return httpServer;
}
