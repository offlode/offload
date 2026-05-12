/**
 * migrate-only.ts — Run ensureIntegrityConstraints() against a target database.
 * Usage: DATABASE_URL="..." npx tsx server/migrate-only.ts
 */

// The storage module reads DATABASE_URL on import and runs ensureIntegrityConstraints()
// automatically (line ~330). We just need to import it and wait for the async work to finish.
import "./storage";

// Give the async ensureIntegrityConstraints() time to complete, then exit.
setTimeout(() => {
  console.log("[migrate-only] Done. Exiting.");
  process.exit(0);
}, 10000);
