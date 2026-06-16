# Nexoranode Admin Panel

Web admin panel for the Nexoranode VPN Telegram bot.

## Stack

- **Backend:** FastAPI (async) + shared bot models via `PYTHONPATH=/bot`
- **Frontend:** Next.js 14 + Tailwind + shadcn-style components
- **URL:** https://manage.nexoranode.xyz

## Local development

```bash
# 1. Copy env
cp .env.example .env

# 2. Point BOT_ROOT to bot codebase
export BOT_ROOT_HOST=/path/to/bot/3xui-shop

# 3. Start Postgres (or use bot's docker compose network)

# 4. Backend
cd backend && pip install -r requirements.txt
BOT_ROOT=../bot/3xui-shop PYTHONPATH=../bot/3xui-shop uvicorn panel.main:app --reload --port 8000

# 5. Frontend
cd frontend && npm install && npm run dev
```

## Production deploy

```bash
cp .env.example .env   # fill secrets
./deploy.sh
```

Requires:
- Bot running with `nexora_net` Docker network
- Bot code at `/opt/nexoranode-bot`
- Cloudflare DNS + origin cert at `/etc/ssl/nexora/`
- Host nginx config from `nginx/manage.conf`

## Create admin

```bash
docker compose exec backend python scripts/create_admin.py \
  --username admin --password "STRONG" --fullname "مدیر"
```
