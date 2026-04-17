#!/bin/bash
# Kaseki Phase 2B part 2 deploy
# Adds: view switcher (list/board/matrix/calendar), pomodoro page,
# task templates, saved views UI, today panel on landing,
# dashboard keyboard shortcuts (n/e/d/p/a/j/k/Enter).
set -e

CT=102
REPO_DIR="/tmp/kaseki-p2b2-deploy"

echo "=== Kaseki Phase 2B part 2 Deploy ==="

echo "[1/8] Cloning code from GitHub..."
rm -rf "$REPO_DIR"
git clone --depth=1 https://github.com/draftcoreservices-svg/kaseki-deploy.git "$REPO_DIR"

echo "[2/8] Backing up current source files and the live database..."
pct exec $CT -- bash -c "
  mkdir -p /opt/kaseki/backups/phase2b-p2-pre
  cp -f /opt/kaseki/src/server/routes.js                          /opt/kaseki/backups/phase2b-p2-pre/ 2>/dev/null || true
  cp -f /opt/kaseki/src/client-src/src/App.js                     /opt/kaseki/backups/phase2b-p2-pre/ 2>/dev/null || true
  cp -f /opt/kaseki/src/client-src/src/api.js                     /opt/kaseki/backups/phase2b-p2-pre/ 2>/dev/null || true
  cp -f /opt/kaseki/src/client-src/src/pages/Dashboard.js         /opt/kaseki/backups/phase2b-p2-pre/ 2>/dev/null || true
  cp -f /opt/kaseki/src/client-src/src/pages/LandingPage.js       /opt/kaseki/backups/phase2b-p2-pre/ 2>/dev/null || true
  cp -f /opt/kaseki/src/client-src/src/index.css                  /opt/kaseki/backups/phase2b-p2-pre/ 2>/dev/null || true
  cp -f /opt/kaseki/data/kaseki.db                                /opt/kaseki/backups/phase2b-p2-pre/kaseki.db.bak 2>/dev/null || true
"
echo "  Backups saved to /opt/kaseki/backups/phase2b-p2-pre/"

echo "[3/8] Ensuring components directory exists inside container..."
pct exec $CT -- mkdir -p /opt/kaseki/src/client-src/src/components

echo "[4/8] Pushing new and updated files into the container..."
# Backend
pct push $CT "$REPO_DIR/phase2b-part2/server/routes.js"                 /opt/kaseki/src/server/routes.js
# Frontend top-level
pct push $CT "$REPO_DIR/phase2b-part2/src/App.js"                       /opt/kaseki/src/client-src/src/App.js
pct push $CT "$REPO_DIR/phase2b-part2/src/api.js"                       /opt/kaseki/src/client-src/src/api.js
# Pages
pct push $CT "$REPO_DIR/phase2b-part2/src/pages/Dashboard.js"           /opt/kaseki/src/client-src/src/pages/Dashboard.js
pct push $CT "$REPO_DIR/phase2b-part2/src/pages/LandingPage.js"         /opt/kaseki/src/client-src/src/pages/LandingPage.js
# Components
pct push $CT "$REPO_DIR/phase2b-part2/src/components/TodayPanel.js"     /opt/kaseki/src/client-src/src/components/TodayPanel.js
pct push $CT "$REPO_DIR/phase2b-part2/src/components/KanbanView.js"     /opt/kaseki/src/client-src/src/components/KanbanView.js
pct push $CT "$REPO_DIR/phase2b-part2/src/components/MatrixView.js"     /opt/kaseki/src/client-src/src/components/MatrixView.js
pct push $CT "$REPO_DIR/phase2b-part2/src/components/CalendarView.js"   /opt/kaseki/src/client-src/src/components/CalendarView.js
pct push $CT "$REPO_DIR/phase2b-part2/src/components/PomodoroPage.js"   /opt/kaseki/src/client-src/src/components/PomodoroPage.js
pct push $CT "$REPO_DIR/phase2b-part2/src/components/TemplateManager.js" /opt/kaseki/src/client-src/src/components/TemplateManager.js
pct push $CT "$REPO_DIR/phase2b-part2/src/components/SavedViewsMenu.js" /opt/kaseki/src/client-src/src/components/SavedViewsMenu.js
pct push $CT "$REPO_DIR/phase2b-part2/src/components/ViewSwitcher.js"   /opt/kaseki/src/client-src/src/components/ViewSwitcher.js
echo "  Pushed."

echo "[5/8] Appending Phase 2B part 2 CSS to index.css..."
# Guard against double-append if the deploy is re-run
CSS_MARKER="Phase 2B part 2 - styles for views, pomodoro"
if pct exec $CT -- grep -q "$CSS_MARKER" /opt/kaseki/src/client-src/src/index.css 2>/dev/null; then
  echo "  Already appended, skipping."
else
  pct push $CT "$REPO_DIR/phase2b-part2/phase2b-p2.css" /tmp/phase2b-p2.css
  pct exec $CT -- bash -c "cat /tmp/phase2b-p2.css >> /opt/kaseki/src/client-src/src/index.css && rm /tmp/phase2b-p2.css"
  echo "  CSS appended."
fi

echo "[6/8] Building the React frontend (1-3 minutes)..."
pct exec $CT -- bash -c "cd /opt/kaseki/src/client-src && docker run --rm -e DISABLE_ESLINT_PLUGIN=true -e CI=false -v /opt/kaseki/src/client-src:/app -w /app node:20-slim sh -c 'npx --yes react-scripts build' 2>&1 | tail -30"

echo "[7/8] Verifying the build produced index.html..."
if pct exec $CT -- test -f /opt/kaseki/src/client-src/build/index.html; then
  echo "  Build verified."
  pct exec $CT -- bash -c "rm -rf /opt/kaseki/src/client/build && cp -r /opt/kaseki/src/client-src/build /opt/kaseki/src/client/build"
  echo "  Build copied to serving directory."
else
  echo "  !! BUILD FAILED - index.html was not produced. Aborting."
  echo "  !! The current running site is untouched. To roll back source files:"
  echo "     pct rollback $CT pre-phase2b-p2"
  exit 1
fi

echo "[8/8] Restarting Kaseki Docker containers..."
pct exec $CT -- bash -c "cd /opt/kaseki/src && docker compose up -d --build 2>&1 | tail -8"

echo ""
echo "=== Deploy complete! ==="
echo ""
echo "Test at https://kaseki.draftcore.co.uk:"
echo "  * Landing page - new 'Today' summary panel above Home/Work/Inbox cards"
echo "  * Landing page - click 'Focus' button (top right of Today panel) to open Pomodoro"
echo "  * Dashboard - View switcher in header (List / Board / Matrix / Calendar)"
echo "  * Dashboard - '+ New' now shows template picker (blank or from a saved template)"
echo "  * Dashboard - three-dots menu has new 'Templates' and 'Pomodoro' entries"
echo "  * Dashboard - 'Views' dropdown saves and applies filter combinations"
echo "  * Dashboard - keyboard shortcuts:"
echo "      n = new task   j/k = navigate   e/Enter = edit"
echo "      d = toggle done   p = pin/unpin   a = archive/restore"
echo ""
echo "Your existing tasks/todos/events/tags/saved-views are preserved."
echo ""
echo "If anything is broken:"
echo "  * Roll back:  pct rollback $CT pre-phase2b-p2"
echo "  * Or restore source files from /opt/kaseki/backups/phase2b-p2-pre/ inside CT $CT"
