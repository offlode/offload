-- Wave A1: users.email uniqueness (sandbox-applied in Pass 1)
-- Rollback: ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;
DO $$
BEGIN
  -- Pre-flight: detect duplicate emails and dedup-rename before adding UNIQUE constraint.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique') THEN
    -- Append '_dupN' suffix to duplicate emails, keeping the lowest-id row pristine.
    UPDATE users u SET email = u.email || '_dup' || u.id::text
    FROM (
      SELECT email, MIN(id) AS keep_id
      FROM users
      WHERE email IS NOT NULL AND email <> ''
      GROUP BY email
      HAVING COUNT(*) > 1
    ) dups
    WHERE u.email = dups.email AND u.id <> dups.keep_id;

    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
END $$;
