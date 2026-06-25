CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS pharmacies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_code text NOT NULL UNIQUE,
  pharmacy_name text NOT NULL,
  branch_name text,
  contact_person text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pharmacy_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  employee_number text NOT NULL,
  display_name text NOT NULL,
  job_title text NOT NULL CHECK (job_title IN ('pharmacist', 'pharmacy_assistant', 'pharmacy_manager', 'doctor', 'other')),
  system_role text NOT NULL DEFAULT 'pharmacist' CHECK (system_role IN ('system_owner', 'pharmacy_manager', 'pharmacist', 'pharmacy_assistant', 'doctor', 'other')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  pin_hash text NOT NULL,
  pin_reset_required boolean NOT NULL DEFAULT true,
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pharmacy_id, employee_number)
);

CREATE TABLE IF NOT EXISTS employee_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES pharmacy_employees(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS employee_login_audit (
  id bigserial PRIMARY KEY,
  pharmacy_id uuid REFERENCES pharmacies(id),
  employee_id uuid REFERENCES pharmacy_employees(id),
  success boolean NOT NULL,
  reason text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pharmacy_employees_pharmacy_idx ON pharmacy_employees(pharmacy_id, status);
CREATE INDEX IF NOT EXISTS employee_sessions_token_idx ON employee_sessions(token_hash);
CREATE INDEX IF NOT EXISTS employee_login_audit_pharmacy_idx ON employee_login_audit(pharmacy_id, created_at DESC);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid REFERENCES pharmacies(id),
  source_id uuid NOT NULL DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  source_url text,
  source_organization text,
  authority text NOT NULL DEFAULT 'uploaded',
  source_type text NOT NULL DEFAULT 'upload' CHECK (source_type IN ('upload', 'url', 'system')),
  document_category text NOT NULL DEFAULT 'Clinical Guidelines' CHECK (document_category IN (
    'ICD10',
    'Medical Aid Rules',
    'Medicine Schedules',
    'Formularies',
    'Clinical Guidelines',
    'SOPs',
    'Drug Interactions',
    'Dispensing Rules',
    'Pharmacy Operations'
  )),
  publication_date timestamptz,
  file_name text,
  file_mime_type text,
  file_size_bytes bigint,
  storage_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'archived')),
  active_flag boolean NOT NULL DEFAULT false,
  raw_text text NOT NULL DEFAULT '',
  approved_by text,
  approved_at timestamptz,
  approver text,
  approval_date timestamptz,
  rejected_by text,
  rejected_at timestamptz,
  rejection_reason text,
  uploaded_by text NOT NULL DEFAULT 'admin',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  upload_date timestamptz NOT NULL DEFAULT now(),
  expiry_date timestamptz,
  replaced_by_document_id uuid REFERENCES documents(id),
  replaced_at timestamptz
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS pharmacy_id uuid REFERENCES pharmacies(id);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE documents ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_organization text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'upload';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_category text NOT NULL DEFAULT 'Clinical Guidelines';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS publication_date timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_mime_type text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size_bytes bigint;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS active_flag boolean NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS raw_text text NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approver text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approval_date timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS rejected_by text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS upload_date timestamptz NOT NULL DEFAULT now();
ALTER TABLE documents ADD COLUMN IF NOT EXISTS expiry_date timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS replaced_by_document_id uuid REFERENCES documents(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS replaced_at timestamptz;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
UPDATE documents SET status = 'approved', approved_by = COALESCE(approved_by, 'migration'), approved_at = COALESCE(approved_at, now()) WHERE status = 'verified';
UPDATE documents SET approver = COALESCE(approver, approved_by), approval_date = COALESCE(approval_date, approved_at) WHERE status = 'approved';
UPDATE documents SET upload_date = uploaded_at WHERE upload_date IS NULL;
UPDATE documents SET active_flag = true WHERE status = 'approved' AND active_flag = false;
WITH latest_versions AS (
  SELECT source_id, max(version) AS latest_version
  FROM documents
  WHERE status = 'approved'
  GROUP BY source_id
)
UPDATE documents d
SET status = 'superseded', active_flag = false
FROM latest_versions lv
WHERE d.source_id = lv.source_id
  AND d.status = 'approved'
  AND d.version < lv.latest_version;
DELETE FROM document_chunks
WHERE document_id IN (
  SELECT id FROM documents
  WHERE status <> 'approved' OR active_flag = false
);
ALTER TABLE documents ADD CONSTRAINT documents_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'archived', 'superseded'));
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_source_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_source_type_check CHECK (source_type IN ('upload', 'url', 'system'));
CREATE UNIQUE INDEX IF NOT EXISTS documents_source_version_idx ON documents(source_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS documents_one_active_version_idx ON documents(source_id) WHERE status = 'approved' AND active_flag = true;

CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  citation_label text NOT NULL,
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status);
CREATE INDEX IF NOT EXISTS documents_active_approved_idx ON documents(source_id, version) WHERE status = 'approved' AND active_flag = true;
CREATE INDEX IF NOT EXISTS documents_expiry_date_idx ON documents(expiry_date);
CREATE INDEX IF NOT EXISTS documents_source_url_idx ON documents(source_url);
CREATE INDEX IF NOT EXISTS documents_category_idx ON documents(document_category);
CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx ON document_chunks(document_id);

ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS page_number integer;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS section_heading text;
CREATE INDEX IF NOT EXISTS document_chunks_page_section_idx ON document_chunks(document_id, page_number);

