-- Wave A7: Vendor business coordinates float64.
-- Rollback: ALTER TABLE vendors ALTER COLUMN business_lat TYPE real; ALTER TABLE vendors ALTER COLUMN business_lng TYPE real;
DO $$ BEGIN
  IF to_regclass('vendors') IS NOT NULL THEN
    ALTER TABLE vendors ALTER COLUMN business_lat TYPE double precision USING business_lat::double precision;
    ALTER TABLE vendors ALTER COLUMN business_lng TYPE double precision USING business_lng::double precision;
  END IF;
END $$;
