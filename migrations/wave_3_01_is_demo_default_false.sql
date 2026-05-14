-- =============================================================================
--  Wave 3 — Migration: flip vendors.is_demo default to false
--  Background: Opus critique P1 #13. Original schema had is_demo default true,
--  combined with the production demo-vendor filter this meant every newly
--  inserted vendor was excluded from dispatch unless someone explicitly flipped
--  the flag. The intended behavior is "demo is opt-in", not opt-out.
--
--  This migration:
--   1. Changes the column default to false.
--   2. Marks any production-certified vendor (certified = true) as is_demo = false
--      so they keep dispatching after the column default flips.
--  Test/seed vendors that should remain demo must be updated explicitly with
--  UPDATE vendors SET is_demo = true WHERE name LIKE 'Demo %';
-- =============================================================================

ALTER TABLE vendors ALTER COLUMN is_demo SET DEFAULT false;

-- Backfill: any vendor that has been admin-certified must NOT be demo by default.
UPDATE vendors SET is_demo = false WHERE certified = true AND is_demo = true;
