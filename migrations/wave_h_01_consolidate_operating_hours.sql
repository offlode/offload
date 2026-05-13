-- Wave H (P2-044): Consolidate vendors.operating_hours into operating_hours_json.
-- Idempotent: only runs if the old column still exists.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendors' AND column_name = 'operating_hours'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendors' AND column_name = 'operating_hours_json'
  ) THEN
    -- Copy data from old column into new column where new column is NULL
    UPDATE vendors
    SET operating_hours_json = operating_hours
    WHERE operating_hours IS NOT NULL AND operating_hours_json IS NULL;

    -- Drop the old column
    ALTER TABLE vendors DROP COLUMN operating_hours;
  END IF;
END $$;
