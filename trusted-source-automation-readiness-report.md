# Trusted Source Automation Readiness Report

Scope: backend/database trusted-source automation only. No UI redesign, no TransitIQ changes, no Caddy/PM2 changes, no Ollama, no AI model installation, no RBAC changes, no authentication-flow changes, no retrieval/citation/clinical safety weakening.

## PASS

- Trusted source automation schema added/extended.
- `pgvector` is not required.
- `ENABLE_PGVECTOR=false` is supported and treated as the pilot default.
- PostgreSQL full-text search fallback is implemented through `trusted_document_chunks.search_text` as a generated `tsvector` column and GIN index.
- Initial trusted sources are seeded:
  - SAHPRA
  - National Department of Health
  - NICD
  - SAMRC
- Manual ingestion commands exist:
  - `npm run ingest:trusted-sources`
  - `npm run ingest:trusted-source -- --source=SAHPRA`
- Scheduler-ready function exists:
  - `runTrustedSourceCheck(options)`
- Source discovery:
  - Fetches enabled trusted source pages.
  - Parses HTML links.
  - Resolves relative links.
  - Filters allowed domains.
  - Detects PDF, DOCX, XLSX, and CSV links.
- Download logic:
  - Downloads files automatically.
  - Stores files under `server/storage/trusted-sources/<source_name>/<yyyy-mm-dd>/` by default.
  - Supports `TRUSTED_SOURCE_STORAGE_DIR`.
  - Enforces `TRUSTED_SOURCE_MAX_DOWNLOAD_BYTES`.
  - Calculates SHA-256 checksum.
  - Skips unchanged duplicates.
  - Creates a new pending version when checksum changes.
  - Does not silently overwrite approved documents.
  - Logs skipped, failed, duplicate, changed, and downloaded files in the command summary.
- Extraction logic:
  - CSV extraction supported.
  - PDF text extraction supported with a no-OCR text fallback.
  - DOCX/XLSX basic text extraction fallback supported without adding dependencies.
  - Extraction failure marks `ingestion_status = 'extraction_failed'`.
  - OCR is not used.
  - AI summarisation is not used.
- Chunking logic:
  - Extracted text is chunked automatically.
  - Chunks preserve document ID, source URL, authority, version, publication date, and chunk index.
  - Chunks are stored in `trusted_document_chunks`.
- Approval workflow:
  - New downloads default to `approval_status = 'pending_review'`.
  - New downloads default to `active = false`.
  - Existing approved documents remain active until newer versions are explicitly approved.
  - Approval helper can activate a new version and supersede the previous active version.

## WARNING

- Runtime verification could not be completed because command execution is blocked by:
  - `CreateProcessAsUserW failed: 5`
- At least one trusted source has not been scanned in this environment.
- No file has been downloaded in this environment.
- Extraction and chunking have not been runtime-confirmed in this environment.
- Placeholder source URLs may need final validation against approved official source pages.
- DOCX/XLSX extraction is dependency-free fallback extraction only. If high-fidelity Office extraction is needed later, use a reviewed parser dependency.
- PDF extraction does not use OCR; scanned PDFs may extract little or no text and will be marked failed/empty.

## FAIL

- Full success cannot be claimed because runtime verification did not confirm:
  - source scan
  - document discovery
  - file download
  - text extraction
  - chunk storage

## Files Changed

- `server/src/db/migrations/20260625_trusted_source_ingestion.sql`
- `server/src/services/trustedSourceIngestion.js`
- `server/src/commands/ingestTrustedSources.js`
- `server/package.json`
- `README.md`
- `trusted-source-ingestion-readiness-report.md`
- `trusted-source-automation-readiness-report.md`

## Database Changes

### `trusted_sources`

Supports:

- `source_id`
- `source_name`
- `source_type`
- `base_url`
- `allowed_domains`
- `authority`
- `document_category`
- `enabled`
- `auto_check_frequency`
- `last_checked_at`
- `created_at`
- `updated_at`

### `trusted_source_documents`

Supports:

- `document_id`
- `source_id`
- `pharmacy_id`
- `title`
- `source_url`
- `file_url`
- `local_file_path`
- `document_type`
- `authority`
- `version`
- `publication_date`
- `effective_date`
- `expiry_date`
- `checksum`
- `download_status`
- `ingestion_status`
- `approval_status`
- `active`
- `previous_document_id`
- `created_at`
- `updated_at`

### `trusted_document_chunks`

Supports:

- `document_id`
- `chunk_index`
- `chunk_text`
- `page_number`
- `source_url`
- `authority`
- `version`
- `publication_date`
- `search_text`
- `created_at`

## Commands Added

```bash
npm run ingest:trusted-sources
```

```bash
npm run ingest:trusted-source -- --source=SAHPRA
```

## Pgvector Status

- `pgvector` is optional.
- The trusted-source automation does not create vector columns.
- The trusted-source automation does not create vector indexes.
- With `ENABLE_PGVECTOR=false`, keyword/full-text search fallback is available through PostgreSQL `tsvector`.

## Runtime Verification Status

- Whether at least one source was scanned: NOT VERIFIED
- Whether PDFs/files were discovered: NOT VERIFIED
- Whether files were downloaded: NOT VERIFIED
- Whether extraction worked: NOT VERIFIED
- Whether chunks were stored: NOT VERIFIED
- Whether approval is required: PASS by schema/defaults

## Remaining Blockers

1. Run migrations against PostgreSQL 13.
2. Run:

```bash
cd server
npm run ingest:trusted-source -- --source=SAHPRA
```

3. Confirm command summary logs discovered/downloaded/skipped/failed results.
4. Confirm rows appear in:
   - `trusted_source_documents`
   - `documents`
   - `trusted_document_chunks`
5. Confirm downloaded documents remain pending review and inactive.
6. Confirm approved/active/non-expired retrieval remains enforced by existing retrieval/citation safety logic.

## Later Scheduling Instructions

Use the existing command with PM2 or cron later. Do not add scheduling until deployment policy is confirmed.

Example cron shape:

```bash
0 */12 * * * cd /path/to/sa-medassist-pilot/server && npm run ingest:trusted-sources >> logs/trusted-source-ingestion.log 2>&1
```

Example PM2 cron shape:

```bash
pm2 start npm --name axian-trusted-source-ingestion --cron "0 */12 * * *" -- run ingest:trusted-sources
```

