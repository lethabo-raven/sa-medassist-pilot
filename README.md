# SA MedAssist Pilot

MVP for a verified South African medical-information assistant.

## What is included

- React/Vite frontend with a floating chat widget
- Node.js/Express backend
- PostgreSQL with `pgvector`
- Ollama chat and embedding support
- Admin document and approved URL submission
- Pending, approved, and rejected source workflow
- Audit logs for chat and upload activity
- Citation-only answer enforcement
- Vanilla embeddable website widget at `/widget.js`
- Oracle Linux shared-VM deployment with PM2

## Quick start

1. Copy `.env.example` to `.env` and set `ADMIN_TOKEN`.
2. Start PostgreSQL with pgvector:

```bash
docker compose up -d db
```

3. Install dependencies:

```bash
npm install
```

4. Run the schema migration:

```bash
npm run db:migrate
```

5. Start Ollama and pull models:

```bash
ollama pull llama3.1
ollama pull nomic-embed-text
```

6. Start the app:

```bash
npm run dev
```

Open `http://localhost:5173`.

## Safety model

The assistant only answers from uploaded, verified source documents. If the retrieval layer finds no relevant cited sources, the assistant refuses to answer and asks the user to consult a qualified health professional or verified South African health source.

Clinical decision-support only. Not a replacement for professional judgement.

This MVP is informational only and must not be used for diagnosis, emergency triage, prescribing, or replacing professional medical advice.

## Source approval workflow

1. Admin uploads a PDF/text document or submits an approved medical URL.
2. The source is stored as `pending`.
3. Admin approves or rejects it.
4. Only `approved` documents are chunked, embedded with Ollama, stored in pgvector, and used in answers.
5. Rejected documents are not indexed and cannot be cited.

Recognised URL sources include SAHPRA, NDoH, NICD, HPCSA, and WHO domains. Admins can explicitly override this for another approved medical URL.

## Main endpoints

- `POST /api/chat` - citation-only assistant answers
- `POST /api/admin/documents` - admin document upload for review
- `POST /api/admin/documents/url` - approved URL fetch for review
- `POST /api/admin/documents/:id/approve` - approve and index source
- `POST /api/admin/documents/:id/reject` - reject source and remove chunks
- `GET /api/admin/documents` - indexed document list
- `GET /api/audit` - recent audit events
- `GET /api/admin/metrics` - pilot metrics dashboard data
- `GET /api/health` - service health check

Admin endpoints require the `x-admin-token` header.

## Deployment

Shared Oracle Linux VM deployment instructions are in `deployment.md`.
The senior architecture review and pilot hardening notes are in `docs/architectural-review.md`.
Access-control governance is documented in `docs/role-matrix.md` and `docs/access-control-readiness-report.md`.
Retrieval quality controls are documented in `docs/retrieval-quality-readiness-report.md`.
Pharmacy pilot workflow readiness is documented in `docs/pilot-readiness-report.md`.
Clinical safety controls are documented in `docs/clinical-safety-readiness-report.md`.
Pharmacy assistant safety is documented in `docs/pharmacy-assistant-safety-readiness-report.md`.
Chatbot role handling is documented in `docs/role-handling-readiness-report.md`.
Medicine risk readiness is documented in `docs/medicine-risk-readiness-report.md`.
ICD-10 and medical aid architecture readiness is documented in `docs/icd10-medical-aid-readiness-report.md`.
Patient context safety is documented in `docs/patient-context-safety-readiness-report.md`.
Clinical plausibility validation is documented in `docs/clinical-plausibility-readiness-report.md`.
Allergy and interaction safety is documented in `docs/allergy-interaction-safety-readiness-report.md`.
Source-backed rule import architecture is documented in `docs/source-backed-rules-readiness-report.md`.
Clinical knowledge ingestion is documented in `docs/clinical-ingestion-readiness-report.md`.
Pharmacy staff authentication and access management is documented in `docs/pharmacy-auth-readiness-report.md`.
Pharmacy staff authentication and tenant access management is documented in `docs/pharmacy-auth-readiness-report.md`.

This deployment uses:

- `/var/www/sa-medassist` for frontend assets
- port `4100` for the backend API
- PM2 process `sa-medassist-api`
- PostgreSQL database `sa_medassist`
- separate env file `/etc/sa-medassist/sa-medassist.env`

It does not modify TransitIQ, existing PM2 processes, the existing Caddy config, or `/var/www/app`.

## Website widget

Add this to any pharmacy website:

```html
<script>
  window.SAMedAssistWidget = {
    apiBase: "https://DOMAIN/api",
    brandName: "Your Pharmacy",
    primaryColor: "#23715f",
    accentColor: "#18212f"
  };
</script>
<script src="https://DOMAIN/widget.js"></script>
```

Add every embedding website to `ALLOWED_ORIGINS`:

```env
ALLOWED_ORIGINS=https://DOMAIN,https://pharmacy.example.org
```

Requests from non-approved browser origins are rejected.
## Demo Users

Demo users are for local pilot testing only. Do not seed or use these accounts in production unless `DEMO_MODE=true`.

Demo pharmacy:

- Pharmacy Code: `PH-SA-0001`
- Name: `Demo Community Pharmacy`

Demo logins:

- Pharmacist Assistant: employee `PA001`, PIN `123456`, role `pharmacist_assistant`
- Pharmacist: employee `PH001`, PIN `123456`, role `pharmacist`
- Pharmacy Manager: employee `PM001`, PIN `123456`, role `pharmacy_manager`

Seed locally:

PowerShell:

```powershell
$env:DEMO_MODE="true"
cd server
npm run seed:demo-users
```

Bash:

```bash
DEMO_MODE=true npm --prefix server run seed:demo-users
```

After seeding, log in to Axian with Pharmacy Code + Employee Number + PIN.

## Trusted Source Ingestion

Trusted source ingestion is backend-only. It does not install Ollama, download any AI model, or activate documents automatically.

Run all enabled trusted sources:

```bash
cd server
npm run ingest:trusted-sources
```

Run one source:

```bash
cd server
npm run ingest:trusted-source -- --source=SAHPRA
```

Downloaded documents are stored as pending review. Axian must only use documents after review approval and activation.

Useful environment variables:

- `TRUSTED_SOURCE_STORAGE_DIR`: local storage path for downloaded documents.
- `TRUSTED_SOURCE_MAX_DOWNLOAD_BYTES`: maximum download size. Defaults to 50 MB.
