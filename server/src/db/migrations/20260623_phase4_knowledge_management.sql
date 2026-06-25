ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_category text,
  ADD COLUMN IF NOT EXISTS source_organization text,
  ADD COLUMN IF NOT EXISTS publication_date date,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS uploader text,
  ADD COLUMN IF NOT EXISTS reviewer text;

ALTER TABLE document_entities
  ADD COLUMN IF NOT EXISTS extracted_value text,
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_documents_processing_status ON documents(processing_status);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(document_category);
CREATE INDEX IF NOT EXISTS idx_document_entities_review ON document_entities(document_id, approval_status, active);
