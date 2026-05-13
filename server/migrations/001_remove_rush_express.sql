-- Migration 001: Enforce 3-tier delivery + correct bag pricing
-- Applied: 2026-05-06
-- Removes express_3h / rush_2hr references, fixes pricing tier values

-- 1. Downgrade any express_3h orders to same_day
UPDATE orders SET delivery_speed = 'same_day' WHERE delivery_speed = 'express_3h';

-- 2. Deactivate rush_2hr add-on. Historical note: an earlier version hard-deleted this row;
-- a forward-compatible Wave A migration re-inserts it as inactive if needed.
UPDATE add_ons SET is_active = 0 WHERE name = 'rush_2hr';

-- 3. Fix pricing tiers to correct values
UPDATE pricing_tiers SET flat_price = 24.99, overage_rate = 2.50, max_weight = 10 WHERE name = 'small_bag';
UPDATE pricing_tiers SET flat_price = 44.99, overage_rate = 2.50, max_weight = 20 WHERE name = 'medium_bag';
UPDATE pricing_tiers SET flat_price = 59.99, overage_rate = 2.50, max_weight = 30 WHERE name = 'large_bag';
UPDATE pricing_tiers SET flat_price = 89.99, overage_rate = 2.50, max_weight = 50 WHERE name = 'xl_bag';

-- 4. Remove rush/express config keys
DELETE FROM system_config WHERE key IN ('delivery_fee_rush', 'speed_surcharge_2hr');
