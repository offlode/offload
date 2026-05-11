import type { Request, Response, NextFunction } from "express";

/**
 * Application-level error class with structured error codes.
 * Throw this from routes to produce a well-formed JSON error response.
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: any;

  constructor(code: string, status: number, message: string, details?: any) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Centralized Express error middleware.
 * - AppError → structured response with error code
 * - ZodError → 400 with VALIDATION_ERROR code and issues
 * - Everything else → 500 with generic message (no err.message in production)
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  // AppError — controlled, safe to return
  if (err instanceof AppError) {
    const body: any = { error: err.message, code: err.code };
    if (err.details) body.details = err.details;
    res.status(err.status).json(body);
    return;
  }

  // ZodError — validation failure, safe to return
  if (err?.name === "ZodError" && err?.issues) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      issues: err.issues,
    });
    return;
  }

  // Unknown / internal errors — sanitize in production
  const status = err?.status || err?.statusCode || 500;
  console.error(`[Error ${status}] ${req.method} ${req.originalUrl}:`, err?.message || err);

  if (process.env.NODE_ENV !== "production") {
    // Dev: include error message for debugging
    res.status(status).json({
      error: err?.message || "Internal server error",
      code: "INTERNAL_ERROR",
      stack: err?.stack,
    });
    return;
  }

  // Production: never leak internal error messages
  res.status(status).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  });
}
