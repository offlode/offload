-- Wave H (P2-045): Convert TEXT columns to timestamptz (sandbox only).
-- Idempotent: each block checks data_type before converting.

-- orders.sla_deadline TEXT → timestamptz
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'sla_deadline' AND data_type = 'text'
  ) THEN
    ALTER TABLE orders ALTER COLUMN sla_deadline TYPE timestamptz USING sla_deadline::timestamptz;
  END IF;
END $$;

-- vendor_payouts.period_start TEXT → timestamptz
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendor_payouts' AND column_name = 'period_start' AND data_type = 'text'
  ) THEN
    ALTER TABLE vendor_payouts ALTER COLUMN period_start TYPE timestamptz USING period_start::timestamptz;
  END IF;
END $$;

-- vendor_payouts.period_end TEXT → timestamptz
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendor_payouts' AND column_name = 'period_end' AND data_type = 'text'
  ) THEN
    ALTER TABLE vendor_payouts ALTER COLUMN period_end TYPE timestamptz USING period_end::timestamptz;
  END IF;
END $$;
