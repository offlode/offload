CREATE TABLE `add_ons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`price` real NOT NULL,
	`description` text,
	`category` text DEFAULT 'service' NOT NULL,
	`is_active` integer DEFAULT 1
);
CREATE TABLE sqlite_sequence(name,seq);
CREATE UNIQUE INDEX `add_ons_name_unique` ON `add_ons` (`name`);
CREATE TABLE `addresses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`label` text NOT NULL,
	`street` text NOT NULL,
	`apt` text,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`zip` text NOT NULL,
	`notes` text,
	`is_default` integer DEFAULT 0,
	`lat` real,
	`lng` real
);
CREATE TABLE `chat_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`order_id` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`topic` text,
	`ai_resolved` integer DEFAULT 0,
	`escalated_to` integer,
	`messages_json` text,
	`created_at` text NOT NULL,
	`resolved_at` text
);
CREATE TABLE `consent_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`consent_type` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` text NOT NULL,
	`responded_at` text,
	`auto_approve_at` text,
	`requested_by` integer,
	`additional_charge` real DEFAULT 0
);
CREATE TABLE `disputes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`reason` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`credit_amount` real,
	`refund_amount` real,
	`assigned_to` integer,
	`priority` text DEFAULT 'medium',
	`ai_suggested_resolution` text,
	`ai_sentiment_score` real,
	`ai_category` text,
	`ai_auto_resolvable` integer DEFAULT 0,
	`photo_evidence` text,
	`created_at` text NOT NULL,
	`resolved_at` text
);
CREATE TABLE `driver_location_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`driver_id` integer NOT NULL,
	`order_id` integer,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`speed` real,
	`heading` real,
	`accuracy` real,
	`timestamp` text NOT NULL
);
CREATE TABLE `drivers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`vehicle_type` text,
	`license_plate` text,
	`status` text DEFAULT 'available' NOT NULL,
	`rating` real DEFAULT 4.8,
	`completed_trips` integer DEFAULT 0,
	`avatar_url` text,
	`current_lat` real,
	`current_lng` real,
	`payout_per_trip` real DEFAULT 8.5,
	`total_earnings` real DEFAULT 0,
	`pending_payout` real DEFAULT 0,
	`today_trips` integer DEFAULT 0,
	`current_route_json` text,
	`estimated_available_at` text,
	`max_trips_per_day` integer DEFAULT 15,
	`preferred_zones` text,
	`on_time_pickup_rate` real DEFAULT 0.95,
	`avg_pickup_time` real DEFAULT 12,
	`customer_rating_avg` real DEFAULT 4.8
);
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`response` text NOT NULL,
	`status_code` integer NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
