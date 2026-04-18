#!/bin/bash
# Kaseki Phase 2C Deploy 1a — spaces foundation, onboarding, settings.
# Run this ON THE PROXMOX HOST.
#
# What this does:
#   1. Clones the latest deploy package from GitHub.
#   2. Backs up existing files from CT 102 to /opt/kaseki/backups/phase2c-pre/.
#   3. Pushes the new backend (db.js, routes.js, onboarding-presets.js) and
#      new frontend (App.js, pickers, wizard, settings, holding screen, api.js,
#      new CSS) into CT 102.
#   4. Appends phase2c.css to index.css with an idempotent marker.
#   5. Rebuilds the React frontend via a throwaway node:20-slim container.
#   6. Restarts Kaseki.
#
# If anything goes wrong:
#   pct rollback 102 pre-phase2c
#
# ────────────────────────────────────────────────────────────────────────

set -e

CT=102
REPO_RAW=https://raw.githubusercontent.com/draftcoreservices-svg/kaseki-deploy/main/phase2c
REPO_GIT=https://github.com/draftcoreservices-svg/kaseki-deploy.git
WORK=/tmp/kaseki-p2c-deploy

echo "═══ Kaseki Phase 2C Deploy 1a ═══"
echo ""

# ── 1. Fetch code ─────────────────────────────────────────────────────
echo "[1/7] Fetching Phase 2C code from GitHub…"
rm -rf "$WORK"
git clone --depth 1 "$REPO_GIT" "$WORK"
if [ ! -d "$WORK/phase2c" ]; then
  echo "ERROR: phase2c/ subfolder not found in clone"
  exit 1
fi

# ── 2. Backup current CT 102 files ────────────────────────────────────
echo ""
echo "[2/7] Backing up current files inside CT $CT…"
pct exec $CT -- bash -c "
  mkdir -p /opt/kaseki/backups/phase2c-pre
  # Backend
  cp /opt/kaseki/src/server/db.js                          /opt/kaseki/backups/phase2c-pre/db.js                2>/dev/null || true
  cp /opt/kaseki/src/server/routes.js                      /opt/kaseki/backups/phase2c-pre/routes.js            2>/dev/null || true
  # Frontend
  cp /opt/kaseki/src/client-src/src/App.js                 /opt/kaseki/backups/phase2c-pre/App.js               2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/api.js                 /opt/kaseki/backups/phase2c-pre/api.js               2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/index.css              /opt/kaseki/backups/phase2c-pre/index.css            2>/dev/null || true
  echo 'Backups written to /opt/kaseki/backups/phase2c-pre/'
"

# ── 3. Push new backend files ─────────────────────────────────────────
echo ""
echo "[3/7] Pushing backend files into CT $CT…"
pct push $CT "$WORK/phase2c/server/db.js"                   /opt/kaseki/src/server/db.js
pct push $CT "$WORK/phase2c/server/routes.js"               /opt/kaseki/src/server/routes.js
pct push $CT "$WORK/phase2c/server/onboarding-presets.js"   /opt/kaseki/src/server/onboarding-presets.js
echo "  Backend files pushed."

# ── 4. Push new frontend files ────────────────────────────────────────
echo ""
echo "[4/7] Pushing frontend files into CT $CT…"
pct exec $CT -- bash -c "mkdir -p /opt/kaseki/src/client-src/src/pages /opt/kaseki/src/client-src/src/components"

pct push $CT "$WORK/phase2c/src/App.js"                          /opt/kaseki/src/client-src/src/App.js
pct push $CT "$WORK/phase2c/src/api.js"                          /opt/kaseki/src/client-src/src/api.js

pct push $CT "$WORK/phase2c/src/components/SpaceIcon.js"         /opt/kaseki/src/client-src/src/components/SpaceIcon.js
pct push $CT "$WORK/phase2c/src/components/IconPicker.js"        /opt/kaseki/src/client-src/src/components/IconPicker.js
pct push $CT "$WORK/phase2c/src/components/ColorPicker.js"       /opt/kaseki/src/client-src/src/components/ColorPicker.js

