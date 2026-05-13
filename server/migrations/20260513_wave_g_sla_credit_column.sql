-- Wave G: P2-021 — SLA credit dedup via dedicated timestamptz column
-- instead of scanning customerNotes for "SLA_CREDIT_ISSUED".
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sla_credit_issued_at TIMESTAMPTZ DEFAULT NULL;
