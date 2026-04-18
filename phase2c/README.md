# Kaseki Phase 2C — Deploy 1a

The spaces foundation. Replaces hardcoded Home/Work/Inbox with user-defined spaces,
each with its own name, icon, colour, and preset.

## What this deploy includes

**Backend**
- `server/db.js` — new schema with `spaces` table, `space_id` foreign keys on all
  section-scoped tables, fresh-start migration that drops old data
- `server/routes.js` — full rewrite; every `?section=` endpoint replaced by `?space_id=`,
  new space CRUD endpoints, onboarding endpoint
- `server/onboarding-presets.js` — the 8 preset definitions (Personal, Legal, Medical,
  Engineering, Teaching, Freelance, Breeding, Custom)

**Frontend**
- New: `OnboardingWizard.js` (6-screen forced first-run wizard)
- New: `SettingsPage.js` (spaces CRUD + danger zone)
- New: `HoldingScreen.js` (temporary post-onboarding landing page)
- New: `CreateSpaceModal.js`, `SpaceIcon.js`, `IconPicker.js`, `ColorPicker.js`
- Rewrite: `App.js` (onboarding gate) and `api.js` (space-based methods)
- New: `phase2c.css` (appended to `index.css` with idempotent marker)

## What is deliberately NOT in this deploy

- Dashboard, LandingPage, GlobalSearch, QuickCapture: these will be rebuilt in
  Deploy 1b on top of the new space-based API
- Custom field schemas per preset: Deploy 2
- Linked-record, formula fields, cross-space toggle UI: Deploy 3

## Destructive warning

This deploy **permanently wipes** all existing Kaseki data (tasks, todos, events,
notes, tags, saved views, templates, activity log, uploaded files). User accounts
and preferences (theme, pomodoro settings) are preserved.

This is expected behaviour and was explicitly agreed before the build.

## How to deploy

On your Proxmox host:

```
# 1. Take a snapshot (so you can roll back if anything breaks)
#    Proxmox web UI -> CT 102 -> Snapshots -> Take Snapshot -> name: pre-phase2c

# 2. Run the deploy script
bash <(curl -sSL https://raw.githubusercontent.com/draftcoreservices-svg/kaseki-deploy/main/phase2c/deploy.sh)
```

## If it breaks

```
pct rollback 102 pre-phase2c
```

This returns CT 102 to the pre-deploy state in a few seconds. Paste the deploy
output so we can diagnose before retrying.
