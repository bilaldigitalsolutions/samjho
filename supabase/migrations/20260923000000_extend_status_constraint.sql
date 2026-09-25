-- Extend status CHECK constraint to include 'verified' and 'pending_publish'
-- These statuses are used by the content pipeline (verify → stage → publish)

ALTER TABLE content_items DROP CONSTRAINT IF EXISTS chk_ci_status;
ALTER TABLE content_items ADD CONSTRAINT chk_ci_status CHECK (status IN ('draft','review','verified','approved','pending_publish','published'));
