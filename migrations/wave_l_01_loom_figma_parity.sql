-- ================================================================
-- Wave L: Loom/Figma Design Parity — Backend Schema Additions
-- ================================================================
-- DO NOT edit existing migrations. This is additive only.

-- ── 1. Orders: new columns for wash wizard ──
ALTER TABLE orders ADD COLUMN IF NOT EXISTS clothing_types text[] DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS separated boolean DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS separation_fee_cents integer DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wash_preferences jsonb DEFAULT '{}';

-- ── 2. Vendors: separation fee + is_demo flag ──
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS separation_fee_cents integer DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT true;

-- ── 3. Users: must_change_password for temp passwords ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false;

-- ── 4. wash_runs table ──
DO $$ BEGIN
  CREATE TYPE wash_run_status AS ENUM ('pending', 'washing', 'done');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS wash_runs (
  id SERIAL PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  operator_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  status wash_run_status NOT NULL DEFAULT 'pending',
  duration_min integer,
  start_at timestamptz,
  end_at timestamptz,
  completed_at timestamptz,
  photo_urls text[] DEFAULT '{}',
  notes text,
  separation_required boolean DEFAULT false,
  clothing_types text[] DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_wash_runs_order_id ON wash_runs(order_id);
CREATE INDEX IF NOT EXISTS idx_wash_runs_vendor_id ON wash_runs(vendor_id);
CREATE INDEX IF NOT EXISTS idx_wash_runs_operator_id ON wash_runs(operator_id);

-- ── 5. vendor_employees table ──
DO $$ BEGIN
  CREATE TYPE vendor_employee_role AS ENUM ('manager', 'driver', 'wash_operator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS vendor_employees (
  id SERIAL PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role vendor_employee_role NOT NULL,
  permissions jsonb DEFAULT '{"view_orders": true, "update_wash_status": false, "weight_verification": false, "photo_upload": false, "wash_preferences": false}',
  temp_password_hash text,
  active boolean DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  deactivated_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_vendor_employees_vendor_id ON vendor_employees(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_employees_user_id ON vendor_employees(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_employees_vendor_user ON vendor_employees(vendor_id, user_id) WHERE deleted_at IS NULL;

-- ── 6. performance_bonus_rules table ──
DO $$ BEGIN
  CREATE TYPE bonus_rule_type AS ENUM ('five_star_streak', 'volume', 'on_time');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS performance_bonus_rules (
  id SERIAL PRIMARY KEY,
  vendor_id integer REFERENCES vendors(id) ON DELETE CASCADE,
  rule_type bonus_rule_type NOT NULL,
  threshold integer NOT NULL,
  amount_cents integer NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default rule: 5-star streak, threshold=5, $5.00
INSERT INTO performance_bonus_rules (rule_type, threshold, amount_cents, active)
SELECT 'five_star_streak', 5, 500, true
WHERE NOT EXISTS (
  SELECT 1 FROM performance_bonus_rules WHERE rule_type = 'five_star_streak' AND vendor_id IS NULL
);

-- ── 7. performance_bonus_payouts table ──
CREATE TABLE IF NOT EXISTS performance_bonus_payouts (
  id SERIAL PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  rule_id integer NOT NULL REFERENCES performance_bonus_rules(id) ON DELETE CASCADE,
  period_start timestamptz,
  period_end timestamptz,
  amount_cents integer NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  payout_status text NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_bonus_payouts_vendor ON performance_bonus_payouts(vendor_id);

-- ── 8. vendor_bank_accounts table ──
DO $$ BEGIN
  CREATE TYPE bank_account_status AS ENUM ('pending', 'verified', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS vendor_bank_accounts (
  id SERIAL PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  last4 text NOT NULL,
  masked_routing text,
  status bank_account_status NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_vendor_bank_accounts_vendor ON vendor_bank_accounts(vendor_id);

-- ── 9. notification_preferences table ──
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL,
  push boolean DEFAULT true,
  email boolean DEFAULT true,
  sms boolean DEFAULT false,
  PRIMARY KEY (user_id, category)
);

-- ── 10. user_2fa table ──
DO $$ BEGIN
  CREATE TYPE twofa_method AS ENUM ('totp', 'email_otp');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_2fa (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  method twofa_method NOT NULL DEFAULT 'totp',
  totp_secret_enc text,
  backup_codes_hash text[] DEFAULT '{}',
  enabled boolean DEFAULT false,
  verified_at timestamptz
);

-- ── 11. Update orders status CHECK to include new FSM states ──
-- Drop the old constraint and add new one with extended states
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'draft_quote', 'quoted', 'quote_accepted', 'quote_expired',
    'payment_pending', 'confirmed', 'pending', 'scheduled',
    'driver_assigned', 'driver_en_route_pickup', 'arrived_pickup',
    'picked_up', 'driver_en_route_facility', 'at_facility',
    'processing', 'washing', 'drying', 'folding',
    'folded_packaged', 'final_weight_verified',
    'ready_for_delivery', 'driver_en_route_delivery', 'arrived_delivery',
    'delivered', 'completed', 'cancelled', 'disputed', 'refunded'
  )
);

-- ── 12. service_area_requests: add missing columns from spec ──
-- contact_email and contact_phone are already covered by email/phone columns.
-- Ensure lat/lng exist (they already do in schema but add IF NOT EXISTS for safety)
-- Nothing to add — existing table already has all needed columns.
