#!/bin/bash
# Kaseki Phase 2B (part 1) FIX deployment.
# Fixes two bugs from the initial part 1 deploy:
#   1. Dashboard showed "Home" in the header when navigating to Inbox
#   2. Quick Capture returned 500 because the DB migration left child-table FKs
#      pointing at a deleted intermediate table (tasks__old_migration).
#
# This deploy ships an improved db.js that:
#   - Detects databases wedged by the previous migration and repairs them
#   - Uses a safer rebuild pattern (CREATE __new, DROP original, RENAME __new)
#     with legacy_alter_table=ON so FK references in child tables stay correct.
#
# Run this ON THE PROXMOX HOST.
set -e

echo "=== Kaseki Phase 2B fix deploy ==="
echo ""
echo "[1/7] Cloning code from GitHub..."
rm -rf /tmp/kaseki-p2b-fix
git clone --depth 1 https://github.com/draftcoreservices-svg/kaseki-deploy.git /tmp/kaseki-p2b-fix

echo ""
echo "[2/7] Backing up current source files and the live database..."
pct exec 102 -- bash -c '
  mkdir -p /opt/kaseki/backups/phase2b-fix-pre
  cp /opt/kaseki/src/server/db.js                     /opt/kaseki/backups/phase2b-fix-pre/db.js                     2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/pages/Dashboard.js /opt/kaseki/backups/phase2b-fix-pre/Dashboard.js             2>/dev/null || true
  TS=$(date +%Y%m%d-%H%M%S)
  for f in /opt/kaseki/data/kaseki.db /opt/kaseki/data/kaseki.db-wal /opt/kaseki/data/kaseki.db-shm; do
    [ -f "$f" ] && cp "$f" "/opt/kaseki/backups/phase2b-fix-pre/$(basename $f).$TS" || true
  done
  echo "Backups saved to /opt/kaseki/backups/phase2b-fix-pre/"
'

echo ""
echo "[3/7] Pushing fixed files into the container..."
pct push 102 /tmp/kaseki-p2b-fix/phase2b-fix/server/db.js                  /opt/kaseki/src/server/db.js
pct push 102 /tmp/kaseki-p2b-fix/phase2b-fix/src/pages/Dashboard.js        /opt/kaseki/src/client-src/src/pages/Dashboard.js
echo "Pushed."

echo ""
echo "[4/7] Rebuilding the React frontend (1-3 minutes)..."
pct exec 102 -- bash -c '
  cd /opt/kaseki/src/client-src
  docker run --rm -v /opt/kaseki/src/client-src:/app -w /app node:20-slim sh -c "npx --yes react-scripts build" 2>&1 | tail -20
'

echo ""
echo "[5/7] Verifying the build actually produced a usable index.html..."
pct exec 102 -- bash -c '
  if [ ! -f /opt/kaseki/src/client-src/build/index.html ]; then
    echo "!!! BUILD FAILED - no index.html. Aborting. Previous version remains live."
    exit 1
  fi
  echo "Build verified."
'

echo ""
echo "[6/7] Copying build output to serving directory..."
pct exec 102 -- bash -c '
  rm -rf /opt/kaseki/src/client/build
  cp -r /opt/kaseki/src/client-src/build /opt/kaseki/src/client/build
  echo "Build copied."
'

echo ""
echo "[7/7] Restarting Kaseki Docker containers..."
pct exec 102 -- bash -c '
  cd /opt/kaseki/src
  docker compose up -d --build 2>&1 | tail -6
'

echo ""
echo "=== Deploy complete ==="
echo ""
echo "Check the logs to confirm the repair ran cleanly:"
echo "  pct exec 102 -- bash -c 'cd /opt/kaseki/src && docker compose logs kaseki 2>&1 | grep -E \"\\[repair\\]|\\[migration\\]\" | tail -20'"
echo ""
echo "Test at https://kaseki.draftcore.co.uk:"
echo "  - Click Inbox card \u2192 header should say 'Inbox' with \ud83d\udce5 icon"
echo "  - Press Shift+N \u2192 Quick Capture should now save successfully"
echo "  - Your existing Home/Work tasks should still be intact"
echo ""
echo "If anything is still broken, roll back to your pre-phase2b-p1 snapshot in Proxmox:"
echo "  pct rollback 102 pre-phase2b-p1"
