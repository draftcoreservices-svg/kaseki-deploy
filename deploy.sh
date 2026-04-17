#!/bin/bash
# Kaseki Phase 1 deployment script.
# Run this ON THE PROXMOX HOST. It will do everything automatically.
set -e

echo "=== Kaseki Phase 1 Deploy ==="
echo ""
echo "[1/7] Cloning code from GitHub..."
rm -rf /tmp/kaseki-p1-deploy
git clone --depth 1 https://github.com/draftcoreservices-svg/kaseki-deploy.git /tmp/kaseki-p1-deploy

echo ""
echo "[2/7] Backing up current source files (in case we need to roll back)..."
pct exec 102 -- bash -c "
  mkdir -p /opt/kaseki/backups/phase1-pre
  cp /opt/kaseki/src/server/db.js       /opt/kaseki/backups/phase1-pre/db.js       2>/dev/null || true
  cp /opt/kaseki/src/server/routes.js   /opt/kaseki/backups/phase1-pre/routes.js   2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/App.js         /opt/kaseki/backups/phase1-pre/App.js         2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/api.js         /opt/kaseki/backups/phase1-pre/api.js         2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/index.css      /opt/kaseki/backups/phase1-pre/index.css      2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/pages/Dashboard.js    /opt/kaseki/backups/phase1-pre/Dashboard.js    2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/pages/LandingPage.js  /opt/kaseki/backups/phase1-pre/LandingPage.js  2>/dev/null || true
  echo 'Backed up to /opt/kaseki/backups/phase1-pre/'
"

echo ""
echo "[3/7] Pushing new files into the container..."
pct push 102 /tmp/kaseki-p1-deploy/server/db.js              /opt/kaseki/src/server/db.js
pct push 102 /tmp/kaseki-p1-deploy/server/routes.js          /opt/kaseki/src/server/routes.js
pct push 102 /tmp/kaseki-p1-deploy/src/App.js                /opt/kaseki/src/client-src/src/App.js
pct push 102 /tmp/kaseki-p1-deploy/src/api.js                /opt/kaseki/src/client-src/src/api.js
pct push 102 /tmp/kaseki-p1-deploy/src/components/ToastContext.js /opt/kaseki/src/client-src/src/components/ToastContext.js
pct push 102 /tmp/kaseki-p1-deploy/src/pages/Dashboard.js    /opt/kaseki/src/client-src/src/pages/Dashboard.js
pct push 102 /tmp/kaseki-p1-deploy/src/pages/LandingPage.js  /opt/kaseki/src/client-src/src/pages/LandingPage.js
echo "Pushed all source files."

echo ""
echo "[4/7] Appending Phase 1 CSS to index.css..."
# Make sure we don't double-append if script is re-run
pct exec 102 -- bash -c "
  if grep -q 'Phase 1 CSS additions' /opt/kaseki/src/client-src/src/index.css 2>/dev/null; then
    echo 'Phase 1 CSS already present. Skipping append.'
  else
    echo '' >> /opt/kaseki/src/client-src/src/index.css
    echo '/* === Phase 1 CSS additions === */' >> /opt/kaseki/src/client-src/src/index.css
  fi
"
pct push 102 /tmp/kaseki-p1-deploy/src/phase1.css /tmp/phase1.css
pct exec 102 -- bash -c "
  if ! grep -q 'Phase 1 CSS additions marker end' /opt/kaseki/src/client-src/src/index.css 2>/dev/null; then
    cat /tmp/phase1.css >> /opt/kaseki/src/client-src/src/index.css
    echo '/* === Phase 1 CSS additions marker end === */' >> /opt/kaseki/src/client-src/src/index.css
    echo 'CSS appended.'
  else
    echo 'CSS already appended earlier. Skipping.'
  fi
  rm -f /tmp/phase1.css
"

echo ""
echo "[5/7] Building the React frontend (this takes 1-3 minutes)..."
pct exec 102 -- bash -c "
  cd /opt/kaseki/src/client-src
  docker run --rm -v /opt/kaseki/src/client-src:/app -w /app node:20-slim sh -c 'npx --yes react-scripts build' 2>&1 | tail -20
"

echo ""
echo "[6/7] Copying build output into the serving directory..."
pct exec 102 -- bash -c "
  rm -rf /opt/kaseki/src/client/build
  cp -r /opt/kaseki/src/client-src/build /opt/kaseki/src/client/build
  echo 'Build copied.'
"

echo ""
echo "[7/7] Restarting Kaseki Docker containers..."
pct exec 102 -- bash -c "
  cd /opt/kaseki/src
  docker compose up -d --build 2>&1 | tail -10
"

echo ""
echo "=== Deploy complete! ==="
echo ""
echo "Visit https://kaseki.draftcore.co.uk and test all 7 Phase 1 features:"
echo "  1. Archive a task - see toast with Undo"
echo "  2. Drag tasks in sidebar to reorder"
echo "  3. Open a task -> Tags section"
echo "  4. Hover tasks -> click checkbox -> bulk action bar"
echo "  5. Pin a task - see 'Pinned' divider"
echo "  6. Go to landing page - see Recent Activity below Home/Work cards"
echo "  7. Click the three dots (dots) menu in the dashboard header - Export/Import CSV"
echo ""
echo "If anything is broken, to roll back run:"
echo "  pct exec 102 -- bash -c 'cp /opt/kaseki/backups/phase1-pre/* /opt/kaseki/src/...'"
echo "(or take a Proxmox snapshot BEFORE running this script, which is what I recommend)"
