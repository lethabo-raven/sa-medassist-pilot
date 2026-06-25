CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS trusted_sources (
  source_id text PRIMARY KEY,
  source_name text NOT NULL,
  source_type text NOT NULL,
  base_url text NOT NULL,
  allowed_domains text[] NOT NULL DEFAULT '{}',
  document_category text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trusted_source_documents (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES trusted_sources(source_id) ON DELETE RESTRICT,
  pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE RESTRICT,
  title text NOT NULL,
  source_url text NOT NULL,
  file_url text NOT NULL,
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
  approval_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS trusted_source_document_id uuid REFERENCES trusted_source_documents(document_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS authority text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_type text;

CREATE INDEX IF NOT EXISTS idx_trusted_sources_enabled ON trusted_sources(enabled);
CREATE INDEX IF NOT EXISTS idx_trusted_source_documents_source ON trusted_source_documents(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trusted_source_documents_review ON trusted_source_documents(approval_status, ingestion_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_source_documents_unique_file
  ON trusted_source_documents(source_id, file_url, COALESCE(checksum, ''));
CREATE INDEX IF NOT EXISTS idx_documents_trusted_source_document ON documents(trusted_source_document_id);

INSERT INTO trusted_sources (
  source_id,
  source_name,
  source_type,
  base_url,
  allowed_domains,
  document_category,
  enabled
)
VALUES
  (
    'SAHPRA',
    'SAHPRA Public Medicine Document Repository',
    'SAHPRA_MEDICINE_DOCUMENTS',
    'https://www.sahpra.org.za/documents/',
    ARRAY['sahpra.org.za', 'www.sahpra.org.za'],
    'Medicine Product Information',
    true
  ),
  (
    'NDOH',
    'National Department of Health Clinical Guidelines',
    'NDOH_CLINICAL_GUIDELINES',
    'https://knowledgehub.health.gov.za/elibrary',
    ARRAY['health.gov.za', 'www.health.gov.za', 'knowledgehub.health.gov.za'],
    'Clinical Guidelines',
    true
  ),
  (
    'NICD',
    'NICD Public Clinical Guidance',
    'NICD_PUBLIC_GUIDANCE',
    'https://www.nicd.ac.za/diseases-a-z-index/',
    ARRAY['nicd.ac.za', 'www.nicd.ac.za'],
    'Clinical Guidance',
    true
  )
ON CONFLICT (source_id)
DO UPDATE SET
  source_name = EXCLUDED.source_name,
  source_type = EXCLUDED.source_type,
  base_url = EXCLUDED.base_url,
  allowed_domains = EXCLUDED.allowed_domains,
  document_category = EXCLUDED.document_category,
  enabled = EXCLUDED.enabled,
  updated_at = now();
