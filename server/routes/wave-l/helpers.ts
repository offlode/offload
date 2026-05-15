import { db } from "../../storage";
import { vendorEmployees } from "@shared/schema";
import { eq, and } from "drizzle-orm";

/** Extract single string param (Express 5 params can be string | string[]) */
export function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : (val || "");
}

/** Get vendor ID for non-admin users via vendorEmployees table */
export async function getManagerVendorId(user: any): Promise<number | null> {
  if (user.role === "admin") return null;
  if (user.vendorId) return user.vendorId;
  const [emp] = await db
    .select()
    .from(vendorEmployees)
    .where(and(eq(vendorEmployees.userId, user.id), eq(vendorEmployees.active, true)));
  return emp?.vendorId || null;
}