pct push $CT "$WORK/phase2c/src/pages/OnboardingWizard.js"       /opt/kaseki/src/client-src/src/pages/OnboardingWizard.js
pct push $CT "$WORK/phase2c/src/pages/SettingsPage.js"           /opt/kaseki/src/client-src/src/pages/SettingsPage.js
pct push $CT "$WORK/phase2c/src/pages/CreateSpaceModal.js"       /opt/kaseki/src/client-src/src/pages/CreateSpaceModal.js
pct push $CT "$WORK/phase2c/src/pages/HoldingScreen.js"          /opt/kaseki/src/client-src/src/pages/HoldingScreen.js
echo "  Frontend files pushed."

# ── 5. Append phase2c.css to index.css (idempotent) ───────────────────
echo ""
echo "[5/7] Appending Phase 2C CSS to index.css…"
pct push $CT "$WORK/phase2c/src/phase2c.css" /tmp/phase2c.css
pct exec $CT -- bash -c "
  if grep -q 'Phase 2C CSS additions marker' /opt/kaseki/src/client-src/src/index.css 2>/dev/null; then
    echo '  Phase 2C CSS already present, skipping append.'
  else
    echo '' >> /opt/kaseki/src/client-src/src/index.css
    echo '/* === Phase 2C CSS additions marker === */' >> /opt/kaseki/src/client-src/src/index.css
    cat /tmp/phase2c.css >> /opt/kaseki/src/client-src/src/index.css
    echo '/* === Phase 2C CSS additions marker end === */' >> /opt/kaseki/src/client-src/src/index.css
    echo '  Phase 2C CSS appended.'
  fi
  rm -f /tmp/phase2c.css
"

# ── 6. Ensure lucide-react is in frontend deps, then rebuild React ────
echo ""
echo "[6/7] Ensuring lucide-react is installed, then rebuilding React frontend…"
pct exec $CT -- bash -c "
  cd /opt/kaseki/src/client-src
  if ! grep -q '\"lucide-react\"' package.json; then
    echo '  Adding lucide-react to package.json…'
    # Insert lucide-react into dependencies. We use node to do this safely.
    node -e \"
      const fs = require('fs');
      const p = JSON.parse(fs.readFileSync('package.json','utf8'));
      p.dependencies = p.dependencies || {};
      if (!p.dependencies['lucide-react']) p.dependencies['lucide-react'] = '^0.468.0';
      fs.writeFileSync('package.json', JSON.stringify(p, null, 2));
      console.log('  package.json updated');
    \" || echo '  Warning: package.json update via node failed; trying docker fallback'
  else
    echo '  lucide-react already in package.json'
  fi
"

pct exec $CT -- bash -c "
  cd /opt/kaseki/src/client-src
  echo '  Running npm install + react-scripts build in a throwaway node container…'
  docker run --rm -v /opt/kaseki/src/client-src:/app -w /app node:20-slim sh -c '
    npm install --omit=dev --no-audit --no-fund --loglevel=error 2>&1 | tail -10
    echo \"--- build ---\"
    npx --yes react-scripts build 2>&1 | tail -20
  '
"

# ── 7. Copy build output and restart ──────────────────────────────────
echo ""
echo "[7/7] Copying build output and restarting Kaseki…"
pct exec $CT -- bash -c "
  rm -rf /opt/kaseki/src/client/build
  cp -r /opt/kaseki/src/client-src/build /opt/kaseki/src/client/build
  echo '  Build output copied to /opt/kaseki/src/client/build'
  cd /opt/kaseki/src
  docker compose up -d --build 2>&1 | tail -10
"

echo ""
echo "═══ Deploy complete ═══"
echo ""
echo "What to do now:"
echo "  1. Open https://kaseki.draftcore.co.uk in your browser."
echo "  2. You should be prompted through the Onboarding Wizard (all Phase 1 data has been wiped)."
echo "  3. Pick presets, customise, reorder, pick a quick capture target, create spaces."
echo "  4. Land on the Holding Screen. Open Settings (gear icon) to test space management."
echo "  5. Verify: rename a space, change colour, hide/show, archive/restore, delete,"
echo "     switch quick-capture target, re-run onboarding, and the Danger Zone 'Delete everything'."
echo ""
echo "Do NOT try to open a space dashboard or use search/pomodoro/quick capture — those come"
echo "back in Deploy 1b, which rebuilds Dashboard, LandingPage, GlobalSearch, QuickCapture."
echo ""
echo "To roll back if anything is broken:"
echo "  pct rollback $CT pre-phase2c"
