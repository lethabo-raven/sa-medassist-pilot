# Pgvector Runtime Compatibility Report

Scope: runtime compatibility pass for trusted-source ingestion without requiring pgvector. No UI, Ollama, AI model, authentication flow, RBAC, citation, retrieval safety, or clinical safety changes were made.

## PASS

- Base schema no longer hard-aborts on missing pgvector extension.
- `CREATE EXTENSION vector` is now conditional and non-fatal when pgvector is unavailable.
- Known `embedding vector(768)` column in `document_chunks` was changed to `jsonb`.
- `document_chunks` now has a generated PostgreSQL `tsvector` fallback column:
  - `search_text`
- Trusted-source ingestion uses `trusted_document_chunks.search_text` for PostgreSQL full-text search fallback.
- Added vector compatibility helper:
  - `server/src/services/vectorCompatibility.js`
- Trusted-source ingestion summary now reports:
  - `pgvectorEnabled`
  - `fallbackSearch`
  - `searchMode`
- Added trusted-source full-text search helper:
  - `server/src/services/trustedSourceSearch.js`
- Trusted-source ingestion does not create vector columns.
- Trusted-source ingestion does not create vector indexes.
- `ENABLE_PGVECTOR=false` remains the pilot-safe default.

## WARNING

- Repository-wide `rg` search could not run because process execution is blocked by the Windows sandbox.
- Runtime verification commands could not run because process execution is blocked before npm starts.
- There may still be vector references in files that could not be searched due the runner failure.
- The newly added fallback helper is available for retrieval integration, but full runtime proof requires starting the app and running queries.

## FAIL

- Runtime verification did not pass because commands could not execute.
- The exact runtime app failure after pgvector fixes cannot be observed until the process runner works.

## Files Changed

- `server/src/db/schema.sql`
- `server/src/services/vectorCompatibility.js`
- `server/src/services/trustedSourceIngestion.js`
- `server/src/services/trustedSourceSearch.js`
- `pgvector-runtime-compatibility-report.md`

## Commands Attempted

```bash
npm install
```

```bash
npm run db:migrate
```

```bash
npm run ingest:trusted-source -- --source=SAHPRA
```

All failed with:

```text
CreateProcessAsUserW failed: 5
```

## Expected Next Verification In A Working Terminal

```powershell
cd C:\Users\sthim\Documents\Codex\2026-06-21\sa-medassist-pilot\server
$env:ENABLE_PGVECTOR="false"
npm install
npm run db:migrate
npm run ingest:trusted-source -- --source=SAHPRA
```

Required runtime result:

- migrations succeed without pgvector
- SAHPRA source scan completes or reports unavailable
- files are downloaded when discovered
- metadata is stored
- chunks are stored
- documents remain pending review
- no pgvector extension is required

