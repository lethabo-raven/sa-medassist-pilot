CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE pharmacies
  ADD COLUMN IF NOT EXISTS pharmacy_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS trading_name text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'South Africa';

UPDATE pharmacies
SET pharmacy_id = COALESCE(pharmacy_id, pharmacy_code)
WHERE pharmacy_id IS NULL;

ALTER TABLE pharmacies
  ALTER COLUMN pharmacy_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pharmacies_pharmacy_id ON pharmacies(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_pharmacies_status ON pharmacies(status);
CREATE INDEX IF NOT EXISTS idx_pharmacies_location ON pharmacies(country, province, city);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pharmacy_employees_pharmacy') THEN
    ALTER TABLE pharmacy_employees
      ADD CONSTRAINT fk_pharmacy_employees_pharmacy
      FOREIGN KEY (pharmacy_id)
      REFERENCES pharmacies(id)
      ON DELETE RESTRICT
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_pharmacy') THEN
    ALTER TABLE documents
      ADD CONSTRAINT fk_documents_pharmacy
      FOREIGN KEY (pharmacy_id)
      REFERENCES pharmacies(id)
      ON DELETE RESTRICT
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_logs_pharmacy') THEN
    ALTER TABLE audit_logs
      ADD CONSTRAINT fk_audit_logs_pharmacy
      FOREIGN KEY (pharmacy_id)
      REFERENCES pharmacies(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_answer_feedback_pharmacy') THEN
    ALTER TABLE answer_feedback
      ADD CONSTRAINT fk_answer_feedback_pharmacy
      FOREIGN KEY (pharmacy_id)
      REFERENCES pharmacies(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_review_queue_pharmacy') THEN
    ALTER TABLE review_queue
      ADD CONSTRAINT fk_review_queue_pharmacy
      FOREIGN KEY (pharmacy_id)
      REFERENCES pharmacies(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
  employee_id uuid REFERENCES pharmacy_employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS future_dispensing_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
  external_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS future_knowledge_base_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
  source_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_pharmacy ON chat_sessions(pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_pharmacy ON analytics_events(pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_future_dispensing_pharmacy ON future_dispensing_records(pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_future_kb_pharmacy ON future_knowledge_base_records(pharmacy_id, created_at DESC);
