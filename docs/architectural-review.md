# Senior Architecture Review

## Scalability Risks

- Embedding work is CPU-heavy and can block pilot admins during document approval.
- Oracle Free Tier has limited memory and CPU burst capacity, especially if Ollama, PostgreSQL, PM2, Caddy, and TransitIQ share one VM.
- Audit logs and metrics queries can grow over time.

## Scalability Fixes Applied

- Moved Ollama embedding work outside database transactions before final approval writes.
- Added database indexes for document status, source URL, chunk document lookup, audit event type, audit actor, and audit timestamps.
- Added `db:maintenance` for audit retention.
- Kept PM2 to one process with a 350 MB memory restart threshold for the API.

## Security Risks

- Admin token comparison could leak timing information.
- Open CORS could allow unintended browser clients.
- URL ingestion could be abused for SSRF against localhost, metadata services, or private networks.
- Large or slow URLs could exhaust Free Tier resources.
- PM2 logs can grow without rotation.

## Security Fixes Applied

- Admin tokens are now compared with SHA-256 and timing-safe equality.
- Optional `ADMIN_TOKEN_SHA256` allows hashed admin secrets in production.
- CORS now uses `ALLOWED_ORIGINS`.
- URL ingestion now permits only HTTP/HTTPS, rejects credentials, rejects redirects, blocks private IP targets after DNS lookup, applies a timeout, and enforces a maximum response size.
- Added API rate limits for chat and admin endpoints.
- Added log rotation for the PM2 process.

## Medical Compliance Risks

- The model may invent citations or cite unavailable source numbers.
- Source text can contain prompt-injection instructions.
- No approved source corpus should produce a clear refusal.
- Admins must not accidentally index pending or rejected sources.

## Medical Compliance Fixes Applied

- Retrieval only uses `approved` documents.
- Chat refuses when there are no approved sources.
- Chat refuses if model output has no citations or citation numbers outside the retrieved source range.
- Source text is explicitly treated as untrusted content in the model instruction.
- All refusals are written to audit logs.
- Safety disclaimer is displayed in the app and embedded widget.

## Database Issues

- Earlier status model used `verified`; the required workflow uses `pending`, `approved`, and `rejected`.
- Holding transactions while embedding chunks can lock rows for too long.
- Metrics and retrieval need supporting indexes.

## Database Fixes Applied

- Added approval/rejection metadata fields.
- Added migration compatibility from `verified` to `approved`.
- Only approved documents are indexed into `document_chunks`.
- Added supporting indexes and audit retention script.

## Deployment Issues

- The shared VM already hosts TransitIQ and must not share PM2 names, frontend paths, or app ports.
- PM2 ecosystem `env_file` behavior is not portable enough to rely on.
- Caddy config must be additive, not destructive.

## Deployment Fixes Applied

- Backend uses port `4100`.
- PM2 app is named `sa-medassist-api`.
- Frontend target is `/var/www/sa-medassist`.
- Database is `sa_medassist`.
- Runtime config loads `/etc/sa-medassist/sa-medassist.env` directly.
- Deployment docs use a separate Caddy site file and explicitly warn not to overwrite TransitIQ.

## Oracle Free Tier Limitations

- Use one API process.
- Use smaller Ollama models first.
- Avoid approving large documents during peak use.
- Keep audit retention enabled.
- Monitor memory when Ollama and PostgreSQL run on the same VM.
