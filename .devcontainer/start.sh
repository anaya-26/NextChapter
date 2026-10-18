#!/usr/bin/env bash
# Starts the app whenever you open the codespace. The browser tab opens automatically.
set -euo pipefail
cd "$(dirname "$0")/.."
node .devcontainer/configure-env.mjs
echo
echo "Starting NextChapter… sign in with $(grep '^SEED_DEMO_EMAIL=' .env | cut -d'"' -f2) / $(grep '^SEED_DEMO_PASSWORD=' .env | cut -d'"' -f2)"
echo "(Press Ctrl+C to stop; run 'npm run dev' to start again.)"
exec npm run dev
