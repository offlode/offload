ALTER TABLE "add_ons" ALTER COLUMN "price_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "add_ons" ALTER COLUMN "price_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "add_ons" ALTER COLUMN "is_active" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "add_ons" ALTER COLUMN "is_active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "addresses" ALTER COLUMN "is_default" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_sessions" ALTER COLUMN "ai_resolved" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "chat_sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_sessions" ALTER COLUMN "resolved_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consent_records" ALTER COLUMN "requested_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consent_records" ALTER COLUMN "responded_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consent_records" ALTER COLUMN "auto_approve_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consent_records" ALTER COLUMN "additional_charge_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "consent_records" ALTER COLUMN "additional_charge_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "credit_amount_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "credit_amount_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "refund_amount_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "refund_amount_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "ai_auto_resolvable" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "resolved_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "driver_location_history" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drivers" ALTER COLUMN "payout_per_trip_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "drivers" ALTER COLUMN "payout_per_trip_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ALTER COLUMN "total_earnings_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "drivers" ALTER COLUMN "total_earnings_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ALTER COLUMN "pending_payout_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "drivers" ALTER COLUMN "pending_payout_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ALTER COLUMN "estimated_available_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "is_ai_generated" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "read_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_rules" ALTER COLUMN "is_active" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "notification_rules" ALTER COLUMN "is_active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "notification_rules" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_rules" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "read" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_add_ons" ALTER COLUMN "unit_price_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_add_ons" ALTER COLUMN "unit_price_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_add_ons" ALTER COLUMN "total_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_add_ons" ALTER COLUMN "total_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_events" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_photos" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "pickup_has_elevator" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "pickup_has_elevator" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "delivery_has_elevator" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "delivery_has_elevator" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "weight_discrepancy" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "certified_only" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "certified_only" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "subtotal_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "subtotal_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "tax_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "tax_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "delivery_fee_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "delivery_fee_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "discount_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "discount_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "total_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "total_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "final_price_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "final_price_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "vendor_payout_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "vendor_payout_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "driver_payout_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "driver_payout_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "tier_flat_price_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "tier_flat_price_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payout_recorded" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "is_reorder" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "driver_arrived_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "customer_handoff_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "confirmed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "picked_up_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "arrived_laundromat_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "wash_started_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "wash_completed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "quality_checked_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "out_for_delivery_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "delivered_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "cancelled_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "has_clean_driving_record" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "owns_smartphone" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "consent_background_check" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "accepts_commercial" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "accepts_rush_same_day" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "has_dry_cleaning_on_site" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "accepts_hypoallergenic" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "has_insurance" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "agrees_to_quality_standards" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "agrees_to_pricing" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "agrees_to_terms_of_service" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "agrees_to_background_check" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "reviewed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partner_applications" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ALTER COLUMN "used_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_methods" ALTER COLUMN "is_default" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "payment_transactions" ALTER COLUMN "amount_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "payment_transactions" ALTER COLUMN "amount_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_transactions" ALTER COLUMN "platform_fee_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "payment_transactions" ALTER COLUMN "platform_fee_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_transactions" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pricing_audit_log" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pricing_config" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ALTER COLUMN "flat_price_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ALTER COLUMN "flat_price_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ALTER COLUMN "overage_rate_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ALTER COLUMN "overage_rate_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ALTER COLUMN "is_active" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ALTER COLUMN "is_active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "value_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "value_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "min_order_amount_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "min_order_amount_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "is_active" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "is_active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promo_usage" ALTER COLUMN "used_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "push_tokens" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "is_preferred_vendor" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "pickup_has_elevator" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "pickup_has_elevator" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "subtotal_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "subtotal_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "tax_amount_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "tax_amount_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "delivery_fee_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "delivery_fee_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "discount_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "discount_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "total_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "total_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "tier_flat_price_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "tier_flat_price_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "locked_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referrals" ALTER COLUMN "referrer_reward_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "referrals" ALTER COLUMN "referrer_reward_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "referrals" ALTER COLUMN "referee_reward_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "referrals" ALTER COLUMN "referee_reward_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "referrals" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referrals" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "ai_actionable" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "vendor_responded_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_area_requests" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_area_requests" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_types" ALTER COLUMN "base_price_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "service_types" ALTER COLUMN "base_price_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "service_types" ALTER COLUMN "is_active" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "service_types" ALTER COLUMN "is_active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_accounts" ALTER COLUMN "onboarding_complete" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "stripe_accounts" ALTER COLUMN "payouts_enabled" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "stripe_accounts" ALTER COLUMN "charges_enabled" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "stripe_accounts" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_processed_events" ALTER COLUMN "processed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "total_spent_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "total_spent_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_active_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendor_payouts" ALTER COLUMN "amount_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "vendor_payouts" ALTER COLUMN "amount_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_payouts" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendor_payouts" ALTER COLUMN "paid_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "certified" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "certified" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "payout_rate_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "payout_rate_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "total_earnings_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "total_earnings_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "pending_payout_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "pending_payout_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "business_lat" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "business_lng" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "admin_override_open" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "offers_dry_cleaning" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "offers_alterations" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "offers_comforters" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "offers_commercial" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "offers_stain_treatment" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "offers_steam_press" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "offers_hang_dry" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "owns_drivers" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "pause_order_intake" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pickup_distance_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "floor_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "handoff_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "window_discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tip_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "overage_charge_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "platform_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pickup_wait_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "laundry_service_price_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "speed_surcharge_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "preferred_vendor_surcharge_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "add_ons_total_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "pickup_distance_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "floor_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "handoff_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "window_discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "promo_discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_location_history" ADD CONSTRAINT "driver_location_history_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_add_ons" ADD CONSTRAINT "order_add_ons_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_add_ons" ADD CONSTRAINT "order_add_ons_add_on_id_add_ons_id_fk" FOREIGN KEY ("add_on_id") REFERENCES "public"."add_ons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_photos" ADD CONSTRAINT "order_photos_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_photos" ADD CONSTRAINT "order_photos_captured_by_users_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_return_driver_id_drivers_id_fk" FOREIGN KEY ("return_driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_address_id_addresses_id_fk" FOREIGN KEY ("pickup_address_id") REFERENCES "public"."addresses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_addresses_id_fk" FOREIGN KEY ("delivery_address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_audit_log" ADD CONSTRAINT "pricing_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_usage" ADD CONSTRAINT "promo_usage_promo_id_promo_codes_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_usage" ADD CONSTRAINT "promo_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_completed_order_id_orders_id_fk" FOREIGN KEY ("completed_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_accounts" ADD CONSTRAINT "stripe_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payouts" ADD CONSTRAINT "vendor_payouts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_check" CHECK ("orders"."status" IN ('draft_quote', 'quoted', 'quote_accepted', 'quote_expired', 'payment_pending', 'confirmed', 'pending', 'scheduled', 'driver_assigned', 'driver_en_route_pickup', 'arrived_pickup', 'picked_up', 'driver_en_route_facility', 'at_facility', 'processing', 'washing', 'drying', 'folding', 'ready_for_delivery', 'driver_en_route_delivery', 'arrived_delivery', 'delivered', 'completed', 'cancelled'));