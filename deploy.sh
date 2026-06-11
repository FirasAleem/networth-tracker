#!/usr/bin/env bash
# Poll-based auto-deploy. Run from cron on the server; it pulls origin/main
# and rebuilds the container only when there's a new commit. Your data/ and
# seed-data.js are gitignored/untracked, so git reset never touches them.
set -euo pipefail
cd "$(dirname "$0")"

git fetch --quiet origin main
before=$(git rev-parse HEAD)
after=$(git rev-parse origin/main)

if [ "$before" = "$after" ]; then
  exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] new commit $after — deploying"
git reset --hard origin/main
docker compose up -d --build
echo "[$(date '+%Y-%m-%d %H:%M:%S')] deployed $after"
