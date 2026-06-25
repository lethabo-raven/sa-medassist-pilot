# Deployment Readiness Report

Scope: SA MedAssist Pilot deployment readiness review. No deployment was performed.

## Infrastructure

### PASS

- Backend remains Node.js/Express oriented.
- Frontend remains React/Vite oriented.
- PostgreSQL remains the primary data store.
- pgvector remains required for vector retrieval.
- Ollama/local model support remains part of the existing pilot architecture.
- PM2 deployment remains the intended runtime process manager.

### WARNING

- Environment variables must be verified in the target VM before launch:
  - `DATABASE_URL`
  - `PORT`
  - `ALLOWED_ORIGINS`
  - `OLLAMA_BASE_URL`
  - `OLLAMA_MODEL`
  - `EMBEDDING_MODEL`
  - `JWT_SECRET` or session secret equivalent
  - `MAX_UPLOAD_BYTES`
  - Any document storage path variables
- Required services must be running before migration:
  - PostgreSQL
  - pgvector extension
  - pgcrypto extension
  - Ollama, if local generation is enabled
  - PM2
  - Caddy or reverse proxy already configured for this app

### FAIL

- None confirmed from static review.

## Deployment

### PASS

- Backend should run separately from TransitIQ.
- Existing requirement remains:
  - backend port `4100`
  - PM2 process `sa-medassist-api`
  - frontend path `/var/www/sa-medassist`
  - database `sa_medassist`

### WARNING

- `npm run dev`, `npm run build`, and migration execution could not be run in this session because local command execution is blocked.
- Newly added frontend pages need route registration verification before production build.
- New migrations must be included in the migration execution process:
  - `20260622_phase1_system_owner_portal.sql`
  - `20260623_phase4_knowledge_management.sql`
  - `20260623_phase7_feedback.sql`

### FAIL

- None confirmed.

## Backups

### PASS

- PostgreSQL data should be backed up before migrations.
- Uploaded documents should be backed up separately from database rows.

### WARNING

- Confirm actual upload storage location before pilot deployment.
- Confirm restore process on Oracle Linux VM before production pilot use.

### FAIL

- None confirmed.

## Monitoring

### PASS

- Existing health endpoint should be used if present.
- PM2 logs should be monitored for backend runtime failures.
- Caddy logs should be monitored for proxy errors.
- Audit logs remain the primary application-level trace for clinical and governance events.

### WARNING

- Confirm exact health-check path in the running backend.
- Confirm PM2 log paths on the shared Oracle VM.

### FAIL

- None confirmed.

## Security

### PASS

- RBAC remains in place.
- PIN/password hashing remains in place.
- Authenticated role overrides session-selected role.
- Audit logging remains in place.
- Pharmacy scoping is implemented for manager dashboards, feedback, knowledge management, and analytics.

### WARNING

- Hidden UI is not relied on as a security boundary; backend permissions must be verified route-by-route.
- System Owner bootstrap remains a production hardening item.
- Allowed origins must be configured for the exact deployed domains.

### FAIL

- None confirmed.

## Required Validation Before Deployment

```bash
cd server
npm install
npm test
npm run dev
```

```bash
cd client
npm install
npm run build
```

Run migrations against a staging copy of `sa_medassist` before production pilot rollout.