CREATE TABLE IF NOT EXISTS document_processing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'parsed', 'chunked', 'extracted', 'embedded', 'failed')),
  parser text,
  entity_count integer NOT NULL DEFAULT 0,
  chunk_count integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS document_processing_runs_document_idx ON document_processing_runs(document_id, started_at DESC);

CREATE TABLE IF NOT EXISTS document_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN (
    'medicine',
    'nappi',
    'icd10',
    'medical_aid_name',
    'drug_interaction',
    'contraindication',
    'schedule',
    'dosage',
    'pregnancy_warning',
    'breastfeeding_warning',
    'renal_warning',
    'hepatic_warning'
  )),
  entity_value text NOT NULL,
  normalized_value text NOT NULL,
  page_number integer,
  section_heading text,
  source_text text,
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  extraction_timestamp timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  active_flag boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS document_entities_lookup_idx ON document_entities(entity_type, normalized_value);
CREATE INDEX IF NOT EXISTS document_entities_document_idx ON document_entities(document_id, review_status, active_flag);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  pharmacy_id uuid REFERENCES pharmacies(id),
  event_type text NOT NULL,
  actor text NOT NULL DEFAULT 'anonymous',
  question text,
  answer text,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS pharmacy_id uuid REFERENCES pharmacies(id);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_pharmacy_created_idx ON audit_logs(pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_event_type_idx ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS audit_logs_actor_created_at_idx ON audit_logs(actor, created_at DESC);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS answer_id uuid;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS query_classification text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS retrieval_confidence numeric;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS clinical_escalation boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS high_risk_medicine boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS expired_source_attempt boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS selected_role text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS pharmacist_consultation_required boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS scheduled_medicine_trigger boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS icd10_lookup boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS icd10_uncertainty boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS medical_aid_disclaimer_shown boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS emergency_red_flag boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS medicine_risk_escalation boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS missing_patient_context boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS context_completed boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS context_bypass_attempt boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS implausible_patient_context boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS neonatal_high_risk boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS pharmacist_review_required boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS allergy_conflict boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS interaction_detected boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS contraindicated_interaction boolean NOT NULL DEFAULT false;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS blocked_recommendation boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS audit_logs_answer_id_idx ON audit_logs(answer_id);
CREATE INDEX IF NOT EXISTS audit_logs_query_classification_idx ON audit_logs(query_classification);
CREATE INDEX IF NOT EXISTS audit_logs_safety_flags_idx ON audit_logs(clinical_escalation, high_risk_medicine, expired_source_attempt);
CREATE INDEX IF NOT EXISTS audit_logs_role_safety_idx ON audit_logs(selected_role, pharmacist_consultation_required, scheduled_medicine_trigger, icd10_lookup);
CREATE INDEX IF NOT EXISTS audit_logs_emergency_medicine_risk_idx ON audit_logs(emergency_red_flag, medicine_risk_escalation);
CREATE INDEX IF NOT EXISTS audit_logs_patient_context_idx ON audit_logs(missing_patient_context, context_completed, context_bypass_attempt);
CREATE INDEX IF NOT EXISTS audit_logs_plausibility_idx ON audit_logs(implausible_patient_context, neonatal_high_risk, pharmacist_review_required);
CREATE INDEX IF NOT EXISTS audit_logs_allergy_interaction_idx ON audit_logs(allergy_conflict, interaction_detected, contraindicated_interaction, blocked_recommendation);

CREATE TABLE IF NOT EXISTS answer_source_provenance (
  id bigserial PRIMARY KEY,
  answer_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES documents(id),
  source_id uuid NOT NULL,
  document_version integer NOT NULL,
  citation_index integer NOT NULL,
  cited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (answer_id, document_id, citation_index)
);

CREATE INDEX IF NOT EXISTS answer_source_provenance_answer_id_idx ON answer_source_provenance(answer_id);
CREATE INDEX IF NOT EXISTS answer_source_provenance_document_id_idx ON answer_source_provenance(document_id);

CREATE TABLE IF NOT EXISTS answer_feedback (
  id bigserial PRIMARY KEY,
  pharmacy_id uuid REFERENCES pharmacies(id),
  answer_id uuid NOT NULL,
  actor text NOT NULL,
  rating text NOT NULL CHECK (rating IN ('helpful', 'not_helpful', 'needs_review')),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (answer_id, actor)
);

ALTER TABLE answer_feedback ADD COLUMN IF NOT EXISTS pharmacy_id uuid REFERENCES pharmacies(id);
CREATE INDEX IF NOT EXISTS answer_feedback_pharmacy_idx ON answer_feedback(pharmacy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS answer_feedback_answer_id_idx ON answer_feedback(answer_id);
CREATE INDEX IF NOT EXISTS answer_feedback_rating_idx ON answer_feedback(rating);

CREATE TABLE IF NOT EXISTS review_queue (
  id bigserial PRIMARY KEY,
  pharmacy_id uuid REFERENCES pharmacies(id),
  answer_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('refused_answer', 'conflicting_sources', 'user_flagged')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved')),
  question text,
  answer text,
  actor text NOT NULL DEFAULT 'anonymous',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);

ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS pharmacy_id uuid REFERENCES pharmacies(id);
CREATE INDEX IF NOT EXISTS review_queue_pharmacy_idx ON review_queue(pharmacy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS review_queue_status_idx ON review_queue(status);
CREATE INDEX IF NOT EXISTS review_queue_answer_id_idx ON review_queue(answer_id);

CREATE TABLE IF NOT EXISTS icd10_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  description text NOT NULL,
  document_id uuid NOT NULL REFERENCES documents(id),
  source_id uuid NOT NULL,
  source_version integer NOT NULL,
  approval_status text NOT NULL DEFAULT 'approved',
  effective_date timestamptz NOT NULL DEFAULT now(),
  expiry_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, source_id, source_version)
);

CREATE INDEX IF NOT EXISTS icd10_codes_code_idx ON icd10_codes(code);
CREATE INDEX IF NOT EXISTS icd10_codes_description_idx ON icd10_codes USING gin (to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS icd10_codes_active_idx ON icd10_codes(code, source_version)
  WHERE approval_status = 'approved';

CREATE TABLE IF NOT EXISTS medicine_risk_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  risk_category text NOT NULL CHECK (risk_category IN (
    'pregnancy risk',
    'breastfeeding caution',
    'high-risk medicine',
    'scheduled/controlled medicine',
    'interaction risk',
    'monitoring required',
    'pharmacist review required'
  )),
  escalation_reason text NOT NULL,
  related_safety_trigger text NOT NULL,
  active_flag boolean NOT NULL DEFAULT true,
  source_reference text NOT NULL,
  last_reviewed_date date NOT NULL DEFAULT current_date,
  source_document_id uuid REFERENCES documents(id),
  source_name text,
  source_version integer,
  source_page_section_reference text,
  import_date timestamptz NOT NULL DEFAULT now(),
  approval_status text NOT NULL DEFAULT 'seed_demo' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'seed_demo')),
  reviewer text,
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  rule_origin text NOT NULL DEFAULT 'seed_demo' CHECK (rule_origin IN ('seed_demo', 'imported')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE medicine_risk_profiles ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES documents(id);
ALTER TABLE medicine_risk_profiles ADD COLUMN IF NOT EXISTS source_name text;
ALTER TABLE medicine_risk_profiles ADD COLUMN IF NOT EXISTS source_version integer;
ALTER TABLE medicine_risk_profiles ADD COLUMN IF NOT EXISTS source_page_section_reference text;
ALTER TABLE medicine_risk_profiles ADD COLUMN IF NOT EXISTS import_date timestamptz NOT NULL DEFAULT now();
ALTER TABLE medicine_risk_profiles ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'seed_demo';
ALTER TABLE medicine_risk_profiles ADD COLUMN IF NOT EXISTS reviewer text;
ALTER TABLE medicine_risk_profiles ADD COLUMN IF NOT EXISTS confidence_score numeric NOT NULL DEFAULT 0;
ALTER TABLE medicine_risk_profiles ADD COLUMN IF NOT EXISTS rule_origin text NOT NULL DEFAULT 'seed_demo';

CREATE INDEX IF NOT EXISTS medicine_risk_profiles_active_idx ON medicine_risk_profiles(active_flag);
CREATE INDEX IF NOT EXISTS medicine_risk_profiles_name_idx ON medicine_risk_profiles(lower(medicine_name));

CREATE TABLE IF NOT EXISTS icd10_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  description text NOT NULL,
  category_chapter text,
  active_flag boolean NOT NULL DEFAULT true,
  document_id uuid NOT NULL REFERENCES documents(id),
  source_id uuid NOT NULL,
  source_version integer NOT NULL,
  source_name text,
  source_page_section_reference text,
  import_date timestamptz NOT NULL DEFAULT now(),
  approval_status text NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'seed_demo')),
  reviewer text,
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  rule_origin text NOT NULL DEFAULT 'imported' CHECK (rule_origin IN ('seed_demo', 'imported')),
  effective_date timestamptz NOT NULL DEFAULT now(),
  expiry_date timestamptz,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, source_id, source_version)
);

