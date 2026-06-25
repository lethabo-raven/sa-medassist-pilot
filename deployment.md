# Shared Oracle Linux VM Deployment

This deployment keeps SA MedAssist separate from TransitIQ.

## Fixed deployment values

- Frontend build path: `/var/www/sa-medassist`
- Backend app path: `/opt/sa-medassist-pilot`
- Backend port: `4100`
- PM2 process name: `sa-medassist-api`
- PostgreSQL database: `sa_medassist`
- Environment file: `/etc/sa-medassist/sa-medassist.env`

Do not use `/var/www/app`, do not rename existing PM2 processes, and do not overwrite the existing Caddy configuration.

## One-time server setup

```bash
sudo ./setup-server.sh
sudo nano /etc/sa-medassist/sa-medassist.env
```

Set all allowed browser origins in the env file. Include the SA MedAssist domain and every pharmacy website that embeds the widget:

```env
ALLOWED_ORIGINS=https://medassist.domain.com,https://domain.com,https://pharmacy.example.org
```

Origins not listed here are rejected by the API.

Install Ollama and pull models:

```bash
ollama pull llama3.1
ollama pull nomic-embed-text
```

## Deploy manually

```bash
cd /opt/sa-medassist-pilot
npm install
npm run db:migrate
npm run build
sudo rsync -a --delete client/dist/ /var/www/sa-medassist/
pm2 startOrReload ecosystem.config.cjs --only sa-medassist-api
pm2 save
```

On Oracle Free Tier, keep PM2 at one backend process and use small Ollama models. Do not run large concurrent ingestion jobs during clinic hours; URL/document approval performs embedding work and can temporarily consume CPU and memory.

## Caddy

Use the standalone Caddy file at `deploy/oracle-linux/sa-medassist.Caddyfile`. Copy it into a separate import path without overwriting TransitIQ:

```bash
sudo mkdir -p /etc/caddy/conf.d
sudo cp deploy/oracle-linux/sa-medassist.Caddyfile /etc/caddy/conf.d/sa-medassist.caddy
sudo nano /etc/caddy/conf.d/sa-medassist.caddy
```

The file supports both:

- `medassist.domain.com`
- `domain.com/medassist`

Add an import line to the existing Caddyfile only if the VM does not already import `conf.d`:

```caddyfile
import /etc/caddy/conf.d/*.caddy
```

Validate and reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## Embeddable widget snippet

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

## Rollback procedure

1. Identify the previous Git commit:

```bash
cd /opt/sa-medassist-pilot
git log --oneline -5
```

2. Roll back application files:

```bash
git checkout <previous-commit>
npm install
npm run build
sudo rsync -a --delete client/dist/ /var/www/sa-medassist/
pm2 startOrReload ecosystem.config.cjs --only sa-medassist-api
```

3. If a database migration caused the issue, restore the latest verified PostgreSQL backup for `sa_medassist`.

4. Confirm TransitIQ is untouched:

```bash
pm2 list
sudo caddy validate --config /etc/caddy/Caddyfile
```
