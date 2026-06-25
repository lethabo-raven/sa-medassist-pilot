CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS trusted_sources (
  source_id text PRIMARY KEY,
  source_name text NOT NULL,
  source_type text NOT NULL,
  base_url text NOT NULL,
  allowed_domains text[] NOT NULL DEFAULT '{}',
  authority text,
  document_category text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  auto_check_frequency text NOT NULL DEFAULT 'manual',
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trusted_sources
  ADD COLUMN IF NOT EXISTS authority text,
  ADD COLUMN IF NOT EXISTS auto_check_frequency text NOT NULL DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS trusted_source_documents (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES trusted_sources(source_id) ON DELETE RESTRICT,
  pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE RESTRICT,
  title text NOT NULL,
  source_url text NOT NULL,
  file_url text NOT NULL,
  local_file_path text,
  document_type text NOT NULL,
  authority text NOT NULL,
  version text,
  publication_date date,
  effective_date date,
  expiry_date date,
  checksum text,
  file_path text,
  download_status text NOT NULL DEFAULT 'pending',
  ingestion_status text NOT NULL DEFAULT 'pending_review',
  approval_status text NOT NULL DEFAULT 'pending_review',
  active boolean NOT NULL DEFAULT false,
  previous_document_id uuid REFERENCES trusted_source_documents(document_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trusted_source_documents
  ADD COLUMN IF NOT EXISTS local_file_path text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_document_id uuid REFERENCES trusted_source_documents(document_id) ON DELETE SET NULL;

UPDATE trusted_source_documents
SET approval_status = 'pending_review'
WHERE approval_status = 'pending';

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS trusted_source_document_id uuid REFERENCES trusted_source_documents(document_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS authority text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_type text;

CREATE TABLE IF NOT EXISTS trusted_document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES trusted_source_documents(document_id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  chunk_text text NOT NULL,
  page_number integer,
  source_url text NOT NULL,
  authority text NOT NULL,
  version text,
  publication_date date,
  search_text tsvector GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_trusted_sources_enabled ON trusted_sources(enabled);
CREATE INDEX IF NOT EXISTS idx_trusted_source_documents_source ON trusted_source_documents(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trusted_source_documents_review ON trusted_source_documents(approval_status, ingestion_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_source_documents_unique_file
  ON trusted_source_documents(source_id, file_url, COALESCE(checksum, ''));
CREATE INDEX IF NOT EXISTS idx_documents_trusted_source_document ON documents(trusted_source_document_id);
CREATE INDEX IF NOT EXISTS idx_trusted_document_chunks_document ON trusted_document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_trusted_document_chunks_search ON trusted_document_chunks USING GIN(search_text);

INSERT INTO trusted_sources (
  source_id,
  source_name,
  source_type,
  base_url,
  allowed_domains,
  authority,
  document_category,
  enabled,
  auto_check_frequency
)
VALUES
  (
    'SAHPRA',
    'SAHPRA Public Medicine Document Repository',
    'SAHPRA_MEDICINE_DOCUMENTS',
    'https://www.sahpra.org.za/documents/',
    ARRAY['sahpra.org.za', 'www.sahpra.org.za'],
    'SAHPRA',
    'Medicine Product Information',
    true,
    'manual'
  ),
  (
    'NDOH',
    'National Department of Health Clinical Guidelines',
    'NDOH_CLINICAL_GUIDELINES',
    'https://knowledgehub.health.gov.za/elibrary',
    ARRAY['health.gov.za', 'www.health.gov.za', 'knowledgehub.health.gov.za'],
    'National Department of Health',
    'Clinical Guidelines',
    true,
    'manual'
  ),
  (
    'NICD',
    'NICD Public Clinical Guidance',
    'NICD_PUBLIC_GUIDANCE',
    'https://www.nicd.ac.za/diseases-a-z-index/',
    ARRAY['nicd.ac.za', 'www.nicd.ac.za'],
    'NICD',
    'Clinical Guidance',
    true,
    'manual'
  ),
  (
    'SAMRC',
    'South African Medical Research Council Public Guidance',
    'SAMRC_PUBLIC_GUIDANCE',
    'https://www.samrc.ac.za/',
    ARRAY['samrc.ac.za', 'www.samrc.ac.za'],
    'SAMRC',
    'Clinical Guidance',
    true,
    'manual'
  )
ON CONFLICT (source_id)
DO UPDATE SET
  source_name = EXCLUDED.source_name,
  source_type = EXCLUDED.source_type,
  base_url = EXCLUDED.base_url,
  allowed_domains = EXCLUDED.allowed_domains,
  authority = EXCLUDED.authority,
  document_category = EXCLUDED.document_category,
  enabled = EXCLUDED.enabled,
  auto_check_frequency = EXCLUDED.auto_check_frequency,
  updated_at = now();
