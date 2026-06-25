# Trusted Source Ingestion Readiness Report

Scope: backend/database trusted source ingestion only. No Ollama installation, AI model work, UI redesign, authentication changes, RBAC changes, clinical safety changes, retrieval changes, or citation logic changes were performed.

## PASS

- Added trusted source database schema.
- Added trusted source document metadata schema.
- Seeded initial trusted source placeholders:
  - `SAHPRA`
  - `NDOH`
  - `NICD`
- Added crawler/downloader service.
- Added allowed-domain filtering.
- Added supported document filtering for:
  - PDF
  - DOCX
  - XLSX
  - CSV
- Added checksum generation using SHA-256.
- Added duplicate skipping by source URL and checksum.
- Added configurable download size limit:
  - `TRUSTED_SOURCE_MAX_DOWNLOAD_BYTES`
- Added configurable storage directory:
  - `TRUSTED_SOURCE_STORAGE_DIR`
- Downloaded trusted source documents are inserted into the existing document repository as pending review.
- Downloaded trusted source documents are not activated automatically.
- Source URL and authority are preserved for citation metadata.
- Failed downloads are recorded as failed trusted source document rows and logged to stderr.
- Added manual ingestion commands:
  - `npm run ingest:trusted-sources`
  - `npm run ingest:trusted-source -- --source=SAHPRA`
- Added README instructions.

## WARNING

- The ingestion command could not be executed because local process execution is still blocked by:
  - `CreateProcessAsUserW failed: 5`
- No trusted source was actually scanned in this environment.
- No document was downloaded in this environment.
- Source URLs are placeholders and may need adjustment to final approved repository URLs before pilot use.
- The service queues downloaded files into the existing document repository with `processing_status = 'uploaded'` and `approval_status = 'pending'`; the existing parser/chunker/entity/embedding workers must be run separately if they are not automatic.
- The service does not silently overwrite approved documents. Existing downloaded source URLs are skipped; changed documents should create a new pending row when URL/checksum differs.
- Scheduled checks are prepared through the command service but no scheduler was added.

## FAIL

- Required runtime proof is incomplete:
  - At least one trusted source could not be scanned.
  - No trusted source document could be downloaded or confirmed unavailable at runtime.
- This should not be considered fully complete until the command runs successfully in a working environment.

## Files Changed

- `server/src/db/migrations/20260625_trusted_source_ingestion.sql`
- `server/src/services/trustedSourceIngestion.js`
- `server/src/commands/ingestTrustedSources.js`
- `server/package.json`
- `README.md`
- `trusted-source-ingestion-readiness-report.md`

## Tables Added

### `trusted_sources`

- `source_id`
- `source_name`
- `source_type`
- `base_url`
- `allowed_domains`
- `document_category`
- `enabled`
- `last_checked_at`
- `created_at`
- `updated_at`

### `trusted_source_documents`

- `document_id`
- `source_id`
- `pharmacy_id`
- `title`
- `source_url`
- `file_url`
- `document_type`
- `authority`
- `version`
- `publication_date`
- `effective_date`
- `expiry_date`
- `checksum`
- `file_path`
- `download_status`
- `ingestion_status`
- `approval_status`
- `created_at`
- `updated_at`

## Commands Added

```bash
npm run ingest:trusted-sources
```

```bash
npm run ingest:trusted-source -- --source=SAHPRA
```

## Source Discovery Logic

- Fetches each enabled trusted source `base_url`.
- Parses HTML links.
- Converts relative links to absolute URLs.
- Filters by trusted `allowed_domains`.
- Keeps only `.pdf`, `.docx`, `.xlsx`, and `.csv` files.
- De-duplicates discovered links in memory before download.

## Download Logic

- Downloads supported documents using Node `fetch`.
- Enforces `TRUSTED_SOURCE_MAX_DOWNLOAD_BYTES`.
- Streams file content to disk.
- Calculates SHA-256 checksum during download.
- Stores files under:
  - `TRUSTED_SOURCE_STORAGE_DIR`, or
  - `server/storage/trusted-sources`

## Ingestion Integration

Downloaded files create:

- A `trusted_source_documents` row.
- A linked `documents` row with:
  - `trusted_source_document_id`
  - source organization
  - source type
  - source URL
  - authority
  - pending approval status
  - inactive flag

This prepares the existing pipeline:

Download → Store → Existing Parse/Chunk/Extract/Embed Workers → Pending Review → Approval → Active Use

## Approval Workflow

- Trusted source documents remain:
  - `approval_status = 'pending'`
  - `ingestion_status = 'pending_review'`
  - `active_flag = false` on linked document rows
- Axian must only retrieve approved, active, non-expired documents through the existing retrieval/citation safety logic.

## Remaining Blockers

1. Run migrations against PostgreSQL.
2. Run:

```bash
cd server
npm run ingest:trusted-source -- --source=SAHPRA
```

3. Confirm whether SAHPRA placeholder URL exposes direct document links.
4. If unavailable, replace placeholder URLs with final approved source repository URLs.
5. Run existing ingestion workers for downloaded pending documents.
6. Review and approve documents before retrieval use.