ALTER TABLE icd10_master ADD COLUMN IF NOT EXISTS source_name text;
ALTER TABLE icd10_master ADD COLUMN IF NOT EXISTS source_page_section_reference text;
ALTER TABLE icd10_master ADD COLUMN IF NOT EXISTS import_date timestamptz NOT NULL DEFAULT now();
ALTER TABLE icd10_master ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';
ALTER TABLE icd10_master ADD COLUMN IF NOT EXISTS reviewer text;
ALTER TABLE icd10_master ADD COLUMN IF NOT EXISTS confidence_score numeric NOT NULL DEFAULT 0;
ALTER TABLE icd10_master ADD COLUMN IF NOT EXISTS rule_origin text NOT NULL DEFAULT 'imported';

CREATE INDEX IF NOT EXISTS icd10_master_code_idx ON icd10_master(code);
CREATE INDEX IF NOT EXISTS icd10_master_description_idx ON icd10_master USING gin (to_tsvector('english', description || ' ' || code));
CREATE INDEX IF NOT EXISTS icd10_master_active_idx ON icd10_master(code, source_version) WHERE active_flag = true;

CREATE TABLE IF NOT EXISTS medical_aid_icd10_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_aid_name text NOT NULL,
  plan_option text,
  icd10_code text NOT NULL,
  pmb_flag boolean NOT NULL DEFAULT false,
  authorisation_required_flag boolean NOT NULL DEFAULT false,
  formulary_notes text,
  claim_notes text,
  document_id uuid NOT NULL REFERENCES documents(id),
  source_id uuid NOT NULL,
  source_version integer NOT NULL,
  source_name text,
  source_page_section_reference text,
  import_date timestamptz NOT NULL DEFAULT now(),
  approval_status text NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'seed_demo')),
  reviewer text,
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  rule_origin text NOT NULL DEFAULT 'imported' CHECK (rule_origin IN ('seed_demo', 'imported')),
  last_verified_date date NOT NULL DEFAULT current_date,
  active_flag boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE medical_aid_icd10_rules ADD COLUMN IF NOT EXISTS source_name text;
