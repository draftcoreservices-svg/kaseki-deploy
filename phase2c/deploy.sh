#!/bin/bash
# Kaseki Phase 2C Deploy 1a — spaces foundation, onboarding, settings.
# Run this ON THE PROXMOX HOST.
#
# Key fixes in this version vs the first attempt:
#   - Aborts hard if the React build fails to compile (instead of copying a
#     broken build to production).
#   - Patches package.json inside the Docker node container, not on the CT
#     host (CT 102 does not have node installed).
#   - Verifies build/index.html exists and checks the build log for
#     "Failed to compile" / "Module not found" before promoting the build.
#
# Roll back anytime with:  pct rollback 102 pre-phase2c
# ────────────────────────────────────────────────────────────────────────

set -euo pipefail

CT=102
REPO_GIT=https://github.com/draftcoreservices-svg/kaseki-deploy.git
WORK=/tmp/kaseki-p2c-deploy
BUILD_LOG=/tmp/kaseki-p2c-build.log

fail() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  DEPLOY ABORTED: $1"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  echo "Your previous working version is unchanged on disk for the build"
  echo "output. If the backend files or CSS were already pushed before the"
  echo "failure, the cleanest way to undo is:"
  echo "  pct rollback $CT pre-phase2c"
  exit 1
}

echo "═══ Kaseki Phase 2C Deploy 1a ═══"
echo ""

# ── 1. Fetch ──────────────────────────────────────────────────────────
echo "[1/8] Fetching Phase 2C code from GitHub…"
rm -rf "$WORK"
git clone --depth 1 "$REPO_GIT" "$WORK" 2>&1 | tail -2 || fail "git clone failed"
[ -d "$WORK/phase2c" ] || fail "phase2c/ subfolder not in clone"

# ── 2. Backup ─────────────────────────────────────────────────────────
echo ""
echo "[2/8] Backing up current files inside CT $CT…"
pct exec $CT -- bash -c "
  mkdir -p /opt/kaseki/backups/phase2c-pre
  cp /opt/kaseki/src/server/db.js                          /opt/kaseki/backups/phase2c-pre/db.js                2>/dev/null || true
  cp /opt/kaseki/src/server/routes.js                      /opt/kaseki/backups/phase2c-pre/routes.js            2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/App.js                 /opt/kaseki/backups/phase2c-pre/App.js               2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/api.js                 /opt/kaseki/backups/phase2c-pre/api.js               2>/dev/null || true
  cp /opt/kaseki/src/client-src/src/index.css              /opt/kaseki/backups/phase2c-pre/index.css            2>/dev/null || true
  cp /opt/kaseki/src/client-src/package.json               /opt/kaseki/backups/phase2c-pre/package.json         2>/dev/null || true
  echo '  backups written'
" || fail "backup step failed"

# ── 3. Push backend ───────────────────────────────────────────────────
echo ""
echo "[3/8] Pushing backend files…"
pct push $CT "$WORK/phase2c/server/db.js"                   /opt/kaseki/src/server/db.js
pct push $CT "$WORK/phase2c/server/routes.js"               /opt/kaseki/src/server/routes.js
pct push $CT "$WORK/phase2c/server/onboarding-presets.js"   /opt/kaseki/src/server/onboarding-presets.js
echo "  done"

# ── 4. Push frontend ──────────────────────────────────────────────────
echo ""
echo "[4/8] Pushing frontend files…"
pct exec $CT -- bash -c "mkdir -p /opt/kaseki/src/client-src/src/pages /opt/kaseki/src/client-src/src/components"

pct push $CT "$WORK/phase2c/src/App.js"                          /opt/kaseki/src/client-src/src/App.js
pct push $CT "$WORK/phase2c/src/api.js"                          /opt/kaseki/src/client-src/src/api.js

pct push $CT "$WORK/phase2c/src/components/SpaceIcon.js"         /opt/kaseki/src/client-src/src/components/SpaceIcon.js
pct push $CT "$WORK/phase2c/src/components/IconPicker.js"        /opt/kaseki/src/client-src/src/components/IconPicker.js
pct push $CT "$WORK/phase2c/src/components/ColorPicker.js"       /opt/kaseki/src/client-src/src/components/ColorPicker.js

