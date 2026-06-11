#!/usr/bin/env bash
# Snapshot the live DB into the private networth-data repo (cloned into ./data).
# Run on the SERVER, during an SSH session with your agent forwarded — commit
# signing uses the forwarded key, so the agent must be present.
set -euo pipefail
cd "$(dirname "$0")/data"

[ -d .git ] || { echo "data/ is not a git repo — see Sync & deploy in README"; exit 1; }

git add -A
if git diff --cached --quiet; then
  echo "no data changes to back up"
  exit 0
fi
git commit -q -m "Data backup $(date '+%Y-%m-%d %H:%M:%S')"
git push -q
echo "data backed up $(date '+%Y-%m-%d %H:%M:%S')"
