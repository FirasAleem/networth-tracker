#!/usr/bin/env bash
# Daily local backup of the live SQLite DB onto the separate media disk.
# Run by networth-backup.timer (systemd, daily) — see "Automatic local backups"
# in the README. Keeps the newest 14 integrity-checked copies. The off-site
# GitHub snapshot is still the manual backup.sh (it needs the forwarded SSH key).
#
# Needs BACKUP_DIR and BACKUP_MOUNT (absolute) in the environment, plus GNU
# realpath, util-linux mountpoint and sqlite3. It refuses to run unless
# BACKUP_MOUNT is a real mountpoint, so a missing media disk can't fill the
# root disk. The app replaces its DB by atomic rename, so a plain cp always
# reads one complete version.
set -euo pipefail
cd "$(dirname "$0")"
umask 077

die() { echo "backup failed: $*" >&2; exit 1; }

[[ "${BACKUP_DIR:-}" == /* && "${BACKUP_MOUNT:-}" == /* ]] || die "BACKUP_DIR and BACKUP_MOUNT must be set to absolute paths"
dir=$(realpath -m -- "$BACKUP_DIR")
mnt=$(realpath -m -- "$BACKUP_MOUNT")
[[ "$mnt" != / ]] || die "BACKUP_MOUNT must not be /"
[[ "$dir" == "$mnt"/* ]] || die "BACKUP_DIR must be strictly below BACKUP_MOUNT"
mountpoint -q "$mnt" || die "$mnt is not a mountpoint (media disk missing?)"

src=data/networth.db
[[ -f "$src" ]] || die "$src not found"

mkdir -p "$dir"
chmod 700 "$dir"

# Copy to a hidden partial file first; only a verified copy gets its final name.
tmp="$dir/.partial-$$"
trap 'rm -f "$tmp"' EXIT
cp "$src" "$tmp"
[[ "$(sqlite3 -readonly "$tmp" 'PRAGMA integrity_check')" == ok ]] || die "integrity check failed on the copy"

out="$dir/networth-$(date +%F-%H%M%S).db"
[[ ! -e "$out" ]] || die "$out already exists"
mv -- "$tmp" "$out"

# Keep the newest 14 (names sort chronologically); never touch anything else.
printf '%s\n' "$dir"/networth-*.db \
  | grep -E '/networth-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}\.db$' \
  | sort -r | tail -n +15 \
  | while IFS= read -r old; do rm -f -- "$old"; done

echo "backup -> $out"
