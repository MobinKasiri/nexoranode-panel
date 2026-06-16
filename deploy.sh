#!/bin/bash
# Deploy panel to Hetzner server
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexoranode-panel}"
BOT_DIR="${BOT_DIR:-/opt/nexoranode-bot}"

echo "==> Copying panel files to $PANEL_DIR"
sudo mkdir -p "$PANEL_DIR"
sudo rsync -av --delete ./ "$PANEL_DIR/" --exclude node_modules --exclude .next --exclude .env

echo "==> Ensure nexora_net exists"
docker network inspect nexora_net >/dev/null 2>&1 || docker network create nexora_net

echo "==> Building and starting containers"
cd "$PANEL_DIR"
export BOT_ROOT_HOST="$BOT_DIR"
export PLANS_DIR_HOST="${PLANS_DIR_HOST:-$BOT_DIR/app/data}"
docker compose --env-file .env up -d --build

echo "==> NOTE: Bot must mount the same plans.json file:"
echo "    $PLANS_DIR_HOST/plans.json -> /app/data/plans.json (rw)"
echo "    See bot deploy/docker-compose.prod.yml volumes section."

echo "==> Install nginx config"
sudo cp nginx/manage.conf /etc/nginx/sites-available/manage.nexoranode.xyz
sudo ln -sf /etc/nginx/sites-available/manage.nexoranode.xyz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

echo "==> Create admin (if needed)"
docker compose exec backend python scripts/create_admin.py --username admin --password "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}" --fullname "مدیر نکسورانود"

echo "Done. Visit https://manage.nexoranode.xyz/login"