ALTER TABLE medical_aid_icd10_rules ADD COLUMN IF NOT EXISTS source_page_section_reference text;
ALTER TABLE medical_aid_icd10_rules ADD COLUMN IF NOT EXISTS import_date timestamptz NOT NULL DEFAULT now();
ALTER TABLE medical_aid_icd10_rules ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';
ALTER TABLE medical_aid_icd10_rules ADD COLUMN IF NOT EXISTS reviewer text;
ALTER TABLE medical_aid_icd10_rules ADD COLUMN IF NOT EXISTS confidence_score numeric NOT NULL DEFAULT 0;
ALTER TABLE medical_aid_icd10_rules ADD COLUMN IF NOT EXISTS rule_origin text NOT NULL DEFAULT 'imported';

CREATE INDEX IF NOT EXISTS medical_aid_icd10_rules_aid_idx ON medical_aid_icd10_rules(lower(medical_aid_name));
CREATE INDEX IF NOT EXISTS medical_aid_icd10_rules_code_idx ON medical_aid_icd10_rules(icd10_code);
CREATE INDEX IF NOT EXISTS medical_aid_icd10_rules_active_idx ON medical_aid_icd10_rules(active_flag);

CREATE TABLE IF NOT EXISTS medicine_icd10_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_name text NOT NULL,
  medicine_identifier text,
  icd10_code text NOT NULL,
  relationship_type text NOT NULL,
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  document_id uuid NOT NULL REFERENCES documents(id),
  source_id uuid NOT NULL,
  source_version integer NOT NULL,
  source_name text,
  source_page_section_reference text,
  import_date timestamptz NOT NULL DEFAULT now(),
  approval_status text NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'seed_demo')),
  reviewer text,
  rule_origin text NOT NULL DEFAULT 'imported' CHECK (rule_origin IN ('seed_demo', 'imported')),
  active_flag boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE medicine_icd10_mappings ADD COLUMN IF NOT EXISTS source_name text;