# ── Deploy 1b additions ───
pct push $CT "$WORK/phase2c/src/components/GlobalSearch.js"      /opt/kaseki/src/client-src/src/components/GlobalSearch.js
pct push $CT "$WORK/phase2c/src/components/QuickCapture.js"      /opt/kaseki/src/client-src/src/components/QuickCapture.js
pct push $CT "$WORK/phase2c/src/components/TodayPanel.js"        /opt/kaseki/src/client-src/src/components/TodayPanel.js
pct push $CT "$WORK/phase2c/src/components/ViewSwitcher.js"      /opt/kaseki/src/client-src/src/components/ViewSwitcher.js
pct push $CT "$WORK/phase2c/src/components/SavedViewsMenu.js"    /opt/kaseki/src/client-src/src/components/SavedViewsMenu.js
pct push $CT "$WORK/phase2c/src/components/KanbanView.js"        /opt/kaseki/src/client-src/src/components/KanbanView.js
pct push $CT "$WORK/phase2c/src/components/MatrixView.js"        /opt/kaseki/src/client-src/src/components/MatrixView.js
pct push $CT "$WORK/phase2c/src/components/CalendarView.js"      /opt/kaseki/src/client-src/src/components/CalendarView.js
pct push $CT "$WORK/phase2c/src/components/TemplateManager.js"   /opt/kaseki/src/client-src/src/components/TemplateManager.js
pct push $CT "$WORK/phase2c/src/components/TagManager.js"        /opt/kaseki/src/client-src/src/components/TagManager.js
pct push $CT "$WORK/phase2c/src/components/FieldManager.js"      /opt/kaseki/src/client-src/src/components/FieldManager.js
pct push $CT "$WORK/phase2c/src/components/CustomFieldInput.js"  /opt/kaseki/src/client-src/src/components/CustomFieldInput.js
pct push $CT "$WORK/phase2c/src/components/PomodoroPage.js"      /opt/kaseki/src/client-src/src/components/PomodoroPage.js
pct push $CT "$WORK/phase2c/src/components/ShortcutHelp.js"      /opt/kaseki/src/client-src/src/components/ShortcutHelp.js

# ── Phase D additions ───
pct exec $CT -- bash -c "mkdir -p /opt/kaseki/src/client-src/src/components/viewers"
pct push $CT "$WORK/phase2c/src/components/DocumentViewer.js"            /opt/kaseki/src/client-src/src/components/DocumentViewer.js
pct push $CT "$WORK/phase2c/src/components/viewers/PdfViewer.js"         /opt/kaseki/src/client-src/src/components/viewers/PdfViewer.js
pct push $CT "$WORK/phase2c/src/components/viewers/ImageViewer.js"       /opt/kaseki/src/client-src/src/components/viewers/ImageViewer.js
pct push $CT "$WORK/phase2c/src/components/viewers/TextViewer.js"        /opt/kaseki/src/client-src/src/components/viewers/TextViewer.js

pct push $CT "$WORK/phase2c/src/pages/OnboardingWizard.js"       /opt/kaseki/src/client-src/src/pages/OnboardingWizard.js
pct push $CT "$WORK/phase2c/src/pages/SettingsPage.js"           /opt/kaseki/src/client-src/src/pages/SettingsPage.js
pct push $CT "$WORK/phase2c/src/pages/CreateSpaceModal.js"       /opt/kaseki/src/client-src/src/pages/CreateSpaceModal.js
pct push $CT "$WORK/phase2c/src/pages/HoldingScreen.js"          /opt/kaseki/src/client-src/src/pages/HoldingScreen.js
pct push $CT "$WORK/phase2c/src/pages/Dashboard.js"              /opt/kaseki/src/client-src/src/pages/Dashboard.js
pct push $CT "$WORK/phase2c/src/pages/LandingPage.js"            /opt/kaseki/src/client-src/src/pages/LandingPage.js
echo "  done"

# ── 5. Append CSS ─────────────────────────────────────────────────────
echo ""
echo "[5/8] Appending Phase 2C CSS to index.css…"
pct push $CT "$WORK/phase2c/src/phase2c.css" /tmp/phase2c.css
pct exec $CT -- bash -c "
  # Strip any previous Phase 2C CSS block and re-append fresh.
  #
  # Implementation: once the start marker exists, everything below it is our
  # appended Phase 2C block (we always append at end of file). So we use a
  # sed range delete 'from first start marker through end of file'. This is
  # robust against repeated markers, missing end markers, nested appends, or
  # anything else that can happen if a prior run failed mid-write.
  if grep -q 'Phase 2C CSS additions marker' /opt/kaseki/src/client-src/src/index.css 2>/dev/null; then
    echo '  existing Phase 2C block found — stripping and replacing'
    sed '/\/\* === Phase 2C CSS additions marker === \*\//,\$d' /opt/kaseki/src/client-src/src/index.css > /tmp/index.css.stripped
    mv /tmp/index.css.stripped /opt/kaseki/src/client-src/src/index.css
    # Paranoia check — after strip there should be no markers left anywhere.
    if grep -q 'Phase 2C CSS additions marker' /opt/kaseki/src/client-src/src/index.css; then
      echo '  ERROR: marker strip failed, aborting CSS step'
      exit 2
    fi
  fi
  echo '' >> /opt/kaseki/src/client-src/src/index.css
  echo '/* === Phase 2C CSS additions marker === */' >> /opt/kaseki/src/client-src/src/index.css
  cat /tmp/phase2c.css >> /opt/kaseki/src/client-src/src/index.css
  echo '/* === Phase 2C CSS additions marker end === */' >> /opt/kaseki/src/client-src/src/index.css
  echo '  Phase 2C CSS block written freshly'
  rm -f /tmp/phase2c.css
