-- Wave A6: Convert timestamp-like text columns to timestamptz. Rollback: ALTER COLUMN TYPE text USING col::text.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND data_type IN ('text','character varying')
      AND (column_name LIKE '%\_at' OR column_name IN ('timestamp'))
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE timestamptz USING NULLIF(%I, '''')::timestamptz', r.table_name, r.column_name, r.column_name);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipping %.% timestamp conversion: %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;
END $$;