ALTER TABLE medicine_icd10_mappings ADD COLUMN IF NOT EXISTS source_page_section_reference text;
ALTER TABLE medicine_icd10_mappings ADD COLUMN IF NOT EXISTS import_date timestamptz NOT NULL DEFAULT now();
ALTER TABLE medicine_icd10_mappings ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';
ALTER TABLE medicine_icd10_mappings ADD COLUMN IF NOT EXISTS reviewer text;
ALTER TABLE medicine_icd10_mappings ADD COLUMN IF NOT EXISTS rule_origin text NOT NULL DEFAULT 'imported';

CREATE INDEX IF NOT EXISTS medicine_icd10_mappings_medicine_idx ON medicine_icd10_mappings(lower(medicine_name));
CREATE INDEX IF NOT EXISTS medicine_icd10_mappings_code_idx ON medicine_icd10_mappings(icd10_code);
CREATE INDEX IF NOT EXISTS medicine_icd10_mappings_active_idx ON medicine_icd10_mappings(active_flag);

CREATE TABLE IF NOT EXISTS allergy_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS allergy_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allergy_group_id uuid NOT NULL REFERENCES allergy_groups(id) ON DELETE CASCADE,
  term text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (allergy_group_id, term)
);

CREATE TABLE IF NOT EXISTS allergy_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allergy_term_id uuid NOT NULL REFERENCES allergy_terms(id) ON DELETE CASCADE,
  alias text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (allergy_term_id, alias)
);

CREATE TABLE IF NOT EXISTS medicine_allergy_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine text NOT NULL,
  allergy_group_id uuid NOT NULL REFERENCES allergy_groups(id),
  severity text NOT NULL CHECK (severity IN ('low', 'moderate', 'high', 'contraindicated')),
  warning text NOT NULL,
  source_reference text NOT NULL,
  last_reviewed_date date NOT NULL DEFAULT current_date,
  source_document_id uuid REFERENCES documents(id),
  source_name text,
  source_version integer,
  source_page_section_reference text,
  import_date timestamptz NOT NULL DEFAULT now(),
  approval_status text NOT NULL DEFAULT 'seed_demo' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'seed_demo')),
  reviewer text,
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  rule_origin text NOT NULL DEFAULT 'seed_demo' CHECK (rule_origin IN ('seed_demo', 'imported')),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (medicine, allergy_group_id)
);

ALTER TABLE medicine_allergy_risks ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES documents(id);
ALTER TABLE medicine_allergy_risks ADD COLUMN IF NOT EXISTS source_name text;
ALTER TABLE medicine_allergy_risks ADD COLUMN IF NOT EXISTS source_version integer;
ALTER TABLE medicine_allergy_risks ADD COLUMN IF NOT EXISTS source_page_section_reference text;
ALTER TABLE medicine_allergy_risks ADD COLUMN IF NOT EXISTS import_date timestamptz NOT NULL DEFAULT now();
ALTER TABLE medicine_allergy_risks ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'seed_demo';
ALTER TABLE medicine_allergy_risks ADD COLUMN IF NOT EXISTS reviewer text;
ALTER TABLE medicine_allergy_risks ADD COLUMN IF NOT EXISTS confidence_score numeric NOT NULL DEFAULT 0;
ALTER TABLE medicine_allergy_risks ADD COLUMN IF NOT EXISTS rule_origin text NOT NULL DEFAULT 'seed_demo';

CREATE INDEX IF NOT EXISTS medicine_allergy_risks_medicine_idx ON medicine_allergy_risks(lower(medicine));
CREATE INDEX IF NOT EXISTS medicine_allergy_risks_active_idx ON medicine_allergy_risks(active);

CREATE TABLE IF NOT EXISTS medicine_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_a text NOT NULL,
  medicine_b text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('minor', 'moderate', 'major', 'contraindicated')),
  interaction_reason text NOT NULL,
  action_required text NOT NULL,
  source_document_id uuid REFERENCES documents(id),
  source_name text,
  source_version integer,
  source_page_section_reference text,
  import_date timestamptz NOT NULL DEFAULT now(),
  approval_status text NOT NULL DEFAULT 'seed_demo' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'seed_demo')),
  reviewer text,
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  rule_origin text NOT NULL DEFAULT 'seed_demo' CHECK (rule_origin IN ('seed_demo', 'imported')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (medicine_a, medicine_b)
);