CREATE TABLE `loyalty_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`order_id` integer,
	`type` text NOT NULL,
	`points` integer NOT NULL,
	`description` text NOT NULL,
	`created_at` text NOT NULL
);
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer,
	`conversation_id` text,
	`sender_id` integer NOT NULL,
	`sender_role` text NOT NULL,
	`content` text NOT NULL,
	`message_type` text DEFAULT 'text',
	`is_ai_generated` integer DEFAULT 0,
	`read_at` text,
	`timestamp` text NOT NULL
);
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`order_id` integer,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`read` integer DEFAULT 0,
	`action_url` text,
	`category` text DEFAULT 'system',
	`priority` text DEFAULT 'normal',
	`icon` text,
	`created_at` text NOT NULL
);
CREATE TABLE `order_add_ons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`add_on_id` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price` real NOT NULL,
	`total` real NOT NULL
);
CREATE TABLE `order_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`description` text NOT NULL,
	`details` text,
	`actor_id` integer,
	`actor_role` text,
	`photo_url` text,
	`lat` real,
	`lng` real,
	`timestamp` text NOT NULL
);
CREATE TABLE `order_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`type` text NOT NULL,
	`photo_data` text NOT NULL,
	`r2_key` text,
	`lat` real,
	`lng` real,
	`captured_by` integer NOT NULL,
	`captured_by_role` text NOT NULL,
	`notes` text,
	`timestamp` text NOT NULL
);
CREATE TABLE `order_status_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`actor_id` integer,
	`actor_role` text,
	`notes` text,
	`lat` real,
	`lng` real,
	`timestamp` text NOT NULL
);
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_number` text NOT NULL,
	`customer_id` integer NOT NULL,
	`vendor_id` integer,
	`driver_id` integer,
	`return_driver_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`pickup_address_id` integer NOT NULL,
	`pickup_address` text NOT NULL,
	`delivery_address_id` integer,
	`delivery_address` text,
	`delivery_type` text DEFAULT 'contactless',
	`delivery_speed` text DEFAULT '48h',
	`scheduled_pickup` text,
	`pickup_time_window` text,
	`address_notes` text,
	`bags` text NOT NULL,
	`preferences` text,
	`service_type` text DEFAULT 'wash_fold',
	`subtotal` real DEFAULT 0,
	`tax` real DEFAULT 0,
	`delivery_fee` real DEFAULT 0,
	`discount` real DEFAULT 0,
	`tip` real DEFAULT 0,
	`total` real DEFAULT 0,
	`pricing_tier_id` integer,
	`tier_name` text,
	`tier_flat_price` real,
	`tier_max_weight` real,
	`overage_weight` real DEFAULT 0,
	`overage_charge` real DEFAULT 0,
	`dirty_weight` real,
	`clean_weight` real,
	`weight_difference` real,
	`final_price` real,
	`intake_weight` real,
	`output_weight` real,
	`weight_discrepancy` integer DEFAULT 0,
	`certified_only` integer DEFAULT 1,
	`customer_notes` text,
	`payment_status` text DEFAULT 'pending',
	`payment_method_id` integer,
	`sla_deadline` text,
	`sla_status` text DEFAULT 'on_track',
	`vendor_payout` real DEFAULT 0,
	`driver_payout` real DEFAULT 0,
	`platform_fee` real DEFAULT 0,
	`pickup_photo_url` text,
	`delivery_photo_url` text,
	`intake_photo_url` text,
	`ai_match_score` real,
	`ai_predicted_eta` text,
	`ai_pricing_tier` text,
	`ai_quality_score` real,
	`promo_code` text,
	`loyalty_points_earned` integer DEFAULT 0,
	`loyalty_points_redeemed` integer DEFAULT 0,
	`is_reorder` integer DEFAULT 0,
	`original_order_id` integer,
	`confirmed_at` text,
	`picked_up_at` text,
	`arrived_laundromat_at` text,
	`wash_started_at` text,
	`wash_completed_at` text,
	`quality_checked_at` text,
	`out_for_delivery_at` text,
	`delivered_at` text,
	`cancelled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);
CREATE TABLE `password_reset_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL
);
CREATE UNIQUE INDEX `password_reset_tokens_token_unique` ON `password_reset_tokens` (`token`);
CREATE TABLE `payment_methods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`last4` text,
	`expiry_date` text,
	`is_default` integer DEFAULT 0
);
CREATE TABLE `payment_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'usd',
	`status` text DEFAULT 'pending',
	`stripe_payment_intent_id` text,
	`stripe_transfer_id` text,
	`recipient_type` text,
	`recipient_id` integer,
	`platform_fee` real,
	`metadata` text,
	`created_at` text NOT NULL,
	`completed_at` text
);
CREATE TABLE `pricing_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`details` text NOT NULL,
	`actor_id` integer,
	`actor_role` text,
	`timestamp` text NOT NULL
);
CREATE TABLE `pricing_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`updated_at` text NOT NULL,
	`updated_by` integer
);
CREATE UNIQUE INDEX `pricing_config_key_unique` ON `pricing_config` (`key`);
CREATE TABLE `pricing_tiers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`max_weight` real NOT NULL,
	`flat_price` real NOT NULL,
	`overage_rate` real NOT NULL,
	`description` text,
	`icon` text,
	`is_active` integer DEFAULT 1,
	`sort_order` integer DEFAULT 0
);
CREATE UNIQUE INDEX `pricing_tiers_name_unique` ON `pricing_tiers` (`name`);
CREATE TABLE `promo_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`type` text NOT NULL,
	`value` real NOT NULL,
	`min_order_amount` real DEFAULT 0,
	`max_uses` integer DEFAULT 0,
	`used_count` integer DEFAULT 0,
	`is_active` integer DEFAULT 1,
	`expires_at` text,
	`created_at` text NOT NULL
);
CREATE UNIQUE INDEX `promo_codes_code_unique` ON `promo_codes` (`code`);
CREATE TABLE `promo_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`promo_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`order_id` integer,
	`used_at` text NOT NULL
);
CREATE TABLE `quotes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quote_number` text NOT NULL,
	`customer_id` integer,
	`session_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`pickup_address` text NOT NULL,
	`pickup_city` text,
	`pickup_state` text,
	`pickup_zip` text,
	`pickup_lat` real,
	`pickup_lng` real,
	`delivery_address` text,
	`service_type` text DEFAULT 'wash_fold' NOT NULL,
	`tier_name` text NOT NULL,
	`tier_flat_price` real NOT NULL,
	`tier_max_weight` real NOT NULL,
	`overage_rate` real NOT NULL,
	`delivery_speed` text DEFAULT '48h' NOT NULL,
	`vendor_id` integer,
	`vendor_name` text,
	`is_preferred_vendor` integer DEFAULT 0,
	`laundry_service_price` real NOT NULL,
	`speed_surcharge` real DEFAULT 0,
	`delivery_fee` real DEFAULT 0,
	`preferred_vendor_surcharge` real DEFAULT 0,
	`add_ons_total` real DEFAULT 0,
	`subtotal` real NOT NULL,
	`tax_rate` real NOT NULL,
	`tax_amount` real NOT NULL,
	`discount` real DEFAULT 0,
	`total` real NOT NULL,
	`line_items_json` text,
	`add_ons_json` text,
	`expires_at` text NOT NULL,
	`locked_at` text,
	`promo_code` text,
	`promo_discount` real DEFAULT 0,
	`order_id` integer,
	`idempotency_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `quotes_quote_number_unique` ON `quotes` (`quote_number`);