" || fail "CSS append failed"

# ── 6. Build (package.json patch + npm install + react-scripts build) ─
echo ""
echo "[6/8] Patching package.json, installing deps, building React frontend…"
echo "      (this is the slow step, 2-4 min)"

rm -f "$BUILD_LOG"

# IMPORTANT: the build runs entirely inside a node:20-slim Docker container
# spun up on the Proxmox host (not inside CT 102). We mount CT 102's
# client-src directory into the container via its LXC-mapped host path so
# the build has real access to node/npm.
#
# However CT 102 already has docker running inside it for Kaseki itself, so
# running another Docker container *inside* CT 102 is how the original
# scripts were organised. We preserve that.

set +e
pct exec $CT -- bash -c "
  cd /opt/kaseki/src/client-src
  docker run --rm -v /opt/kaseki/src/client-src:/app -w /app node:20-slim bash -c '
    set -e
    # 6a. Patch package.json to include dependencies if missing.
    # Important: keep all JS strings as escaped double quotes. Single
    # quotes in JS would terminate the outer docker bash -c block early.
    node -e \"
      const fs = require(\\\"fs\\\");
      const p = JSON.parse(fs.readFileSync(\\\"package.json\\\",\\\"utf8\\\"));
      p.dependencies = p.dependencies || {};
      let changed = false;
      const need = {
        \\\"lucide-react\\\": \\\"^0.468.0\\\",
        \\\"pdfjs-dist\\\":   \\\"3.11.174\\\",
        \\\"marked\\\":       \\\"^12.0.0\\\",
      };
      for (const [name, ver] of Object.entries(need)) {
        if (!p.dependencies[name]) {
          p.dependencies[name] = ver;
          changed = true;
          console.log(\\\"[package.json] added \\\" + name + \\\"@\\\" + ver);
        } else {
          console.log(\\\"[package.json] \\\" + name + \\\" already present (\\\" + p.dependencies[name] + \\\")\\\");
        }
      }
      if (changed) fs.writeFileSync(\\\"package.json\\\", JSON.stringify(p, null, 2));
    \"
    echo \"[npm] installing…\"
    npm install --no-audit --no-fund --loglevel=error
    echo \"[react-scripts] building…\"
    npx --yes react-scripts build
  '
" 2>&1 | tee "$BUILD_LOG"
BUILD_RC=${PIPESTATUS[0]}
set -e

# ── 7. Verify the build ───────────────────────────────────────────────
echo ""
echo "[7/8] Verifying the build…"

if [ "$BUILD_RC" -ne 0 ]; then
  echo "  ✗ build container exited with non-zero status ($BUILD_RC)"
fi

if grep -qE "Failed to compile|Module not found|Cannot find module" "$BUILD_LOG"; then
  echo "  ✗ Build log contains compile errors. NOT copying to production."
  echo ""
  echo "  Error excerpt:"
  grep -nE "Failed to compile|Module not found|Cannot find module|Error:" "$BUILD_LOG" | head -15
  echo ""
  echo "  Full log: $BUILD_LOG"
  fail "React build failed"
fi

if [ "$BUILD_RC" -ne 0 ]; then
  fail "build exited non-zero but no compile errors detected — inspect $BUILD_LOG"
fi

# Confirm the build actually produced files.
pct exec $CT -- bash -c "
  if [ ! -f /opt/kaseki/src/client-src/build/index.html ]; then
    echo 'NO_INDEX'
    exit 3
  fi
  MAIN=\$(ls /opt/kaseki/src/client-src/build/static/js/main*.js 2>/dev/null | head -1 || true)
  if [ -z \"\$MAIN\" ]; then
    echo 'NO_MAIN_JS'
    exit 4
  fi
  echo '  ✓ build/index.html present'
  echo \"  ✓ main bundle: \$MAIN\"
" || fail "build output verification failed"

# ── 8. Promote and restart ────────────────────────────────────────────
echo ""
echo "[8/8] Copying verified build and restarting Kaseki…"
pct exec $CT -- bash -c "
  rm -rf /opt/kaseki/src/client/build
  cp -r /opt/kaseki/src/client-src/build /opt/kaseki/src/client/build
  echo '  build promoted'
  cd /opt/kaseki/src
  docker compose up -d --build 2>&1 | tail -8
" || fail "restart step failed"

echo ""
echo "Waiting 5s for container start, then health check…"
sleep 5
pct exec $CT -- sh -c "curl -sI http://localhost:3200 2>&1 | head -3 || true"

echo ""
echo "═══ Deploy complete ═══"
echo ""
echo "Open https://kaseki.draftcore.co.uk — the onboarding wizard should start."
echo "Full build log saved at $BUILD_LOG on the Proxmox host if you need it."
echo "Roll back anytime with:  pct rollback $CT pre-phase2c"
