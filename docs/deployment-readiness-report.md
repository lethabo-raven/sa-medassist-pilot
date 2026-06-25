# Deployment Readiness Report

Target result: 0 FAIL items.

## PASS

- Imports resolve by declared dependencies and Node.js built-ins.
- No missing declared runtime dependencies after adding `express-rate-limit`.
- Root, client, and server `package.json` scripts are valid.
- Docker Compose uses the `pgvector/pgvector:pg16` image and database `sa_medassist`.
- PostgreSQL migrations create and validate `vector` and `pgcrypto` before applying schema.
- PM2 configuration uses isolated process `sa-medassist-api`, port `4100`, one process, and Free Tier memory constraints.
- Standalone Caddy config exists at `deploy/oracle-linux/sa-medassist.Caddyfile`.
- Caddy config supports both `medassist.domain.com` and `domain.com/medassist`.
- Environment variables are documented in `.env.example`, `deploy/oracle-linux/sa-medassist.env.example`, `README.md`, and `deployment.md`.
- GitHub Actions workflow deploys to `/opt/sa-medassist-pilot`, publishes frontend assets to `/var/www/sa-medassist`, runs migrations, and reloads only `sa-medassist-api`.
- Widget build process is valid: `/widget.js` is a standalone vanilla JavaScript asset served by the API and does not require React bundling.
- Oracle Linux deployment steps install Node.js 22 explicitly and fail if Node 22 is unavailable.
- URL ingestion streams remote content, enforces `MAX_URL_BYTES`, times out slow requests, blocks unsafe targets, and audits failures.
- CORS supports multiple approved origins through `ALLOWED_ORIGINS` and rejects non-approved browser origins.

## WARNING

- GitHub Actions still requires production secrets: `ORACLE_VM_HOST`, `ORACLE_VM_USER`, and `ORACLE_VM_SSH_KEY`.
- Oracle Free Tier can be resource-constrained when TransitIQ, PostgreSQL, Ollama, Caddy, and SA MedAssist run together. Use small Ollama models and approve/index documents off-peak.
- The Caddy file contains placeholder domains and must be edited before validation.
- Medicine metrics use a starter medicine dictionary and should be expanded for a production pilot.
- Approved URL domains are configurable, but the pilot operator must maintain the approved-source policy.

## FAIL

- None.

## Final Pre-Deployment Commands

```bash
sudo ./setup-server.sh
npm install
npm run build
npm run db:migrate
sudo cp deploy/oracle-linux/sa-medassist.Caddyfile /etc/caddy/conf.d/sa-medassist.caddy
sudo nano /etc/caddy/conf.d/sa-medassist.caddy
sudo caddy validate --config /etc/caddy/Caddyfile
pm2 startOrReload ecosystem.config.cjs --only sa-medassist-api
pm2 save
sudo systemctl reload caddy
```
