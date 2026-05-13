CREATE TABLE "add_ons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"price" double precision NOT NULL,
	"price_cents" integer,
	"description" text,
	"category" text DEFAULT 'service' NOT NULL,
	"is_active" integer DEFAULT 1,
	"price_mode" text DEFAULT 'per_order',
	CONSTRAINT "add_ons_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"label" text NOT NULL,
	"street" text NOT NULL,
	"apt" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"notes" text,
	"is_default" integer DEFAULT 0,
	"lat" double precision,
	"lng" double precision
);
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"old_value" text,
	"new_value" text,
	"ip" text,
	"user_agent" text,
	"notes" text,
	"timestamp" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"order_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"topic" text,
	"ai_resolved" integer DEFAULT 0,
	"escalated_to" integer,
	"messages_json" text,
	"created_at" text NOT NULL,
	"resolved_at" text
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"consent_type" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" text NOT NULL,
	"responded_at" text,
	"auto_approve_at" text,
	"requested_by" integer,
	"additional_charge" double precision DEFAULT 0,
	"additional_charge_cents" integer
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"reason" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"credit_amount" double precision,
	"refund_amount" double precision,
	"credit_amount_cents" integer,
	"refund_amount_cents" integer,
	"assigned_to" integer,
	"priority" text DEFAULT 'medium',
	"ai_suggested_resolution" text,
	"ai_sentiment_score" double precision,
	"ai_category" text,
	"ai_auto_resolvable" integer DEFAULT 0,
	"photo_evidence" text,
	"created_at" text NOT NULL,
	"resolved_at" text
);
--> statement-breakpoint
CREATE TABLE "driver_location_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" integer NOT NULL,
	"order_id" integer,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"speed" double precision,
	"heading" double precision,
	"accuracy" double precision,
	"timestamp" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"vendor_id" integer,
	"driver_ownership" text DEFAULT 'platform',
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"vehicle_type" text,
	"license_plate" text,
	"status" text DEFAULT 'available' NOT NULL,
	"rating" double precision DEFAULT 4.8,
	"completed_trips" integer DEFAULT 0,
	"avatar_url" text,
	"current_lat" double precision,
	"current_lng" double precision,
	"payout_per_trip" double precision DEFAULT 8.5,
	"total_earnings" double precision DEFAULT 0,
	"pending_payout" double precision DEFAULT 0,
	"payout_per_trip_cents" integer,
	"total_earnings_cents" integer,
	"pending_payout_cents" integer,
	"today_trips" integer DEFAULT 0,
	"current_route_json" text,
	"estimated_available_at" text,
	"max_trips_per_day" integer DEFAULT 15,
	"preferred_zones" text,
	"on_time_pickup_rate" double precision DEFAULT 0.95,
	"avg_pickup_time" double precision DEFAULT 12,
	"customer_rating_avg" double precision DEFAULT 4.8,
	"work_schedule" text
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"response" text NOT NULL,
	"status_code" integer NOT NULL,
	"created_at" text NOT NULL,
	"expires_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"order_id" integer,
	"type" text NOT NULL,
	"points" integer NOT NULL,
	"description" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"conversation_id" text,
	"sender_id" integer NOT NULL,
	"sender_role" text NOT NULL,
	"content" text NOT NULL,
	"message_type" text DEFAULT 'text',
	"is_ai_generated" integer DEFAULT 0,
	"read_at" text,
	"timestamp" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"audience" text NOT NULL,
	"channels" text NOT NULL,
	"title_template" text NOT NULL,
	"body_template" text NOT NULL,
	"is_active" integer DEFAULT 1,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"order_id" integer,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read" integer DEFAULT 0,
	"action_url" text,
	"category" text DEFAULT 'system',
	"priority" text DEFAULT 'normal',
	"icon" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_add_ons" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"add_on_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" double precision NOT NULL,
	"total" double precision NOT NULL,
	"unit_price_cents" integer,
	"total_cents" integer
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"description" text NOT NULL,
	"details" text,
	"actor_id" integer,
	"actor_role" text,
	"photo_url" text,
	"lat" double precision,
	"lng" double precision,
	"timestamp" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"type" text NOT NULL,
	"photo_data" text NOT NULL,
	"r2_key" text,
	"lat" double precision,
	"lng" double precision,
	"captured_by" integer NOT NULL,
	"captured_by_role" text NOT NULL,
	"notes" text,
	"timestamp" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"actor_id" integer,
	"actor_role" text,
	"notes" text,
	"lat" double precision,
	"lng" double precision,
	"timestamp" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" integer NOT NULL,
	"vendor_id" integer,
	"driver_id" integer,
	"return_driver_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"pickup_address_id" integer NOT NULL,
	"pickup_address" text NOT NULL,
	"delivery_address_id" integer,
	"delivery_address" text,
	"delivery_type" text DEFAULT 'contactless',
	"delivery_speed" text DEFAULT '48h',
	"scheduled_pickup" text,
	"pickup_time_window" text,
	"pickup_floor" integer,
	"pickup_has_elevator" integer DEFAULT 1,
	"pickup_handoff" text DEFAULT 'curbside',
	"delivery_floor" integer,
	"delivery_has_elevator" integer DEFAULT 1,
	"delivery_handoff" text DEFAULT 'curbside',
	"pickup_window_minutes" integer DEFAULT 30,
	"pickup_distance_miles" double precision,
	"pickup_distance_fee" double precision DEFAULT 0,
	"floor_fee" double precision DEFAULT 0,
	"handoff_fee" double precision DEFAULT 0,
	"traffic_multiplier" double precision DEFAULT 1,
	"window_discount" double precision DEFAULT 0,
	"address_notes" text,
	"bags" text NOT NULL,
	"preferences" text,
	"service_type" text DEFAULT 'wash_fold',
	"subtotal" double precision DEFAULT 0,
	"tax" double precision DEFAULT 0,
	"delivery_fee" double precision DEFAULT 0,
	"discount" double precision DEFAULT 0,
	"tip" double precision DEFAULT 0,
	"total" double precision DEFAULT 0,
	"pricing_tier_id" integer,
	"tier_name" text,
	"tier_flat_price" double precision,
	"tier_max_weight" double precision,
	"overage_weight" double precision DEFAULT 0,
	"overage_charge" double precision DEFAULT 0,
	"dirty_weight" double precision,
	"clean_weight" double precision,
	"weight_difference" double precision,
	"final_price" double precision,
	"intake_weight" double precision,
	"output_weight" double precision,
	"weight_discrepancy" integer DEFAULT 0,
	"certified_only" integer DEFAULT 1,
	"customer_notes" text,
	"payment_status" text DEFAULT 'pending',
	"payment_method_id" integer,
	"sla_deadline" text,
	"sla_status" text DEFAULT 'on_track',
	"vendor_payout" double precision DEFAULT 0,
	"driver_payout" double precision DEFAULT 0,
	"platform_fee" double precision DEFAULT 0,
	"subtotal_cents" integer,
	"tax_cents" integer,
	"delivery_fee_cents" integer,
	"discount_cents" integer,
	"total_cents" integer,
	"final_price_cents" integer,
	"vendor_payout_cents" integer,
	"driver_payout_cents" integer,
	"tier_flat_price_cents" integer,
	"payout_recorded" integer DEFAULT 0,
	"pickup_photo_url" text,
	"delivery_photo_url" text,
	"intake_photo_url" text,
	"ai_match_score" double precision,
	"ai_predicted_eta" text,
	"ai_pricing_tier" text,
	"ai_quality_score" double precision,
	"promo_code" text,
	"loyalty_points_earned" integer DEFAULT 0,
	"loyalty_points_redeemed" integer DEFAULT 0,
	"is_reorder" integer DEFAULT 0,
	"original_order_id" integer,
	"driver_arrived_at" text,
	"customer_handoff_at" text,
	"pickup_wait_minutes" double precision DEFAULT 0,
	"pickup_wait_fee" double precision DEFAULT 0,
	"confirmed_at" text,
	"picked_up_at" text,
	"arrived_laundromat_at" text,
	"wash_started_at" text,
	"wash_completed_at" text,
	"quality_checked_at" text,
	"out_for_delivery_at" text,
	"delivered_at" text,
	"cancelled_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "partner_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"applicant_type" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"address_line" text,
	"city" text,
	"state" text,
	"zip" text,
	"service_zips" text,
	"vehicle_type" text,
	"license_plate" text,
	"drivers_license_number" text,
	"drivers_license_state" text,
	"drivers_license_expiry" text,
	"insurance_carrier" text,
	"insurance_policy_number" text,
	"insurance_expiry" text,
	"has_clean_driving_record" integer,
	"years_driving" integer,
	"availability_json" text,
	"hours_per_week" integer,
	"owns_smartphone" integer,
	"consent_background_check" integer,
	"business_name" text,
	"business_legal_entity" text,
	"ein" text,
	"years_in_business" integer,
	"number_of_washers" integer,
	"number_of_dryers" integer,
	"largest_machine_lbs" integer,
	"daily_capacity_lbs" integer,
	"operating_hours_json" text,
	"services_offered_json" text,
	"accepts_commercial" integer,
	"accepts_rush_same_day" integer,
	"has_dry_cleaning_on_site" integer,
	"accepts_hypoallergenic" integer,
	"has_insurance" integer,
	"insurance_carrier_biz" text,
	"agrees_to_quality_standards" integer DEFAULT 0 NOT NULL,
	"agrees_to_pricing" integer DEFAULT 0 NOT NULL,
	"agrees_to_terms_of_service" integer DEFAULT 0 NOT NULL,
	"agrees_to_background_check" integer DEFAULT 0 NOT NULL,
	"why_join" text,
	"references" text,
	"auto_screen_score" integer,
	"auto_screen_flags" text,
	"auto_screen_recommendation" text,
	"reviewed_by_user_id" integer,
	"reviewed_at" text,
	"decline_reason" text,
	"result_user_id" integer,
	"result_driver_id" integer,
	"result_vendor_id" integer,
	"ip_address" text,
	"user_agent" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" text NOT NULL,
	"used_at" text,
	"created_at" text NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"last4" text,
	"expiry_date" text,
	"is_default" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" double precision NOT NULL,
	"amount_cents" integer,
	"currency" text DEFAULT 'usd',
	"status" text DEFAULT 'pending',
	"stripe_payment_intent_id" text,
	"stripe_transfer_id" text,
	"recipient_type" text,
	"recipient_id" integer,
	"platform_fee" double precision,
	"platform_fee_cents" integer,
	"metadata" text,
	"created_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "pricing_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"details" text NOT NULL,
	"actor_id" integer,
	"actor_role" text,
	"timestamp" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"updated_at" text NOT NULL,
	"updated_by" integer,
	CONSTRAINT "pricing_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "pricing_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"max_weight" double precision NOT NULL,
	"flat_price" double precision NOT NULL,
	"overage_rate" double precision NOT NULL,
	"flat_price_cents" integer,
	"overage_rate_cents" integer,
	"description" text,
	"icon" text,
	"is_active" integer DEFAULT 1,
	"sort_order" integer DEFAULT 0,
	CONSTRAINT "pricing_tiers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"value" double precision NOT NULL,
	"min_order_amount" double precision DEFAULT 0,
	"value_cents" integer,
	"min_order_amount_cents" integer,
	"max_uses" integer DEFAULT 0,
	"used_count" integer DEFAULT 0,
	"is_active" integer DEFAULT 1,
	"expires_at" text,
	"created_at" text NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "promo_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"promo_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"order_id" integer,
	"used_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_number" text NOT NULL,
	"customer_id" integer,
	"session_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"pickup_address" text NOT NULL,
	"pickup_city" text,
	"pickup_state" text,
	"pickup_zip" text,
	"pickup_lat" double precision,
	"pickup_lng" double precision,
	"delivery_address" text,
	"service_type" text DEFAULT 'wash_fold' NOT NULL,
	"tier_name" text NOT NULL,
	"tier_flat_price" double precision NOT NULL,
	"tier_max_weight" double precision NOT NULL,
	"overage_rate" double precision NOT NULL,
	"delivery_speed" text DEFAULT '48h' NOT NULL,
	"vendor_id" integer,
	"vendor_name" text,
	"is_preferred_vendor" integer DEFAULT 0,
	"laundry_service_price" double precision NOT NULL,
	"speed_surcharge" double precision DEFAULT 0,
	"delivery_fee" double precision DEFAULT 0,
	"preferred_vendor_surcharge" double precision DEFAULT 0,
	"add_ons_total" double precision DEFAULT 0,
	"subtotal" double precision NOT NULL,
	"tax_rate" double precision NOT NULL,
	"tax_amount" double precision NOT NULL,
	"discount" double precision DEFAULT 0,
	"total" double precision NOT NULL,
	"pickup_floor" integer,
	"pickup_has_elevator" integer DEFAULT 1,
	"pickup_handoff" text DEFAULT 'curbside',
	"pickup_window_minutes" integer DEFAULT 30,
	"pickup_distance_miles" double precision,
	"pickup_distance_fee" double precision DEFAULT 0,
	"floor_fee" double precision DEFAULT 0,
	"handoff_fee" double precision DEFAULT 0,
	"traffic_multiplier" double precision DEFAULT 1,
	"window_discount" double precision DEFAULT 0,
	"vendor_choice_mode" text DEFAULT 'auto',
	"subtotal_cents" integer,
	"tax_amount_cents" integer,
	"delivery_fee_cents" integer,
	"discount_cents" integer,
	"total_cents" integer,
	"tier_flat_price_cents" integer,
	"line_items_json" text,
	"add_ons_json" text,
	"expires_at" text NOT NULL,
	"locked_at" text,
	"promo_code" text,
	"promo_discount" double precision DEFAULT 0,
	"order_id" integer,
	"idempotency_key" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "quotes_quote_number_unique" UNIQUE("quote_number"),
	CONSTRAINT "quotes_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_id" integer NOT NULL,
	"referee_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"referrer_reward" double precision DEFAULT 10,
	"referee_reward" double precision DEFAULT 10,
	"referrer_reward_cents" integer,
	"referee_reward_cents" integer,
	"completed_order_id" integer,
	"created_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"vendor_id" integer,
	"driver_id" integer,
	"vendor_rating" integer,
	"driver_rating" integer,
	"overall_rating" integer NOT NULL,
	"comment" text,
	"ai_sentiment" text,
	"ai_topics" text,
	"ai_actionable" integer DEFAULT 0,
	"vendor_response" text,
	"vendor_responded_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_area_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"lat" double precision,
	"lng" double precision,
	"requested_service" text,
	"requested_speed" text,
	"requested_options" text,
	"source" text,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"base_price" double precision NOT NULL,
	"base_price_cents" integer,
	"unit" text DEFAULT 'lb' NOT NULL,
	"icon" text,
	"is_active" integer DEFAULT 1,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"created_at" text NOT NULL,
	"expires_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_type" text NOT NULL,
	"stripe_account_id" text,
	"status" text DEFAULT 'pending',
	"onboarding_complete" integer DEFAULT 0,
	"payouts_enabled" integer DEFAULT 0,
	"charges_enabled" integer DEFAULT 0,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_processed_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role" text DEFAULT 'customer' NOT NULL,
	"avatar_url" text,
	"member_since" text,
	"rating" double precision DEFAULT 5,
	"vendor_id" integer,
	"loyalty_points" integer DEFAULT 0,
	"loyalty_tier" text DEFAULT 'bronze',
	"referral_code" text,
	"referred_by" integer,
	"total_orders" integer DEFAULT 0,
	"total_spent" double precision DEFAULT 0,
	"total_spent_cents" integer,
	"preferred_detergent" text DEFAULT 'standard',
	"preferred_wash_temp" text DEFAULT 'cold',
	"special_instructions" text,
	"subscription_tier" text,
	"subscription_start_date" text,
	"subscription_end_date" text,
	"churn_risk" double precision DEFAULT 0,
	"last_active_at" text,
	"credits" integer DEFAULT 0,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vendor_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"amount" double precision NOT NULL,
	"amount_cents" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"orders_count" integer DEFAULT 0,
	"created_at" text NOT NULL,
	"paid_at" text
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"phone" text,
	"email" text,
	"rating" double precision DEFAULT 4.5,
	"review_count" integer DEFAULT 0,
	"certified" integer DEFAULT 1,
	"capacity" integer DEFAULT 50,
	"current_load" integer DEFAULT 0,
	"status" text DEFAULT 'active' NOT NULL,
	"capabilities" text,
	"avatar_url" text,
	"performance_tier" text DEFAULT 'standard',
	"lat" double precision,
	"lng" double precision,
	"payout_rate" double precision DEFAULT 0.65,
	"total_earnings" double precision DEFAULT 0,
	"pending_payout" double precision DEFAULT 0,
	"payout_rate_cents" integer,
	"total_earnings_cents" integer,
	"pending_payout_cents" integer,
	"ai_health_score" double precision DEFAULT 85,
	"avg_processing_time" double precision DEFAULT 180,
	"on_time_rate" double precision DEFAULT 0.95,
	"quality_score" double precision DEFAULT 4.5,
	"dispute_rate" double precision DEFAULT 0.02,
	"operating_hours" text,
	"operating_hours_json" text,
	"business_name" text,
	"contact_email" text,
	"business_address" text,
	"business_city" text,
	"business_state" text,
	"business_zip" text,
	"business_lat" real,
	"business_lng" real,
	"admin_override_open" integer DEFAULT 0,
	"offers_dry_cleaning" integer DEFAULT 0,
	"offers_alterations" integer DEFAULT 0,
	"offers_comforters" integer DEFAULT 0,
	"offers_commercial" integer DEFAULT 0,
	"offers_stain_treatment" integer DEFAULT 0,
	"offers_steam_press" integer DEFAULT 0,
	"offers_hang_dry" integer DEFAULT 0,
	"service_zips" text,
	"service_radius_miles" double precision,
	"service_area_type" text DEFAULT 'zip',
	"owns_drivers" integer DEFAULT 0,
	"pause_order_intake" integer DEFAULT 0,
	"acceptance_timeout_sec" integer DEFAULT 120,
	"avg_daily_orders" double precision DEFAULT 10,
	"peak_day_of_week" text DEFAULT 'Monday'
);
