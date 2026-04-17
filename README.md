# Kaseki Phase 1 deploy

This repo contains the Phase 1 "7 quick wins" for Kaseki:

1. Toast + Undo notifications (5s)
2. Drag-to-reorder sidebar tasks
3. Tags/labels (separate per section)
4. Bulk actions on tasks
5. Favourites / pinned section divider
6. Activity feed on landing page
7. CSV import/export

## How to deploy

On the Proxmox host, run:

```
bash <(curl -sSL https://raw.githubusercontent.com/draftcoreservices-svg/kaseki-deploy/main/deploy.sh)
```

That single command does everything: clones, backs up existing files, pushes the new ones, rebuilds the frontend, restarts the container.
