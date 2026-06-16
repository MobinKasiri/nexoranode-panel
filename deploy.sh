#!/bin/bash
# Optional helper — same as: docker compose up -d --build
set -euo pipefail
cd "$(dirname "$0")"
docker compose --env-file .env up -d --build
