#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-sa-medassist}"
APP_DIR="${APP_DIR:-/opt/sa-medassist-pilot}"
WEB_DIR="${WEB_DIR:-/var/www/sa-medassist}"
ENV_DIR="${ENV_DIR:-/etc/sa-medassist}"
DB_NAME="${DB_NAME:-sa_medassist}"
DB_USER="${DB_USER:-sa_medassist}"
DB_PASSWORD="${DB_PASSWORD:-change-me-before-production}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script with sudo on the Oracle Linux VM."
  exit 1
fi

dnf install -y git nginx postgresql postgresql-server postgresql-contrib postgresql-devel gcc make curl ca-certificates

curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs

NODE_MAJOR="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
if [[ "$NODE_MAJOR" != "22" ]]; then
  echo "Node.js 22 is required, but found $(node --version). Aborting."
  exit 1
fi
echo "Node.js $(node --version) is ready."

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /sbin/nologin "$APP_USER"
fi

mkdir -p "$APP_DIR" "$WEB_DIR" "$ENV_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$WEB_DIR"
chmod 750 "$ENV_DIR"

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

if [[ ! -f /var/lib/pgsql/data/postgresql.conf ]]; then
  postgresql-setup --initdb
fi
systemctl enable --now postgresql

if ! sudo -u postgres psql -d postgres -tc "SELECT 1 FROM pg_available_extensions WHERE name = 'vector'" | grep -q 1; then
  tmpdir="$(mktemp -d)"
  git clone --branch v0.8.0 --depth 1 https://github.com/pgvector/pgvector.git "$tmpdir/pgvector"
  make -C "$tmpdir/pgvector"
  make -C "$tmpdir/pgvector" install
  rm -rf "$tmpdir"
fi

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD'"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER"
sudo -u postgres psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector"
sudo -u postgres psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto"

sudo -u postgres psql -d "$DB_NAME" -tc "SELECT 1 FROM pg_extension WHERE extname = 'vector'" | grep -q 1 || {
  echo "PostgreSQL extension validation failed: vector is not installed in $DB_NAME."
  exit 1
}
sudo -u postgres psql -d "$DB_NAME" -tc "SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'" | grep -q 1 || {
  echo "PostgreSQL extension validation failed: pgcrypto is not installed in $DB_NAME."
  exit 1
}

if [[ ! -f "$ENV_DIR/sa-medassist.env" ]]; then
  cp deploy/oracle-linux/sa-medassist.env.example "$ENV_DIR/sa-medassist.env"
  chmod 640 "$ENV_DIR/sa-medassist.env"
  chown root:"$APP_USER" "$ENV_DIR/sa-medassist.env"
  echo "Edit $ENV_DIR/sa-medassist.env before starting PM2."
fi

cat >/etc/logrotate.d/sa-medassist <<'LOGROTATE'
/root/.pm2/logs/sa-medassist-api*.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
  copytruncate
}
LOGROTATE

setsebool -P httpd_can_network_connect 1 || true
firewall-cmd --permanent --add-service=http || true
firewall-cmd --permanent --add-service=https || true
firewall-cmd --reload || true

echo "Server base is ready. Deploy the repo to $APP_DIR, build the frontend into $WEB_DIR, then start PM2 with ecosystem.config.cjs."
