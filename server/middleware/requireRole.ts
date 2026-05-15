import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../session";

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // First run requireAuth to populate req.currentUser
    await new Promise<void>((resolve, reject) => {
      requireAuth()(req, res, (err?: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // If requireAuth already sent a response, don't continue
    if (res.headersSent) return;

    const user = (req as any).currentUser;
    if (!user) return res.status(401).json({ error: "Authentication required" });
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