ALTER TABLE medicine_interactions ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES documents(id);
ALTER TABLE medicine_interactions ADD COLUMN IF NOT EXISTS source_name text;
ALTER TABLE medicine_interactions ADD COLUMN IF NOT EXISTS source_version integer;
ALTER TABLE medicine_interactions ADD COLUMN IF NOT EXISTS source_page_section_reference text;
ALTER TABLE medicine_interactions ADD COLUMN IF NOT EXISTS import_date timestamptz NOT NULL DEFAULT now();
ALTER TABLE medicine_interactions ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'seed_demo';
ALTER TABLE medicine_interactions ADD COLUMN IF NOT EXISTS reviewer text;
ALTER TABLE medicine_interactions ADD COLUMN IF NOT EXISTS confidence_score numeric NOT NULL DEFAULT 0;
ALTER TABLE medicine_interactions ADD COLUMN IF NOT EXISTS rule_origin text NOT NULL DEFAULT 'seed_demo';

CREATE TABLE IF NOT EXISTS interaction_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id uuid NOT NULL REFERENCES medicine_interactions(id) ON DELETE CASCADE,
  reference text NOT NULL,
  last_reviewed_date date NOT NULL DEFAULT current_date,
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS medicine_interactions_a_idx ON medicine_interactions(lower(medicine_a));
CREATE INDEX IF NOT EXISTS medicine_interactions_b_idx ON medicine_interactions(lower(medicine_b));
CREATE INDEX IF NOT EXISTS medicine_interactions_active_idx ON medicine_interactions(active);

CREATE TABLE IF NOT EXISTS medicine_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_name text NOT NULL,
  schedule text NOT NULL,
  controlled_flag boolean NOT NULL DEFAULT false,
  source_document_id uuid NOT NULL REFERENCES documents(id),
  source_name text NOT NULL,
  source_version integer NOT NULL,
  source_page_section_reference text,
  import_date timestamptz NOT NULL DEFAULT now(),
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'seed_demo')),
  reviewer text,
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  active_flag boolean NOT NULL DEFAULT false,
  rule_origin text NOT NULL DEFAULT 'imported' CHECK (rule_origin IN ('seed_demo', 'imported'))
);

CREATE INDEX IF NOT EXISTS medicine_schedules_medicine_idx ON medicine_schedules(lower(medicine_name));
CREATE INDEX IF NOT EXISTS medicine_schedules_active_idx ON medicine_schedules(active_flag, approval_status);

CREATE TABLE IF NOT EXISTS nappi_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nappi_code text NOT NULL,
  medicine_name text NOT NULL,
  medicine_identifier text,
  source_document_id uuid NOT NULL REFERENCES documents(id),
  source_name text NOT NULL,
  source_version integer NOT NULL,
  source_page_section_reference text,
  import_date timestamptz NOT NULL DEFAULT now(),
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'seed_demo')),
  reviewer text,
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  active_flag boolean NOT NULL DEFAULT false,
  rule_origin text NOT NULL DEFAULT 'imported' CHECK (rule_origin IN ('seed_demo', 'imported'))
);

CREATE INDEX IF NOT EXISTS nappi_mappings_code_idx ON nappi_mappings(nappi_code);
CREATE INDEX IF NOT EXISTS nappi_mappings_medicine_idx ON nappi_mappings(lower(medicine_name));

CREATE TABLE IF NOT EXISTS extracted_rule_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type text NOT NULL CHECK (rule_type IN (
    'medicine_risk_profile',
    'allergy_mapping',
    'drug_interaction',
    'icd10_code',
    'medical_aid_rule',
    'medicine_schedule',
    'nappi_mapping',
    'medicine_icd10_mapping'
  )),
  extracted_payload jsonb NOT NULL,
  edited_payload jsonb,
  source_document_id uuid NOT NULL REFERENCES documents(id),
  source_name text NOT NULL,
  source_version integer NOT NULL,
  source_page_section_reference text,
  import_date timestamptz NOT NULL DEFAULT now(),
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  reviewer text,
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  active_flag boolean NOT NULL DEFAULT false,
  rejection_reason text,
  activated_rule_id uuid,
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS extracted_rule_reviews_status_idx ON extracted_rule_reviews(rule_type, approval_status);
CREATE INDEX IF NOT EXISTS extracted_rule_reviews_source_idx ON extracted_rule_reviews(source_document_id);

UPDATE medicine_risk_profiles
SET source_name = COALESCE(source_name, 'Seed/demo rule - not production verified'),
    approval_status = 'seed_demo',
    rule_origin = 'seed_demo'
WHERE source_document_id IS NULL;

UPDATE medicine_allergy_risks
SET source_name = COALESCE(source_name, 'Seed/demo rule - not production verified'),
    approval_status = 'seed_demo',
    rule_origin = 'seed_demo'
WHERE source_document_id IS NULL;

UPDATE medicine_interactions
SET source_name = COALESCE(source_name, 'Seed/demo rule - not production verified'),
    approval_status = 'seed_demo',
    rule_origin = 'seed_demo'
WHERE source_document_id IS NULL;

