# Nexoranode Admin Panel

Web admin for the Nexoranode VPN Telegram bot.

**Production URL:** https://manage.nexoranode.xyz:2053

## Server paths

| Project | Path on server |
|---------|----------------|
| Bot | `/opt/nexoranode-bot` |
| Panel | `/opt/nexoranode-panel` |

## Production deploy

See the production steps in the repo root or deploy notes from your team lead.
Both stacks must use the same `DOCKER_NETWORK` in their `.env` files.
