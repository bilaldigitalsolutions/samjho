-- MICRO 20 + MICRO 22 Content Pipeline
-- Creates content_items table for Samjho India content pipeline.
-- MICRO 22 adds verification_data JSONB for persisting checklist results.

CREATE TABLE IF NOT EXISTS content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id TEXT,
  release_url TEXT,
  source_name TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  ministry TEXT NOT NULL DEFAULT '',
  raw_content TEXT NOT NULL DEFAULT '',
  raw_html TEXT NOT NULL DEFAULT '',
  source_published_date TEXT NOT NULL DEFAULT '',
  published_time TEXT NOT NULL DEFAULT '',
  added_at DATE NOT NULL DEFAULT CURRENT_DATE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  primary_category TEXT NOT NULL DEFAULT 'needs_manual_categorization',
  categorization_status TEXT NOT NULL DEFAULT 'uncategorized',
  content_type TEXT NOT NULL DEFAULT 'Press Release',
  fetch_status TEXT NOT NULL DEFAULT 'success',
  fetch_error TEXT,
  refinement_status TEXT NOT NULL DEFAULT 'pending',
  refined_at TIMESTAMPTZ,
  refinement_model TEXT,
  refined_content TEXT NOT NULL DEFAULT '',
  refinement_error TEXT,
  refined_guide JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  verification_status TEXT NOT NULL DEFAULT 'not_verified',
  review_status TEXT NOT NULL DEFAULT 'pending_review',
  approval_status TEXT NOT NULL DEFAULT 'not_approved',
  verification_data JSONB,
  admin_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ci_release_id ON content_items (release_id);
CREATE INDEX IF NOT EXISTS idx_ci_release_url ON content_items (release_url);
CREATE INDEX IF NOT EXISTS idx_ci_source_url ON content_items (source_url);
CREATE INDEX IF NOT EXISTS idx_ci_status ON content_items (status);
CREATE INDEX IF NOT EXISTS idx_ci_category ON content_items (primary_category);
CREATE INDEX IF NOT EXISTS idx_ci_refinement ON content_items (refinement_status);
CREATE INDEX IF NOT EXISTS idx_ci_cat_status ON content_items (categorization_status);
CREATE INDEX IF NOT EXISTS idx_ci_added ON content_items (added_at);
CREATE INDEX IF NOT EXISTS idx_ci_created ON content_items (created_at);

-- Unique constraints for duplicate protection
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci_uid_release_id ON content_items (release_id) WHERE release_id IS NOT NULL AND release_id != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci_uid_release_url ON content_items (release_url) WHERE release_url IS NOT NULL AND release_url != '';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_ci_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_ci_updated_at ON content_items;
CREATE TRIGGER trg_ci_updated_at BEFORE UPDATE ON content_items FOR EACH ROW EXECUTE FUNCTION update_ci_updated_at();

-- Constraints
ALTER TABLE content_items DROP CONSTRAINT IF EXISTS chk_ci_status;
ALTER TABLE content_items ADD CONSTRAINT chk_ci_status CHECK (status IN ('draft','review','approved','published'));
ALTER TABLE content_items DROP CONSTRAINT IF EXISTS chk_ci_ref_status;
ALTER TABLE content_items ADD CONSTRAINT chk_ci_ref_status CHECK (refinement_status IN ('pending','processing','completed','failed'));
ALTER TABLE content_items DROP CONSTRAINT IF EXISTS chk_ci_cat_status;
ALTER TABLE content_items ADD CONSTRAINT chk_ci_cat_status CHECK (categorization_status IN ('uncategorized','categorized','needs_manual_categorization'));
ALTER TABLE content_items DROP CONSTRAINT IF EXISTS chk_ci_category;
ALTER TABLE content_items ADD CONSTRAINT chk_ci_category CHECK (primary_category IN ('Government','Documents','Business','Money','Education','needs_manual_categorization'));

-- RLS
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_read ON content_items;
CREATE POLICY admin_read ON content_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS admin_insert ON content_items;
CREATE POLICY admin_insert ON content_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS admin_update ON content_items;
CREATE POLICY admin_update ON content_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS admin_delete ON content_items;
CREATE POLICY admin_delete ON content_items FOR DELETE TO authenticated USING (true);
DROP POLICY IF EXISTS svc_full ON content_items;
CREATE POLICY svc_full ON content_items FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON content_items TO authenticated;
GRANT ALL ON content_items TO service_role;
