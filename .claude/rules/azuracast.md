---
paths:
  - "azuracast/**"
---

# azuracast

Paths below are relative to `azuracast/`.

- AzuraCast rewrites everything under `stations/*/config/` (Liquidsoap, Icecast, nginx): a hand edit
  there is lost at the next change made from the interface. Go through the UI, and read the
  `*.backup.json` files as snapshots, not inputs.
- A `docker-compose.yml` change is tested with `docker compose config` before `up -d`, and committed
  with its reason.
- A clean `git status` does not mean the station is backed up: `RUNBOOK.md`.
