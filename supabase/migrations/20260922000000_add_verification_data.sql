-- MICRO 22: Add verification_data column for persisting checklist results
-- This column stores the verification checklist, notes, and timestamps
-- as a JSONB field on the content_items table.

ALTER TABLE content_items ADD COLUMN IF NOT EXISTS verification_data JSONB;
