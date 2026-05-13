/**
 * P2-061: NJ ZIP detection — single source of truth.
 * USPS assigns NJ the numeric ZIP range 07000–08999.
 * The old `startsWith("07") || startsWith("08")` check is too narrow
 * (misses 5-digit ZIPs like "07000" → "7000" when stored as a number)
 * and too broad (could match 07xxx outside NJ in edge cases).
 * This function normalises to a 5-digit string and checks the
 * numeric value falls within [07000, 08999].
 */
export function isNJZip(zip?: string | null): boolean {
  if (!zip) return false;
  const cleaned = String(zip).trim().replace(/\D/g, "");
  if (cleaned.length < 4 || cleaned.length > 5) return false;
  // Left-pad to 5 digits (handles "7000" → "07000")
  const padded = cleaned.padStart(5, "0");
  const num = Number(padded);
  return num >= 7000 && num <= 8999;
}