CREATE UNIQUE INDEX `quotes_idempotency_key_unique` ON `quotes` (`idempotency_key`);
CREATE TABLE `referrals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`referrer_id` integer NOT NULL,
	`referee_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`referrer_reward` real DEFAULT 10,
	`referee_reward` real DEFAULT 10,
	`completed_order_id` integer,
	`created_at` text NOT NULL,
	`completed_at` text
);
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`vendor_id` integer,
	`driver_id` integer,
	`vendor_rating` integer,
	`driver_rating` integer,
	`overall_rating` integer NOT NULL,
	`comment` text,
	`ai_sentiment` text,
	`ai_topics` text,
	`ai_actionable` integer DEFAULT 0,
	`vendor_response` text,
	`vendor_responded_at` text,
	`created_at` text NOT NULL
);
CREATE TABLE `service_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`base_price` real NOT NULL,
	`unit` text DEFAULT 'lb' NOT NULL,
	`icon` text,
	`is_active` integer DEFAULT 1,
	`sort_order` integer DEFAULT 0
);
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
CREATE TABLE `stripe_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`user_type` text NOT NULL,
	`stripe_account_id` text,
	`status` text DEFAULT 'pending',
	`onboarding_complete` integer DEFAULT 0,
	`payouts_enabled` integer DEFAULT 0,
	`charges_enabled` integer DEFAULT 0,
	`created_at` text NOT NULL
);
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`role` text DEFAULT 'customer' NOT NULL,
	`avatar_url` text,
	`member_since` text,
	`rating` real DEFAULT 5,
	`vendor_id` integer,
	`loyalty_points` integer DEFAULT 0,
	`loyalty_tier` text DEFAULT 'bronze',
	`referral_code` text,
	`referred_by` integer,
	`total_orders` integer DEFAULT 0,
	`total_spent` real DEFAULT 0,
	`preferred_detergent` text DEFAULT 'standard',
	`preferred_wash_temp` text DEFAULT 'cold',
	`special_instructions` text,
	`subscription_tier` text,
	`subscription_start_date` text,
	`subscription_end_date` text,
	`churn_risk` real DEFAULT 0,
	`last_active_at` text,
	`credits` integer DEFAULT 0
);
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
CREATE TABLE `vendor_payouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendor_id` integer NOT NULL,
	`amount` real NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`orders_count` integer DEFAULT 0,
	`created_at` text NOT NULL,
	`paid_at` text
);
CREATE TABLE `vendors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`phone` text,
	`email` text,
	`rating` real DEFAULT 4.5,
	`review_count` integer DEFAULT 0,
	`certified` integer DEFAULT 1,
	`capacity` integer DEFAULT 50,
	`current_load` integer DEFAULT 0,
	`status` text DEFAULT 'active' NOT NULL,
	`capabilities` text,
	`avatar_url` text,
	`performance_tier` text DEFAULT 'standard',
	`lat` real,
	`lng` real,
	`payout_rate` real DEFAULT 0.65,
	`total_earnings` real DEFAULT 0,
	`pending_payout` real DEFAULT 0,
	`ai_health_score` real DEFAULT 85,
	`avg_processing_time` real DEFAULT 180,
	`on_time_rate` real DEFAULT 0.95,
	`quality_score` real DEFAULT 4.5,
	`dispute_rate` real DEFAULT 0.02,
	`operating_hours` text,
	`offers_dry_cleaning` integer DEFAULT 0,
	`offers_alterations` integer DEFAULT 0,
	`offers_comforters` integer DEFAULT 0,
	`offers_commercial` integer DEFAULT 0,
	`avg_daily_orders` real DEFAULT 10,
	`peak_day_of_week` text DEFAULT 'Monday'
);
