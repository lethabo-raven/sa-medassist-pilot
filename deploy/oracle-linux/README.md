# Oracle Linux Deployment

These notes target Oracle Linux 8 or 9. For the shared VM that already hosts TransitIQ, prefer the root `deployment.md` file. It keeps SA MedAssist on port `4100`, frontend assets in `/var/www/sa-medassist`, and PM2 process `sa-medassist-api`.

## Packages

```bash
sudo dnf update -y
sudo dnf install -y git nginx postgresql-server postgresql-contrib
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
```

Install Ollama from the official Linux installer, then pull the configured models:

```bash
ollama pull llama3.1
ollama pull nomic-embed-text
```

## PostgreSQL and pgvector

Use the packaged PostgreSQL if you have a `pgvector` package available for your repository, or run PostgreSQL through Docker/Podman with the `pgvector/pgvector:pg16` image.

```bash
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
createdb sa_medassist
```

Then run:

```bash
npm install
npm run db:migrate
npm run build
pm2 startOrReload ecosystem.config.cjs --only sa-medassist-api
pm2 save
```

## Nginx

Copy `nginx.conf` into `/etc/nginx/conf.d/sa-medassist.conf`, adjust `server_name`, then:

```bash
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

## SELinux and firewall

If SELinux blocks the reverse proxy:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

Open HTTP or HTTPS as needed:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```
