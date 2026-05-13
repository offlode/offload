import type { Request } from "express";

// ── Shared helpers & types used across all route files ──

export function getPagination(req: Request) {
  const paginated = req.query.paginated === "true";
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  return { paginated, limit, offset };
}

export function paginatedResponse<T>(items: T[], pagination: { paginated: boolean; limit: number; offset: number }) {
  if (!pagination.paginated) return items;
  const sliced = items.slice(pagination.offset, pagination.offset + pagination.limit);
  return { items: sliced, total: items.length, limit: pagination.limit, offset: pagination.offset };
}

export function camelizeRow(row: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_m, ch: string) => ch.toUpperCase())] = value;
  }
  return out;
}
