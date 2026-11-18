---
name: musilogy-load
description: Load the published Musilogy delivery into the site's production database, from victorserv.
disable-model-invocation: true
---

# Load Musilogy into the site's database

From victorserv, at the root of the server worktree that holds the delivery (`musilogy/data` linked to
`~/musilogy-data`, `.claude/rules/musilogy.md`). What `musilogy load` checks and how it switches schema:
`musilogy/README.md`, « Installation, tests, exécution ».

From the workstation, the command goes through `victorserv admin '<command>'` (victormoi, root through
sudo, asks every time): it reads `~/aubesonore/site/.env`, which the restricted `victorserv claude`
account cannot read. A direct `ssh` to victorserv is denied.

The `aubesonore-db` port is published only on `127.0.0.1:5433`, and `pg_hba.conf` requires TLS; the
certificate covers `localhost`. The load signs in as the `musilogy` role, which owns its schemas and
holds no right over the site's tables (`site/scripts/db-roles.sql`), never as the site's superuser:

```bash
PGPASSWORD="$(grep '^MUSILOGY_DB_PASSWORD=' ~/aubesonore/site/.env | cut -d= -f2-)" \
PGHOST=localhost PGPORT=5433 PGUSER=musilogy PGDATABASE=aubesonore \
PGSSLMODE=verify-full PGSSLROOTCERT=~/aubesonore/site/certs/ca.crt \
systemd-run --user --scope -p MemoryHigh=3G -p MemoryMax=3584M -p MemorySwapMax=0 \
  nice -n 10 uv --directory musilogy run musilogy load
```

Report the counts the command prints. A failed load leaves the previous one in place.
