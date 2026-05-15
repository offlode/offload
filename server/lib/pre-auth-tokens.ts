import { randomBytes } from "crypto";

interface PreAuthEntry {
  userId: number;
  expiresAt: number;
}

const store = new Map<string, PreAuthEntry>();

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // sweep every 60s

setInterval(() => {
  const now = Date.now();
  store.forEach((entry, token) => {
    if (entry.expiresAt <= now) store.delete(token);
  });
}, CLEANUP_INTERVAL_MS).unref();

export const preAuthTokenStore = {
  issue(userId: number): string {
    const token = randomBytes(32).toString("hex");
    store.set(token, { userId, expiresAt: Date.now() + TTL_MS });
    return token;
  },

  validate(token: string, userId: number): boolean {
    const entry = store.get(token);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
      store.delete(token);
      return false;
    }
    if (entry.userId !== userId) return false;
    return true;
  },

  consume(token: string, userId: number): boolean {
    const valid = this.validate(token, userId);
    if (valid) store.delete(token);
    return valid;
  },
};
