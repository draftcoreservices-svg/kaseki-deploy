#!/bin/bash
# Kaseki DB repair for Phase 2B part 1.
# The previous Phase 2B migration corrupted foreign-key references in child tables
# (activity_log, subtasks, task_notes, task_files, task_tags, focus_sessions) so they
# point at a dropped intermediate table. The repair wipes the database and lets
# Kaseki recreate it cleanly with the correct schema including the 'inbox' section.
#
# This WILL delete all tasks, tags, todos, notes, events, and activity history.
# User accounts are preserved because they're re-created on next login (auth uses
# cookies + user table lookup). Actually no - users are in the same DB. They'll
# need to re-register after this wipe.
#
# Run this ON THE PROXMOX HOST.
set -e

echo "=== Kaseki DB Repair ==="
echo ""
echo "This will wipe the Kaseki database so the schema can be rebuilt cleanly."
echo "You will lose: all tasks, todos, events, notes, tags, activity, user accounts."
echo "You will NOT lose: uploaded files (still in /opt/kaseki/uploads/, orphaned but present)."
echo ""
read -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo ""
echo "[1/4] Stopping Kaseki container..."
pct exec 102 -- bash -c 'cd /opt/kaseki/src && docker compose stop kaseki 2>&1 | tail -3'

echo ""
echo "[2/4] Backing up old database..."
pct exec 102 -- bash -c '
  mkdir -p /opt/kaseki/backups
  TS=$(date +%Y%m%d-%H%M%S)
  for f in /opt/kaseki/data/kaseki.db /opt/kaseki/data/kaseki.db-wal /opt/kaseki/data/kaseki.db-shm; do
    if [ -f "$f" ]; then
      cp "$f" "/opt/kaseki/backups/$(basename $f).broken.$TS"
    fi
  done
  ls -la /opt/kaseki/backups/*.broken* 2>/dev/null | tail -5
  echo "Backups saved."
'

echo ""
echo "[3/4] Removing old database files so they will be recreated..."
pct exec 102 -- bash -c '
  rm -f /opt/kaseki/data/kaseki.db /opt/kaseki/data/kaseki.db-wal /opt/kaseki/data/kaseki.db-shm
  echo "Database files removed."
'

echo ""
echo "[4/4] Starting Kaseki container..."
pct exec 102 -- bash -c '
  cd /opt/kaseki/src
  docker compose up -d 2>&1 | tail -5
'

echo ""
echo "=== Repair complete ==="
echo ""
echo "The database has been wiped and will be recreated on first request."
echo "Visit https://kaseki.draftcore.co.uk and register a new account to test."
echo ""
echo "The old broken database files are preserved at /opt/kaseki/backups/kaseki.db.broken.*"
