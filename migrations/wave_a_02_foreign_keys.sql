-- Wave A2: Foreign-key constraints. Rollback: drop listed constraints.
DO $$
BEGIN

  IF to_regclass('users') IS NOT NULL AND to_regclass('vendors') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='vendor_id') THEN
    EXECUTE 'UPDATE users t SET vendor_id = NULL WHERE vendor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendors r WHERE r.id = t.vendor_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_vendor_id_fkey') THEN
      ALTER TABLE users ADD CONSTRAINT users_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('users') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='referred_by') THEN
    EXECUTE 'UPDATE users t SET referred_by = NULL WHERE referred_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users r WHERE r.id = t.referred_by)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_referred_by_fkey') THEN
      ALTER TABLE users ADD CONSTRAINT users_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('addresses') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='addresses' AND column_name='user_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addresses_user_id_fkey') THEN
      ALTER TABLE addresses ADD CONSTRAINT addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('drivers') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='user_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drivers_user_id_fkey') THEN
      ALTER TABLE drivers ADD CONSTRAINT drivers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('drivers') IS NOT NULL AND to_regclass('vendors') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='vendor_id') THEN
    EXECUTE 'UPDATE drivers t SET vendor_id = NULL WHERE vendor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendors r WHERE r.id = t.vendor_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drivers_vendor_id_fkey') THEN
      ALTER TABLE drivers ADD CONSTRAINT drivers_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('orders') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='customer_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_id_fkey') THEN
      ALTER TABLE orders ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('orders') IS NOT NULL AND to_regclass('vendors') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='vendor_id') THEN
    EXECUTE 'UPDATE orders t SET vendor_id = NULL WHERE vendor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendors r WHERE r.id = t.vendor_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_vendor_id_fkey') THEN
      ALTER TABLE orders ADD CONSTRAINT orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('orders') IS NOT NULL AND to_regclass('drivers') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='driver_id') THEN
    EXECUTE 'UPDATE orders t SET driver_id = NULL WHERE driver_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM drivers r WHERE r.id = t.driver_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_driver_id_fkey') THEN
      ALTER TABLE orders ADD CONSTRAINT orders_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('orders') IS NOT NULL AND to_regclass('drivers') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='return_driver_id') THEN
    EXECUTE 'UPDATE orders t SET return_driver_id = NULL WHERE return_driver_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM drivers r WHERE r.id = t.return_driver_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_return_driver_id_fkey') THEN
      ALTER TABLE orders ADD CONSTRAINT orders_return_driver_id_fkey FOREIGN KEY (return_driver_id) REFERENCES drivers(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('orders') IS NOT NULL AND to_regclass('addresses') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='pickup_address_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_pickup_address_id_fkey') THEN
      ALTER TABLE orders ADD CONSTRAINT orders_pickup_address_id_fkey FOREIGN KEY (pickup_address_id) REFERENCES addresses(id) ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('orders') IS NOT NULL AND to_regclass('addresses') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_address_id') THEN
    EXECUTE 'UPDATE orders t SET delivery_address_id = NULL WHERE delivery_address_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM addresses r WHERE r.id = t.delivery_address_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_address_id_fkey') THEN
      ALTER TABLE orders ADD CONSTRAINT orders_delivery_address_id_fkey FOREIGN KEY (delivery_address_id) REFERENCES addresses(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('orders') IS NOT NULL AND to_regclass('pricing_tiers') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='pricing_tier_id') THEN
    EXECUTE 'UPDATE orders t SET pricing_tier_id = NULL WHERE pricing_tier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pricing_tiers r WHERE r.id = t.pricing_tier_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_pricing_tier_id_fkey') THEN
      ALTER TABLE orders ADD CONSTRAINT orders_pricing_tier_id_fkey FOREIGN KEY (pricing_tier_id) REFERENCES pricing_tiers(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('orders') IS NOT NULL AND to_regclass('payment_methods') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_method_id') THEN
    EXECUTE 'UPDATE orders t SET payment_method_id = NULL WHERE payment_method_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payment_methods r WHERE r.id = t.payment_method_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_id_fkey') THEN
      ALTER TABLE orders ADD CONSTRAINT orders_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('orders') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='original_order_id') THEN
    EXECUTE 'UPDATE orders t SET original_order_id = NULL WHERE original_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders r WHERE r.id = t.original_order_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_original_order_id_fkey') THEN
      ALTER TABLE orders ADD CONSTRAINT orders_original_order_id_fkey FOREIGN KEY (original_order_id) REFERENCES orders(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('order_events') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_events' AND column_name='order_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_events_order_id_fkey') THEN
      ALTER TABLE order_events ADD CONSTRAINT order_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('order_events') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_events' AND column_name='actor_id') THEN
    EXECUTE 'UPDATE order_events t SET actor_id = NULL WHERE actor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users r WHERE r.id = t.actor_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_events_actor_id_fkey') THEN
      ALTER TABLE order_events ADD CONSTRAINT order_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('payment_methods') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_methods' AND column_name='user_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_methods_user_id_fkey') THEN
      ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('consent_records') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consent_records' AND column_name='order_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consent_records_order_id_fkey') THEN
      ALTER TABLE consent_records ADD CONSTRAINT consent_records_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('messages') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='order_id') THEN
    EXECUTE 'UPDATE messages t SET order_id = NULL WHERE order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders r WHERE r.id = t.order_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_order_id_fkey') THEN
      ALTER TABLE messages ADD CONSTRAINT messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('disputes') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='disputes' AND column_name='order_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disputes_order_id_fkey') THEN
      ALTER TABLE disputes ADD CONSTRAINT disputes_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('disputes') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='disputes' AND column_name='customer_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disputes_customer_id_fkey') THEN
      ALTER TABLE disputes ADD CONSTRAINT disputes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('reviews') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='order_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_order_id_fkey') THEN
      ALTER TABLE reviews ADD CONSTRAINT reviews_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('reviews') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='customer_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_customer_id_fkey') THEN
      ALTER TABLE reviews ADD CONSTRAINT reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('reviews') IS NOT NULL AND to_regclass('vendors') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='vendor_id') THEN
    EXECUTE 'UPDATE reviews t SET vendor_id = NULL WHERE vendor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendors r WHERE r.id = t.vendor_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_vendor_id_fkey') THEN
      ALTER TABLE reviews ADD CONSTRAINT reviews_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('reviews') IS NOT NULL AND to_regclass('drivers') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='driver_id') THEN
    EXECUTE 'UPDATE reviews t SET driver_id = NULL WHERE driver_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM drivers r WHERE r.id = t.driver_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_driver_id_fkey') THEN
      ALTER TABLE reviews ADD CONSTRAINT reviews_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('notifications') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='user_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_fkey') THEN
      ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('notifications') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='order_id') THEN
    EXECUTE 'UPDATE notifications t SET order_id = NULL WHERE order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders r WHERE r.id = t.order_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_order_id_fkey') THEN
      ALTER TABLE notifications ADD CONSTRAINT notifications_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('push_tokens') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='push_tokens' AND column_name='user_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_tokens_user_id_fkey') THEN
      ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('referrals') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referrals' AND column_name='referrer_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referrals_referrer_id_fkey') THEN
      ALTER TABLE referrals ADD CONSTRAINT referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('referrals') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referrals' AND column_name='referee_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referrals_referee_id_fkey') THEN
      ALTER TABLE referrals ADD CONSTRAINT referrals_referee_id_fkey FOREIGN KEY (referee_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('referrals') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referrals' AND column_name='completed_order_id') THEN
    EXECUTE 'UPDATE referrals t SET completed_order_id = NULL WHERE completed_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders r WHERE r.id = t.completed_order_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referrals_completed_order_id_fkey') THEN
      ALTER TABLE referrals ADD CONSTRAINT referrals_completed_order_id_fkey FOREIGN KEY (completed_order_id) REFERENCES orders(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('loyalty_transactions') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loyalty_transactions' AND column_name='user_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_transactions_user_id_fkey') THEN
      ALTER TABLE loyalty_transactions ADD CONSTRAINT loyalty_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('loyalty_transactions') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loyalty_transactions' AND column_name='order_id') THEN
    EXECUTE 'UPDATE loyalty_transactions t SET order_id = NULL WHERE order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders r WHERE r.id = t.order_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_transactions_order_id_fkey') THEN
      ALTER TABLE loyalty_transactions ADD CONSTRAINT loyalty_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('chat_sessions') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_sessions' AND column_name='user_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_user_id_fkey') THEN
      ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('chat_sessions') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_sessions' AND column_name='order_id') THEN
    EXECUTE 'UPDATE chat_sessions t SET order_id = NULL WHERE order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders r WHERE r.id = t.order_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_order_id_fkey') THEN
      ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('vendor_payouts') IS NOT NULL AND to_regclass('vendors') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendor_payouts' AND column_name='vendor_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_payouts_vendor_id_fkey') THEN
      ALTER TABLE vendor_payouts ADD CONSTRAINT vendor_payouts_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('order_add_ons') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_add_ons' AND column_name='order_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_add_ons_order_id_fkey') THEN
      ALTER TABLE order_add_ons ADD CONSTRAINT order_add_ons_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('order_add_ons') IS NOT NULL AND to_regclass('add_ons') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_add_ons' AND column_name='add_on_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_add_ons_add_on_id_fkey') THEN
      ALTER TABLE order_add_ons ADD CONSTRAINT order_add_ons_add_on_id_fkey FOREIGN KEY (add_on_id) REFERENCES add_ons(id) ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('payment_transactions') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_transactions' AND column_name='order_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_transactions_order_id_fkey') THEN
      ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('stripe_accounts') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stripe_accounts' AND column_name='user_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_accounts_user_id_fkey') THEN
      ALTER TABLE stripe_accounts ADD CONSTRAINT stripe_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('driver_location_history') IS NOT NULL AND to_regclass('drivers') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_location_history' AND column_name='driver_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_location_history_driver_id_fkey') THEN
      ALTER TABLE driver_location_history ADD CONSTRAINT driver_location_history_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('driver_location_history') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_location_history' AND column_name='order_id') THEN
    EXECUTE 'UPDATE driver_location_history t SET order_id = NULL WHERE order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders r WHERE r.id = t.order_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_location_history_order_id_fkey') THEN
      ALTER TABLE driver_location_history ADD CONSTRAINT driver_location_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('order_photos') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_photos' AND column_name='order_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_photos_order_id_fkey') THEN
      ALTER TABLE order_photos ADD CONSTRAINT order_photos_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('order_photos') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_photos' AND column_name='captured_by') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_photos_captured_by_fkey') THEN
      ALTER TABLE order_photos ADD CONSTRAINT order_photos_captured_by_fkey FOREIGN KEY (captured_by) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('order_status_history') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_status_history' AND column_name='order_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_status_history_order_id_fkey') THEN
      ALTER TABLE order_status_history ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('order_status_history') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_status_history' AND column_name='actor_id') THEN
    EXECUTE 'UPDATE order_status_history t SET actor_id = NULL WHERE actor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users r WHERE r.id = t.actor_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_status_history_actor_id_fkey') THEN
      ALTER TABLE order_status_history ADD CONSTRAINT order_status_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('quotes') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='customer_id') THEN
    EXECUTE 'UPDATE quotes t SET customer_id = NULL WHERE customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users r WHERE r.id = t.customer_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_customer_id_fkey') THEN
      ALTER TABLE quotes ADD CONSTRAINT quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('quotes') IS NOT NULL AND to_regclass('vendors') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='vendor_id') THEN
    EXECUTE 'UPDATE quotes t SET vendor_id = NULL WHERE vendor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendors r WHERE r.id = t.vendor_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_vendor_id_fkey') THEN
      ALTER TABLE quotes ADD CONSTRAINT quotes_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('quotes') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='order_id') THEN
    EXECUTE 'UPDATE quotes t SET order_id = NULL WHERE order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders r WHERE r.id = t.order_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_order_id_fkey') THEN
      ALTER TABLE quotes ADD CONSTRAINT quotes_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('pricing_config') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing_config' AND column_name='updated_by') THEN
    EXECUTE 'UPDATE pricing_config t SET updated_by = NULL WHERE updated_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users r WHERE r.id = t.updated_by)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pricing_config_updated_by_fkey') THEN
      ALTER TABLE pricing_config ADD CONSTRAINT pricing_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('pricing_audit_log') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing_audit_log' AND column_name='actor_id') THEN
    EXECUTE 'UPDATE pricing_audit_log t SET actor_id = NULL WHERE actor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users r WHERE r.id = t.actor_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pricing_audit_log_actor_id_fkey') THEN
      ALTER TABLE pricing_audit_log ADD CONSTRAINT pricing_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('sessions') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='user_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_fkey') THEN
      ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('password_reset_tokens') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='password_reset_tokens' AND column_name='user_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_tokens_user_id_fkey') THEN
      ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('promo_usage') IS NOT NULL AND to_regclass('promo_codes') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promo_usage' AND column_name='promo_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promo_usage_promo_id_fkey') THEN
      ALTER TABLE promo_usage ADD CONSTRAINT promo_usage_promo_id_fkey FOREIGN KEY (promo_id) REFERENCES promo_codes(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('promo_usage') IS NOT NULL AND to_regclass('users') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promo_usage' AND column_name='user_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promo_usage_user_id_fkey') THEN
      ALTER TABLE promo_usage ADD CONSTRAINT promo_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('promo_usage') IS NOT NULL AND to_regclass('orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='promo_usage' AND column_name='order_id') THEN
    EXECUTE 'UPDATE promo_usage t SET order_id = NULL WHERE order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders r WHERE r.id = t.order_id)';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promo_usage_order_id_fkey') THEN
      ALTER TABLE promo_usage ADD CONSTRAINT promo_usage_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
