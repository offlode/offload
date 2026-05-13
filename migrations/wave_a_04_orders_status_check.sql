-- Wave A4: orders.status check from server/order-fsm.ts (24 states).
-- Rollback: ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
UPDATE orders SET status = CASE status
  WHEN 'quote' THEN 'quoted'
  WHEN 'accepted' THEN 'quote_accepted'
  WHEN 'payment' THEN 'payment_pending'
  WHEN 'pickup_scheduled' THEN 'scheduled'
  WHEN 'pickup_in_progress' THEN 'driver_en_route_pickup'
  WHEN 'at_vendor' THEN 'at_facility'
  WHEN 'at_laundromat' THEN 'at_facility'
  WHEN 'wash_complete' THEN 'drying'
  WHEN 'quality_check' THEN 'folding'
  WHEN 'packing' THEN 'folding'
  WHEN 'ready' THEN 'ready_for_delivery'
  WHEN 'out_for_delivery' THEN 'driver_en_route_delivery'
  WHEN 'disputed' THEN 'delivered'
  ELSE 'pending'
END WHERE status NOT IN ('draft_quote', 'quoted', 'quote_accepted', 'quote_expired', 'payment_pending', 'confirmed', 'pending', 'scheduled', 'driver_assigned', 'driver_en_route_pickup', 'arrived_pickup', 'picked_up', 'driver_en_route_facility', 'at_facility', 'processing', 'washing', 'drying', 'folding', 'ready_for_delivery', 'driver_en_route_delivery', 'arrived_delivery', 'delivered', 'completed', 'cancelled');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('draft_quote', 'quoted', 'quote_accepted', 'quote_expired', 'payment_pending', 'confirmed', 'pending', 'scheduled', 'driver_assigned', 'driver_en_route_pickup', 'arrived_pickup', 'picked_up', 'driver_en_route_facility', 'at_facility', 'processing', 'washing', 'drying', 'folding', 'ready_for_delivery', 'driver_en_route_delivery', 'arrived_delivery', 'delivered', 'completed', 'cancelled'));
  END IF;
END $$;