INSERT INTO allergy_groups (name) VALUES
  ('Penicillin'),
  ('Sulphonamides'),
  ('NSAIDs'),
  ('Aspirin'),
  ('Cephalosporins'),
  ('Macrolides'),
  ('Opioids'),
  ('Local anaesthetics'),
  ('Contrast agents'),
  ('Food allergies'),
  ('Other')
ON CONFLICT (name) DO NOTHING;

INSERT INTO allergy_terms (allergy_group_id, term)
SELECT id, name FROM allergy_groups
ON CONFLICT DO NOTHING;

INSERT INTO allergy_aliases (allergy_term_id, alias)
SELECT t.id, alias
FROM allergy_terms t
JOIN allergy_groups g ON g.id = t.allergy_group_id
JOIN (VALUES
  ('Penicillin', 'penicillin'),
  ('Penicillin', 'amoxicillin'),
  ('Penicillin', 'ampicillin'),
  ('Sulphonamides', 'sulpha'),
  ('Sulphonamides', 'sulfa'),
  ('Sulphonamides', 'sulfonamide'),
  ('NSAIDs', 'nsaid'),
  ('NSAIDs', 'ibuprofen'),
  ('NSAIDs', 'naproxen'),
  ('NSAIDs', 'diclofenac'),
  ('Aspirin', 'aspirin'),
  ('Aspirin', 'acetylsalicylic acid'),
  ('Cephalosporins', 'cephalexin'),
  ('Cephalosporins', 'cefuroxime'),
  ('Macrolides', 'azithromycin'),
  ('Macrolides', 'clarithromycin'),
  ('Opioids', 'codeine'),
  ('Opioids', 'morphine'),
  ('Local anaesthetics', 'lidocaine'),
  ('Local anaesthetics', 'lignocaine'),
  ('Contrast agents', 'iodine contrast'),
  ('Food allergies', 'peanut')
) AS seed(group_name, alias) ON seed.group_name = g.name
ON CONFLICT DO NOTHING;

INSERT INTO medicine_allergy_risks (medicine, allergy_group_id, severity, warning, source_reference)
SELECT medicine, g.id, severity, warning, 'seeded pilot safety profile'
FROM allergy_groups g
JOIN (VALUES
  ('amoxicillin', 'Penicillin', 'contraindicated', 'Potential penicillin allergy conflict.'),
  ('ampicillin', 'Penicillin', 'contraindicated', 'Potential penicillin allergy conflict.'),
  ('aspirin', 'Aspirin', 'contraindicated', 'Potential aspirin allergy conflict.'),
  ('ibuprofen', 'NSAIDs', 'high', 'Potential NSAID allergy conflict.'),
  ('diclofenac', 'NSAIDs', 'high', 'Potential NSAID allergy conflict.'),
  ('codeine', 'Opioids', 'high', 'Potential opioid allergy conflict.')
) AS seed(medicine, group_name, severity, warning) ON seed.group_name = g.name
ON CONFLICT DO NOTHING;

INSERT INTO medicine_interactions (medicine_a, medicine_b, severity, interaction_reason, action_required)
VALUES
  ('warfarin', 'aspirin', 'major', 'Increased bleeding risk.', 'Pharmacist review required before dispensing.'),
  ('warfarin', 'ibuprofen', 'major', 'Increased bleeding risk with NSAID.', 'Pharmacist review required before dispensing.'),
  ('warfarin', 'diclofenac', 'major', 'Increased bleeding risk with NSAID.', 'Pharmacist review required before dispensing.'),
  ('methotrexate', 'trimethoprim', 'contraindicated', 'Increased antifolate toxicity risk.', 'Do not proceed without pharmacist review.'),
  ('lithium', 'ibuprofen', 'major', 'NSAIDs may increase lithium levels.', 'Pharmacist review required.'),
  ('digoxin', 'clarithromycin', 'major', 'May increase digoxin toxicity risk.', 'Pharmacist review required.'),
  ('insulin', 'prednisone', 'moderate', 'Corticosteroids may increase glucose levels.', 'Counselling and monitoring may be required.'),
  ('ibuprofen', 'renal impairment', 'major', 'NSAID use may worsen renal impairment.', 'Pharmacist review required before dispensing.'),
  ('diclofenac', 'renal impairment', 'major', 'NSAID use may worsen renal impairment.', 'Pharmacist review required before dispensing.'),
  ('metformin', 'renal impairment', 'major', 'Renal impairment may affect metformin safety.', 'Confirm renal function and pharmacist review required.')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS patient_context_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_type text NOT NULL UNIQUE,
  required_fields text[] NOT NULL DEFAULT '{}',
  active_flag boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO patient_context_requirements (query_type, required_fields) VALUES
  ('Dosage', ARRAY['age', 'weight', 'pregnancyStatus', 'breastfeedingStatus', 'renalImpairment', 'hepaticImpairment']),
  ('Drug interactions', ARRAY['age', 'allergies', 'chronicConditions', 'renalImpairment', 'hepaticImpairment']),
  ('Contraindications', ARRAY['age', 'pregnancyStatus', 'breastfeedingStatus', 'allergies', 'chronicConditions', 'renalImpairment', 'hepaticImpairment']),
  ('Side effects', ARRAY['age', 'allergies', 'chronicConditions']),
  ('Counselling points', ARRAY['age', 'pregnancyStatus', 'breastfeedingStatus', 'allergies']),
  ('Administration guidance', ARRAY['age', 'weight', 'renalImpairment', 'hepaticImpairment']),
  ('General medicine information', ARRAY[]::text[]),
  ('ICD-10', ARRAY['age', 'gender', 'chronicConditions']),
  ('Medicine suitability', ARRAY['age', 'pregnancyStatus', 'breastfeedingStatus', 'allergies', 'chronicConditions', 'renalImpairment', 'hepaticImpairment']),
  ('Unknown', ARRAY[]::text[])
