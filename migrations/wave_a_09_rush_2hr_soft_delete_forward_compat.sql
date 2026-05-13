-- Wave A9: Forward-compat restore of historically hard-deleted rush_2hr add-on as inactive.
-- Rollback: DELETE FROM add_ons WHERE name='rush_2hr' AND is_active IN (false,0);
DO $$ BEGIN
  IF to_regclass('add_ons') IS NOT NULL THEN
    INSERT INTO add_ons (name, display_name, price, price_cents, description, category, is_active, price_mode)
    VALUES ('rush_2hr', 'Rush 2-hour (deprecated)', 0, 0, 'Deprecated rush add-on retained inactive for referential/history compatibility.', 'service', false, 'per_order')
    ON CONFLICT (name) DO UPDATE SET is_active = false, price_cents = COALESCE(add_ons.price_cents, 0);
  END IF;
END $$;
