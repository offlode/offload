DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='add_ons' AND column_name='price_cents') THEN
    ALTER TABLE "add_ons" ALTER COLUMN "price_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='add_ons' AND column_name='price_cents') THEN
    ALTER TABLE "add_ons" ALTER COLUMN "price_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='add_ons' AND column_name='is_active' AND data_type <> 'boolean') THEN
    ALTER TABLE "add_ons" ALTER COLUMN "is_active" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='add_ons' AND column_name='is_active') THEN
    ALTER TABLE "add_ons" ALTER COLUMN "is_active" SET DEFAULT true;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='addresses' AND column_name='is_default' AND data_type <> 'boolean') THEN
    ALTER TABLE "addresses" ALTER COLUMN "is_default" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_audit_log' AND column_name='timestamp' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "admin_audit_log" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_sessions' AND column_name='ai_resolved' AND data_type <> 'boolean') THEN
    ALTER TABLE "chat_sessions" ALTER COLUMN "ai_resolved" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_sessions' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "chat_sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_sessions' AND column_name='resolved_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "chat_sessions" ALTER COLUMN "resolved_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consent_records' AND column_name='requested_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "consent_records" ALTER COLUMN "requested_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consent_records' AND column_name='responded_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "consent_records" ALTER COLUMN "responded_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consent_records' AND column_name='auto_approve_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "consent_records" ALTER COLUMN "auto_approve_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consent_records' AND column_name='additional_charge_cents') THEN
    ALTER TABLE "consent_records" ALTER COLUMN "additional_charge_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consent_records' AND column_name='additional_charge_cents') THEN
    ALTER TABLE "consent_records" ALTER COLUMN "additional_charge_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='disputes' AND column_name='credit_amount_cents') THEN
    ALTER TABLE "disputes" ALTER COLUMN "credit_amount_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='disputes' AND column_name='credit_amount_cents') THEN
    ALTER TABLE "disputes" ALTER COLUMN "credit_amount_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='disputes' AND column_name='refund_amount_cents') THEN
    ALTER TABLE "disputes" ALTER COLUMN "refund_amount_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='disputes' AND column_name='refund_amount_cents') THEN
    ALTER TABLE "disputes" ALTER COLUMN "refund_amount_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='disputes' AND column_name='ai_auto_resolvable' AND data_type <> 'boolean') THEN
    ALTER TABLE "disputes" ALTER COLUMN "ai_auto_resolvable" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='disputes' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "disputes" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='disputes' AND column_name='resolved_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "disputes" ALTER COLUMN "resolved_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_location_history' AND column_name='timestamp' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "driver_location_history" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='payout_per_trip_cents') THEN
    ALTER TABLE "drivers" ALTER COLUMN "payout_per_trip_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='payout_per_trip_cents') THEN
    ALTER TABLE "drivers" ALTER COLUMN "payout_per_trip_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='total_earnings_cents') THEN
    ALTER TABLE "drivers" ALTER COLUMN "total_earnings_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='total_earnings_cents') THEN
    ALTER TABLE "drivers" ALTER COLUMN "total_earnings_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='pending_payout_cents') THEN
    ALTER TABLE "drivers" ALTER COLUMN "pending_payout_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='pending_payout_cents') THEN
    ALTER TABLE "drivers" ALTER COLUMN "pending_payout_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='estimated_available_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "drivers" ALTER COLUMN "estimated_available_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='idempotency_keys' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "idempotency_keys" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='idempotency_keys' AND column_name='expires_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "idempotency_keys" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loyalty_transactions' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "loyalty_transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='is_ai_generated' AND data_type <> 'boolean') THEN
    ALTER TABLE "messages" ALTER COLUMN "is_ai_generated" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='read_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "messages" ALTER COLUMN "read_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='timestamp' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "messages" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_rules' AND column_name='is_active' AND data_type <> 'boolean') THEN
    ALTER TABLE "notification_rules" ALTER COLUMN "is_active" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_rules' AND column_name='is_active') THEN
    ALTER TABLE "notification_rules" ALTER COLUMN "is_active" SET DEFAULT true;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_rules' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "notification_rules" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_rules' AND column_name='updated_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "notification_rules" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='read' AND data_type <> 'boolean') THEN
    ALTER TABLE "notifications" ALTER COLUMN "read" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "notifications" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_add_ons' AND column_name='unit_price_cents') THEN
    ALTER TABLE "order_add_ons" ALTER COLUMN "unit_price_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_add_ons' AND column_name='unit_price_cents') THEN
    ALTER TABLE "order_add_ons" ALTER COLUMN "unit_price_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_add_ons' AND column_name='total_cents') THEN
    ALTER TABLE "order_add_ons" ALTER COLUMN "total_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_add_ons' AND column_name='total_cents') THEN
    ALTER TABLE "order_add_ons" ALTER COLUMN "total_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_events' AND column_name='timestamp' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "order_events" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_photos' AND column_name='timestamp' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "order_photos" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_status_history' AND column_name='timestamp' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "order_status_history" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='pickup_has_elevator' AND data_type <> 'boolean') THEN
    ALTER TABLE "orders" ALTER COLUMN "pickup_has_elevator" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='pickup_has_elevator') THEN
    ALTER TABLE "orders" ALTER COLUMN "pickup_has_elevator" SET DEFAULT true;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_has_elevator' AND data_type <> 'boolean') THEN
    ALTER TABLE "orders" ALTER COLUMN "delivery_has_elevator" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_has_elevator') THEN
    ALTER TABLE "orders" ALTER COLUMN "delivery_has_elevator" SET DEFAULT true;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='weight_discrepancy' AND data_type <> 'boolean') THEN
    ALTER TABLE "orders" ALTER COLUMN "weight_discrepancy" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='certified_only' AND data_type <> 'boolean') THEN
    ALTER TABLE "orders" ALTER COLUMN "certified_only" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='certified_only') THEN
    ALTER TABLE "orders" ALTER COLUMN "certified_only" SET DEFAULT true;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='subtotal_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "subtotal_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='subtotal_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "subtotal_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='tax_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "tax_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='tax_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "tax_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_fee_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "delivery_fee_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_fee_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "delivery_fee_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='discount_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "discount_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='discount_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "discount_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='total_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "total_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='total_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "total_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='final_price_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "final_price_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='final_price_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "final_price_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='vendor_payout_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "vendor_payout_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='vendor_payout_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "vendor_payout_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='driver_payout_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "driver_payout_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='driver_payout_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "driver_payout_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='tier_flat_price_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "tier_flat_price_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='tier_flat_price_cents') THEN
    ALTER TABLE "orders" ALTER COLUMN "tier_flat_price_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payout_recorded' AND data_type <> 'boolean') THEN
    ALTER TABLE "orders" ALTER COLUMN "payout_recorded" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='is_reorder' AND data_type <> 'boolean') THEN
    ALTER TABLE "orders" ALTER COLUMN "is_reorder" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='driver_arrived_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "orders" ALTER COLUMN "driver_arrived_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='customer_handoff_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "orders" ALTER COLUMN "customer_handoff_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='confirmed_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "orders" ALTER COLUMN "confirmed_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='picked_up_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "orders" ALTER COLUMN "picked_up_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='arrived_laundromat_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "orders" ALTER COLUMN "arrived_laundromat_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='wash_started_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "orders" ALTER COLUMN "wash_started_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='wash_completed_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "orders" ALTER COLUMN "wash_completed_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='quality_checked_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "orders" ALTER COLUMN "quality_checked_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='out_for_delivery_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "orders" ALTER COLUMN "out_for_delivery_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivered_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "orders" ALTER COLUMN "delivered_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='cancelled_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "orders" ALTER COLUMN "cancelled_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "orders" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='updated_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "orders" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='has_clean_driving_record' AND data_type <> 'boolean') THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "has_clean_driving_record" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='owns_smartphone' AND data_type <> 'boolean') THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "owns_smartphone" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='consent_background_check' AND data_type <> 'boolean') THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "consent_background_check" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='accepts_commercial' AND data_type <> 'boolean') THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "accepts_commercial" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='accepts_rush_same_day' AND data_type <> 'boolean') THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "accepts_rush_same_day" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='has_dry_cleaning_on_site' AND data_type <> 'boolean') THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "has_dry_cleaning_on_site" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='accepts_hypoallergenic' AND data_type <> 'boolean') THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "accepts_hypoallergenic" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='has_insurance' AND data_type <> 'boolean') THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "has_insurance" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='agrees_to_quality_standards' AND data_type <> 'boolean') THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "agrees_to_quality_standards" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='agrees_to_pricing' AND data_type <> 'boolean') THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "agrees_to_pricing" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='agrees_to_terms_of_service' AND data_type <> 'boolean') THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "agrees_to_terms_of_service" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='agrees_to_background_check' AND data_type <> 'boolean') THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "agrees_to_background_check" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='reviewed_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "reviewed_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_applications' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "partner_applications" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='password_reset_tokens' AND column_name='expires_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "password_reset_tokens" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='password_reset_tokens' AND column_name='used_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "password_reset_tokens" ALTER COLUMN "used_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='password_reset_tokens' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "password_reset_tokens" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_methods' AND column_name='is_default' AND data_type <> 'boolean') THEN
    ALTER TABLE "payment_methods" ALTER COLUMN "is_default" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_transactions' AND column_name='amount_cents') THEN
    ALTER TABLE "payment_transactions" ALTER COLUMN "amount_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_transactions' AND column_name='amount_cents') THEN
    ALTER TABLE "payment_transactions" ALTER COLUMN "amount_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_transactions' AND column_name='platform_fee_cents') THEN
    ALTER TABLE "payment_transactions" ALTER COLUMN "platform_fee_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_transactions' AND column_name='platform_fee_cents') THEN
    ALTER TABLE "payment_transactions" ALTER COLUMN "platform_fee_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_transactions' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "payment_transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_transactions' AND column_name='completed_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "payment_transactions" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing_audit_log' AND column_name='timestamp' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "pricing_audit_log" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing_config' AND column_name='updated_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "pricing_config" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing_tiers' AND column_name='flat_price_cents') THEN
    ALTER TABLE "pricing_tiers" ALTER COLUMN "flat_price_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing_tiers' AND column_name='flat_price_cents') THEN
    ALTER TABLE "pricing_tiers" ALTER COLUMN "flat_price_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing_tiers' AND column_name='overage_rate_cents') THEN
    ALTER TABLE "pricing_tiers" ALTER COLUMN "overage_rate_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing_tiers' AND column_name='overage_rate_cents') THEN
    ALTER TABLE "pricing_tiers" ALTER COLUMN "overage_rate_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing_tiers' AND column_name='is_active' AND data_type <> 'boolean') THEN
    ALTER TABLE "pricing_tiers" ALTER COLUMN "is_active" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing_tiers' AND column_name='is_active') THEN
    ALTER TABLE "pricing_tiers" ALTER COLUMN "is_active" SET DEFAULT true;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promo_codes' AND column_name='value_cents') THEN
    ALTER TABLE "promo_codes" ALTER COLUMN "value_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promo_codes' AND column_name='value_cents') THEN
    ALTER TABLE "promo_codes" ALTER COLUMN "value_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promo_codes' AND column_name='min_order_amount_cents') THEN
    ALTER TABLE "promo_codes" ALTER COLUMN "min_order_amount_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promo_codes' AND column_name='min_order_amount_cents') THEN
    ALTER TABLE "promo_codes" ALTER COLUMN "min_order_amount_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promo_codes' AND column_name='is_active' AND data_type <> 'boolean') THEN
    ALTER TABLE "promo_codes" ALTER COLUMN "is_active" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promo_codes' AND column_name='is_active') THEN
    ALTER TABLE "promo_codes" ALTER COLUMN "is_active" SET DEFAULT true;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promo_codes' AND column_name='expires_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "promo_codes" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promo_codes' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "promo_codes" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promo_usage' AND column_name='used_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "promo_usage" ALTER COLUMN "used_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='push_tokens' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "push_tokens" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='is_preferred_vendor' AND data_type <> 'boolean') THEN
    ALTER TABLE "quotes" ALTER COLUMN "is_preferred_vendor" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='pickup_has_elevator' AND data_type <> 'boolean') THEN
    ALTER TABLE "quotes" ALTER COLUMN "pickup_has_elevator" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='pickup_has_elevator') THEN
    ALTER TABLE "quotes" ALTER COLUMN "pickup_has_elevator" SET DEFAULT true;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='subtotal_cents') THEN
    ALTER TABLE "quotes" ALTER COLUMN "subtotal_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='subtotal_cents') THEN
    ALTER TABLE "quotes" ALTER COLUMN "subtotal_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='tax_amount_cents') THEN
    ALTER TABLE "quotes" ALTER COLUMN "tax_amount_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='tax_amount_cents') THEN
    ALTER TABLE "quotes" ALTER COLUMN "tax_amount_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='delivery_fee_cents') THEN
    ALTER TABLE "quotes" ALTER COLUMN "delivery_fee_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='delivery_fee_cents') THEN
    ALTER TABLE "quotes" ALTER COLUMN "delivery_fee_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='discount_cents') THEN
    ALTER TABLE "quotes" ALTER COLUMN "discount_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='discount_cents') THEN
    ALTER TABLE "quotes" ALTER COLUMN "discount_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='total_cents') THEN
    ALTER TABLE "quotes" ALTER COLUMN "total_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='total_cents') THEN
    ALTER TABLE "quotes" ALTER COLUMN "total_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='tier_flat_price_cents') THEN
    ALTER TABLE "quotes" ALTER COLUMN "tier_flat_price_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='tier_flat_price_cents') THEN
    ALTER TABLE "quotes" ALTER COLUMN "tier_flat_price_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='expires_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "quotes" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='locked_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "quotes" ALTER COLUMN "locked_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "quotes" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='updated_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "quotes" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referrals' AND column_name='referrer_reward_cents') THEN
    ALTER TABLE "referrals" ALTER COLUMN "referrer_reward_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referrals' AND column_name='referrer_reward_cents') THEN
    ALTER TABLE "referrals" ALTER COLUMN "referrer_reward_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referrals' AND column_name='referee_reward_cents') THEN
    ALTER TABLE "referrals" ALTER COLUMN "referee_reward_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referrals' AND column_name='referee_reward_cents') THEN
    ALTER TABLE "referrals" ALTER COLUMN "referee_reward_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referrals' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "referrals" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referrals' AND column_name='completed_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "referrals" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='ai_actionable' AND data_type <> 'boolean') THEN
    ALTER TABLE "reviews" ALTER COLUMN "ai_actionable" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='vendor_responded_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "reviews" ALTER COLUMN "vendor_responded_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "reviews" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_area_requests' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "service_area_requests" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_area_requests' AND column_name='updated_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "service_area_requests" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_types' AND column_name='base_price_cents') THEN
    ALTER TABLE "service_types" ALTER COLUMN "base_price_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_types' AND column_name='base_price_cents') THEN
    ALTER TABLE "service_types" ALTER COLUMN "base_price_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_types' AND column_name='is_active' AND data_type <> 'boolean') THEN
    ALTER TABLE "service_types" ALTER COLUMN "is_active" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_types' AND column_name='is_active') THEN
    ALTER TABLE "service_types" ALTER COLUMN "is_active" SET DEFAULT true;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='expires_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stripe_accounts' AND column_name='onboarding_complete' AND data_type <> 'boolean') THEN
    ALTER TABLE "stripe_accounts" ALTER COLUMN "onboarding_complete" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stripe_accounts' AND column_name='payouts_enabled' AND data_type <> 'boolean') THEN
    ALTER TABLE "stripe_accounts" ALTER COLUMN "payouts_enabled" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stripe_accounts' AND column_name='charges_enabled' AND data_type <> 'boolean') THEN
    ALTER TABLE "stripe_accounts" ALTER COLUMN "charges_enabled" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stripe_accounts' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "stripe_accounts" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stripe_processed_events' AND column_name='processed_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "stripe_processed_events" ALTER COLUMN "processed_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='total_spent_cents') THEN
    ALTER TABLE "users" ALTER COLUMN "total_spent_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='total_spent_cents') THEN
    ALTER TABLE "users" ALTER COLUMN "total_spent_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_active_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "users" ALTER COLUMN "last_active_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendor_payouts' AND column_name='amount_cents') THEN
    ALTER TABLE "vendor_payouts" ALTER COLUMN "amount_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendor_payouts' AND column_name='amount_cents') THEN
    ALTER TABLE "vendor_payouts" ALTER COLUMN "amount_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendor_payouts' AND column_name='created_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "vendor_payouts" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendor_payouts' AND column_name='paid_at' AND data_type NOT IN ('timestamp with time zone')) THEN
    ALTER TABLE "vendor_payouts" ALTER COLUMN "paid_at" SET DATA TYPE timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='certified' AND data_type <> 'boolean') THEN
    ALTER TABLE "vendors" ALTER COLUMN "certified" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='certified') THEN
    ALTER TABLE "vendors" ALTER COLUMN "certified" SET DEFAULT true;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='payout_rate_cents') THEN
    ALTER TABLE "vendors" ALTER COLUMN "payout_rate_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='payout_rate_cents') THEN
    ALTER TABLE "vendors" ALTER COLUMN "payout_rate_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='total_earnings_cents') THEN
    ALTER TABLE "vendors" ALTER COLUMN "total_earnings_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='total_earnings_cents') THEN
    ALTER TABLE "vendors" ALTER COLUMN "total_earnings_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='pending_payout_cents') THEN
    ALTER TABLE "vendors" ALTER COLUMN "pending_payout_cents" SET DEFAULT 0;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='pending_payout_cents') THEN
    ALTER TABLE "vendors" ALTER COLUMN "pending_payout_cents" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='business_lat' AND data_type <> 'double precision') THEN
    ALTER TABLE "vendors" ALTER COLUMN "business_lat" SET DATA TYPE double precision;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='business_lng' AND data_type <> 'double precision') THEN
    ALTER TABLE "vendors" ALTER COLUMN "business_lng" SET DATA TYPE double precision;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='admin_override_open' AND data_type <> 'boolean') THEN
    ALTER TABLE "vendors" ALTER COLUMN "admin_override_open" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='offers_dry_cleaning' AND data_type <> 'boolean') THEN
    ALTER TABLE "vendors" ALTER COLUMN "offers_dry_cleaning" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='offers_alterations' AND data_type <> 'boolean') THEN
    ALTER TABLE "vendors" ALTER COLUMN "offers_alterations" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='offers_comforters' AND data_type <> 'boolean') THEN
    ALTER TABLE "vendors" ALTER COLUMN "offers_comforters" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='offers_commercial' AND data_type <> 'boolean') THEN
    ALTER TABLE "vendors" ALTER COLUMN "offers_commercial" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='offers_stain_treatment' AND data_type <> 'boolean') THEN
    ALTER TABLE "vendors" ALTER COLUMN "offers_stain_treatment" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='offers_steam_press' AND data_type <> 'boolean') THEN
    ALTER TABLE "vendors" ALTER COLUMN "offers_steam_press" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='offers_hang_dry' AND data_type <> 'boolean') THEN
    ALTER TABLE "vendors" ALTER COLUMN "offers_hang_dry" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='owns_drivers' AND data_type <> 'boolean') THEN
    ALTER TABLE "vendors" ALTER COLUMN "owns_drivers" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='pause_order_intake' AND data_type <> 'boolean') THEN
    ALTER TABLE "vendors" ALTER COLUMN "pause_order_intake" SET DATA TYPE boolean;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='pickup_distance_fee_cents') THEN
    ALTER TABLE "orders" ADD COLUMN "pickup_distance_fee_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='floor_fee_cents') THEN
    ALTER TABLE "orders" ADD COLUMN "floor_fee_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='handoff_fee_cents') THEN
    ALTER TABLE "orders" ADD COLUMN "handoff_fee_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='window_discount_cents') THEN
    ALTER TABLE "orders" ADD COLUMN "window_discount_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='tip_cents') THEN
    ALTER TABLE "orders" ADD COLUMN "tip_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='overage_charge_cents') THEN
    ALTER TABLE "orders" ADD COLUMN "overage_charge_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='platform_fee_cents') THEN
    ALTER TABLE "orders" ADD COLUMN "platform_fee_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='pickup_wait_fee_cents') THEN
    ALTER TABLE "orders" ADD COLUMN "pickup_wait_fee_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='public_token') THEN
    ALTER TABLE "quotes" ADD COLUMN "public_token" text;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='laundry_service_price_cents') THEN
    ALTER TABLE "quotes" ADD COLUMN "laundry_service_price_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='speed_surcharge_cents') THEN
    ALTER TABLE "quotes" ADD COLUMN "speed_surcharge_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='preferred_vendor_surcharge_cents') THEN
    ALTER TABLE "quotes" ADD COLUMN "preferred_vendor_surcharge_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='add_ons_total_cents') THEN
    ALTER TABLE "quotes" ADD COLUMN "add_ons_total_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='pickup_distance_fee_cents') THEN
    ALTER TABLE "quotes" ADD COLUMN "pickup_distance_fee_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='floor_fee_cents') THEN
    ALTER TABLE "quotes" ADD COLUMN "floor_fee_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='handoff_fee_cents') THEN
    ALTER TABLE "quotes" ADD COLUMN "handoff_fee_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='window_discount_cents') THEN
    ALTER TABLE "quotes" ADD COLUMN "window_discount_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='promo_discount_cents') THEN
    ALTER TABLE "quotes" ADD COLUMN "promo_discount_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addresses_user_id_users_id_fk') THEN
    ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_user_id_users_id_fk') THEN
    ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_order_id_orders_id_fk') THEN
    ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consent_records_order_id_orders_id_fk') THEN
    ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disputes_order_id_orders_id_fk') THEN
    ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disputes_customer_id_users_id_fk') THEN
    ALTER TABLE "disputes" ADD CONSTRAINT "disputes_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_location_history_driver_id_drivers_id_fk') THEN
    ALTER TABLE "driver_location_history" ADD CONSTRAINT "driver_location_history_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drivers_user_id_users_id_fk') THEN
    ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drivers_vendor_id_vendors_id_fk') THEN
    ALTER TABLE "drivers" ADD CONSTRAINT "drivers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_transactions_user_id_users_id_fk') THEN
    ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_transactions_order_id_orders_id_fk') THEN
    ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_order_id_orders_id_fk') THEN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_users_id_fk') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_add_ons_order_id_orders_id_fk') THEN
    ALTER TABLE "order_add_ons" ADD CONSTRAINT "order_add_ons_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_add_ons_add_on_id_add_ons_id_fk') THEN
    ALTER TABLE "order_add_ons" ADD CONSTRAINT "order_add_ons_add_on_id_add_ons_id_fk" FOREIGN KEY ("add_on_id") REFERENCES "public"."add_ons"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_events_order_id_orders_id_fk') THEN
    ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_events_actor_id_users_id_fk') THEN
    ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_photos_order_id_orders_id_fk') THEN
    ALTER TABLE "order_photos" ADD CONSTRAINT "order_photos_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_photos_captured_by_users_id_fk') THEN
    ALTER TABLE "order_photos" ADD CONSTRAINT "order_photos_captured_by_users_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_status_history_order_id_orders_id_fk') THEN
    ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_status_history_actor_id_users_id_fk') THEN
    ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_id_users_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_vendor_id_vendors_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_driver_id_drivers_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_return_driver_id_drivers_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_return_driver_id_drivers_id_fk" FOREIGN KEY ("return_driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_pickup_address_id_addresses_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_address_id_addresses_id_fk" FOREIGN KEY ("pickup_address_id") REFERENCES "public"."addresses"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_address_id_addresses_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_addresses_id_fk" FOREIGN KEY ("delivery_address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_tokens_user_id_users_id_fk') THEN
    ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_methods_user_id_users_id_fk') THEN
    ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_transactions_order_id_orders_id_fk') THEN
    ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pricing_audit_log_actor_id_users_id_fk') THEN
    ALTER TABLE "pricing_audit_log" ADD CONSTRAINT "pricing_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pricing_config_updated_by_users_id_fk') THEN
    ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promo_usage_promo_id_promo_codes_id_fk') THEN
    ALTER TABLE "promo_usage" ADD CONSTRAINT "promo_usage_promo_id_promo_codes_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promo_usage_user_id_users_id_fk') THEN
    ALTER TABLE "promo_usage" ADD CONSTRAINT "promo_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_tokens_user_id_users_id_fk') THEN
    ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_customer_id_users_id_fk') THEN
    ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_vendor_id_vendors_id_fk') THEN
    ALTER TABLE "quotes" ADD CONSTRAINT "quotes_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referrals_referrer_id_users_id_fk') THEN
    ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referrals_referee_id_users_id_fk') THEN
    ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referrals_completed_order_id_orders_id_fk') THEN
    ALTER TABLE "referrals" ADD CONSTRAINT "referrals_completed_order_id_orders_id_fk" FOREIGN KEY ("completed_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_order_id_orders_id_fk') THEN
    ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_customer_id_users_id_fk') THEN
    ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_vendor_id_vendors_id_fk') THEN
    ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_users_id_fk') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_accounts_user_id_users_id_fk') THEN
    ALTER TABLE "stripe_accounts" ADD CONSTRAINT "stripe_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_payouts_vendor_id_vendors_id_fk') THEN
    ALTER TABLE "vendor_payouts" ADD CONSTRAINT "vendor_payouts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_applications_email_unique') THEN
    ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_email_unique" UNIQUE("email");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_status_check" CHECK ("orders"."status" IN ('draft_quote', 'quoted', 'quote_accepted', 'quote_expired', 'payment_pending', 'confirmed', 'pending', 'scheduled', 'driver_assigned', 'driver_en_route_pickup', 'arrived_pickup', 'picked_up', 'driver_en_route_facility', 'at_facility', 'processing', 'washing', 'drying', 'folding', 'ready_for_delivery', 'driver_en_route_delivery', 'arrived_delivery', 'delivered', 'completed', 'cancelled'));
  END IF;
END $$;
