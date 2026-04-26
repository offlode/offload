/**
 * Bootstrap: ensure critical accounts exist on every server start.
 *
 * The production database is currently SQLite stored on Render's ephemeral
 * filesystem, which means data is lost on every redeploy. Until the user adds
 * a persistent disk or external Postgres, this script makes sure the Apple
 * reviewer demo account and the admin account always exist after a deploy.
 *
 * Read from env so credentials can be rotated without code changes:
 *   BOOTSTRAP_REVIEWER_EMAIL    (default: reviewer@offloadusa.com)
 *   BOOTSTRAP_REVIEWER_PASSWORD (default: OffloadReview2026!)
 *   BOOTSTRAP_ADMIN_EMAIL       (default: admin@offloadusa.com)
 *   BOOTSTRAP_ADMIN_PASSWORD    (default: OffloadAdmin2026!)
 */
import { storage } from "./storage";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

interface BootstrapAccount {
  email: string;
  password: string;
  name: string;
  phone: string;
  role: "customer" | "admin" | "manager";
}

async function ensureAccount(account: BootstrapAccount) {
  try {
    const existing = storage.getUserByEmail(account.email);
    if (existing) {
      // Verify role is correct; if not, do not silently change — log a warning
      if (existing.role !== account.role) {
        console.warn(
          `[Bootstrap] ${account.email} exists with role=${existing.role}, expected ${account.role}. Leaving as-is to avoid privilege changes.`,
        );
      }
      return;
    }
    const passwordHash = await hashPassword(account.password);
    const username = account.email.split("@")[0] + "_bootstrap_" + Date.now();
    storage.createUser({
      username,
      name: account.name,
      email: account.email,
      phone: account.phone,
      password: passwordHash,
      role: account.role,
    } as any);
    console.log(`[Bootstrap] Created ${account.role} account: ${account.email}`);
  } catch (err: any) {
    console.error(`[Bootstrap] Failed to ensure ${account.email}:`, err?.message || err);
  }
}

export async function bootstrapAccounts() {
  console.log("[Bootstrap] Ensuring critical accounts exist...");
  await ensureAccount({
    email: process.env.BOOTSTRAP_REVIEWER_EMAIL || "reviewer@offloadusa.com",
    password: process.env.BOOTSTRAP_REVIEWER_PASSWORD || "OffloadReview2026!",
    name: "Apple Reviewer",
    phone: "5551234567",
    role: "customer",
  });
  await ensureAccount({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@offloadusa.com",
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || "OffloadAdmin2026!",
    name: "Offload Admin",
    phone: "5550000000",
    role: "admin",
  });
  console.log("[Bootstrap] Done");
}
