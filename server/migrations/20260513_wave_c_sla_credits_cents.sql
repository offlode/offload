-- Wave C sandbox-only remediation: normalize in-flight SLA credits to cents.
-- Previous SLA breach code added dollar delivery_fee values into users.credits,
-- whose canonical unit is cents. This only touches customers with SLA credit events
-- whose balance still looks dollar-denominated (< $100 represented as <100 cents).
UPDATE users u
SET credits = credits * 100
WHERE credits IS NOT NULL
  AND credits > 0
  AND credits < 100
  AND EXISTS (
    SELECT 1
    FROM orders o
    JOIN order_events oe ON oe.order_id = o.id
    WHERE o.customer_id = u.id
      AND oe.event_type = 'sla_credit_issued'
  );
