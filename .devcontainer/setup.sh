#!/usr/bin/env bash
# Runs once when the dev container is created.
set -euo pipefail
cd "$(dirname "$0")/.."

node .devcontainer/configure-env.mjs
npm ci --no-audit --no-fund

echo "Waiting for the database…"
for i in $(seq 1 30); do
  if npx prisma migrate deploy >/dev/null 2>&1; then break; fi
  sleep 2
done
npx prisma migrate deploy
npm run db:seed

echo
echo "NextChapter is set up. Sign in with demo@example.com / $(grep '^SEED_DEMO_PASSWORD=' .env | cut -d'"' -f2)"