ON CONFLICT (query_type) DO UPDATE
SET required_fields = EXCLUDED.required_fields,
    active_flag = true,
    updated_at = now();

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid REFERENCES pharmacies(id),
  external_id text NOT NULL UNIQUE,
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS pharmacy_id uuid REFERENCES pharmacies(id);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by text NOT NULL DEFAULT 'system',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS app_users_external_id_idx ON app_users(external_id);

CREATE TABLE IF NOT EXISTS ingestion_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by text NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ingestion_settings (key, value, updated_by)
VALUES (
  'approved_source_domains',
  '["sahpra.org.za","health.gov.za","nicd.ac.za","hpcsa.co.za","who.int"]'::jsonb,
  'system'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO roles (name, description) VALUES
  ('system_owner', 'Platform owner with access to all pharmacies and pharmacy account management.'),
  ('super_admin', 'Full operational and governance access.'),
  ('pharmacy_manager', 'Document submission, audit, reporting, and approved-source viewing.'),
  ('pharmacist', 'Assistant querying, citations, source details, and answer history.'),
  ('pharmacy_assistant', 'Assistant querying and citation viewing.')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO permissions (key, description) VALUES
  ('pharmacies.create', 'Create pharmacy accounts.'),
  ('pharmacies.suspend', 'Suspend pharmacy accounts.'),
  ('pharmacy_managers.manage', 'Add or suspend pharmacy managers.'),
  ('employees.manage', 'Add, edit, deactivate, and assign employee roles.'),
  ('employees.reset_pin', 'Reset employee PINs.'),
  ('pharmacy_audits.view', 'View pharmacy-scoped audit logs.'),
  ('users.manage', 'Manage users and role assignments.'),
  ('sources.view_approved', 'View approved source records.'),
  ('sources.upload', 'Upload documents and submit URLs.'),
  ('sources.approve', 'Approve source versions for indexing.'),
  ('sources.reject', 'Reject source versions.'),
  ('sources.replace', 'Submit replacement source versions.'),
  ('sources.archive', 'Archive source versions.'),
  ('sources.configure_ingestion', 'Configure approved ingestion domains and ingestion settings.'),
  ('audits.view', 'View audit logs.'),
  ('reports.view', 'View pilot reports and metrics.'),
  ('assistant.query', 'Query the assistant.'),
  ('citations.view', 'View citations.'),
  ('source_details.view', 'View cited source details.'),
  ('answer_history.view', 'View answer history.')
  ,('answers.feedback', 'Submit answer feedback.')
  ,('review_queue.view', 'View answer review queue.')
  ,('review_queue.manage', 'Manage answer review queue.')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  r.name = 'system_owner'
  OR
  r.name = 'super_admin'
  OR (r.name = 'pharmacy_manager' AND p.key IN ('sources.view_approved', 'sources.upload', 'sources.replace', 'audits.view', 'reports.view', 'review_queue.view', 'review_queue.manage'))
  OR (r.name = 'pharmacist' AND p.key IN ('assistant.query', 'citations.view', 'source_details.view', 'answer_history.view', 'answers.feedback'))
  OR (r.name = 'pharmacy_assistant' AND p.key IN ('assistant.query', 'citations.view'))
)
ON CONFLICT DO NOTHING;

INSERT INTO app_users (external_id, display_name) VALUES
  ('system:super-admin', 'Default Super Admin')
ON CONFLICT (external_id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, 'system'
FROM app_users u
JOIN roles r ON r.name = 'super_admin'
WHERE u.external_id = 'system:super-admin'
ON CONFLICT DO NOTHING;
