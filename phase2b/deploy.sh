#!/bin/bash
# Kaseki Phase 2B (part 1) deployment.
# Ships: global search, natural date parser, quick capture (Inbox section),
#        keyboard shortcuts, shortcut help. Saved views backend is ready
#        but frontend integration is deferred to part 2.
# Run this ON THE PROXMOX HOST.
set -e

echo "=== Kaseki Phase 2B (part 1) Deploy ==="
echo ""
echo "[1/8] Cloning code from GitHub..."
rm -rf /tmp/kaseki-p2b-deploy
git clone --depth 1 https://github.com/draftcoreservices-svg/kaseki-deploy.git /tmp/kaseki-p2b-deploy

echo ""
echo "[2/8] Backing up current source files..."
pct exec 102 -- bash -c '
  mkdir -p /opt/kaseki/backups/phase2b-pre
  cp /opt/kaseki/src/server/db.js       /opt/kaseki/backups/phase2b-pre/db.js       2>/dev/null || true
  cp /opt/kaseki/src/server/routes.js   /opt/kaseki/backups/phase2b-pre/routes.js   2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/App.js         /opt/kaseki/backups/phase2b-pre/App.js         2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/api.js         /opt/kaseki/backups/phase2b-pre/api.js         2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/index.css      /opt/kaseki/backups/phase2b-pre/index.css      2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/pages/LandingPage.js  /opt/kaseki/backups/phase2b-pre/LandingPage.js  2>/dev/null || true
  echo "Backed up to /opt/kaseki/backups/phase2b-pre/"
'

echo ""
echo "[3/8] Ensuring required directories exist in the container..."
pct exec 102 -- mkdir -p /opt/kaseki/src/client-src/src/components /opt/kaseki/src/client-src/src/lib

echo ""
echo "[4/8] Pushing new files into the container..."
pct push 102 /tmp/kaseki-p2b-deploy/phase2b/server/db.js                  /opt/kaseki/src/server/db.js
pct push 102 /tmp/kaseki-p2b-deploy/phase2b/server/routes.js              /opt/kaseki/src/server/routes.js
pct push 102 /tmp/kaseki-p2b-deploy/phase2b/src/App.js                    /opt/kaseki/src/client-src/src/App.js
pct push 102 /tmp/kaseki-p2b-deploy/phase2b/src/api.js                    /opt/kaseki/src/client-src/src/api.js
pct push 102 /tmp/kaseki-p2b-deploy/phase2b/src/pages/LandingPage.js      /opt/kaseki/src/client-src/src/pages/LandingPage.js
pct push 102 /tmp/kaseki-p2b-deploy/phase2b/src/components/GlobalSearch.js   /opt/kaseki/src/client-src/src/components/GlobalSearch.js
pct push 102 /tmp/kaseki-p2b-deploy/phase2b/src/components/QuickCapture.js   /opt/kaseki/src/client-src/src/components/QuickCapture.js
pct push 102 /tmp/kaseki-p2b-deploy/phase2b/src/components/ShortcutHelp.js   /opt/kaseki/src/client-src/src/components/ShortcutHelp.js
pct push 102 /tmp/kaseki-p2b-deploy/phase2b/src/lib/naturalDate.js         /opt/kaseki/src/client-src/src/lib/naturalDate.js
echo "Pushed all source files."

echo ""
echo "[5/8] Appending Phase 2B CSS to index.css..."
MARKER_START="/* === Phase 2B CSS additions === */"
MARKER_END="/* === Phase 2B CSS additions marker end === */"
pct exec 102 -- bash -c "
  if grep -q 'Phase 2B CSS additions marker end' /opt/kaseki/src/client-src/src/index.css 2>/dev/null; then
    echo 'Phase 2B CSS already appended. Skipping.'
  else
    echo '' >> /opt/kaseki/src/client-src/src/index.css
    echo '$MARKER_START' >> /opt/kaseki/src/client-src/src/index.css
  fi
"
pct push 102 /tmp/kaseki-p2b-deploy/phase2b/src/phase2b.css /tmp/phase2b.css
pct exec 102 -- bash -c "
  if ! grep -q 'Phase 2B CSS additions marker end' /opt/kaseki/src/client-src/src/index.css 2>/dev/null; then
    cat /tmp/phase2b.css >> /opt/kaseki/src/client-src/src/index.css
    echo '$MARKER_END' >> /opt/kaseki/src/client-src/src/index.css
    echo 'CSS appended.'
  fi
  rm -f /tmp/phase2b.css
"

echo ""
echo "[6/8] Building the React frontend (1-3 minutes)..."
pct exec 102 -- bash -c '
  cd /opt/kaseki/src/client-src
  docker run --rm -v /opt/kaseki/src/client-src:/app -w /app node:20-slim sh -c "npx --yes react-scripts build" 2>&1 | tail -30
'

# Verify the build actually produced a build/ directory with an index.html
pct exec 102 -- bash -c '
  if [ ! -f /opt/kaseki/src/client-src/build/index.html ]; then
    echo ""
    echo "!!! BUILD FAILED - no index.html in build output !!!"
    echo "Not touching the deployed build. Your site is still running the previous version."
    exit 1
  fi
'

echo ""
echo "[7/8] Copying build output into the serving directory..."
pct exec 102 -- bash -c '
  rm -rf /opt/kaseki/src/client/build
  cp -r /opt/kaseki/src/client-src/build /opt/kaseki/src/client/build
  echo "Build copied."
'

echo ""
echo "[8/8] Restarting Kaseki Docker containers..."
pct exec 102 -- bash -c '
  cd /opt/kaseki/src
  docker compose up -d --build 2>&1 | tail -10
'

echo ""
echo "=== Deploy complete! ==="
echo ""
echo "New features to test at https://kaseki.draftcore.co.uk:"
echo "  - Press '/' or Ctrl+K anywhere: Global search across tasks/todos/events"
echo "  - Press Shift+N anywhere: Quick Capture to Inbox"
echo "      Try: 'Call mum tomorrow 3pm' - date/time auto-extracted"
echo "  - Press '?' anywhere: Shortcut cheatsheet"
echo "  - New 'Inbox' card on the landing page"
echo ""
echo "If anything is broken:"
echo "  - Roll back: pct rollback 102 pre-phase2b-p1"
echo "  - Or restore source files from /opt/kaseki/backups/phase2b-pre/ inside CT 102"
