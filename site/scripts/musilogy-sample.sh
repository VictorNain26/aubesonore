#!/usr/bin/env bash
# Loads the small Musilogy into the local stack's database: musilogy's pipeline run on its
# versioned fixtures (`musilogy load --sample`), with the production schema and code path at
# 14 MB instead of 3.5 GB. Replaces whatever Musilogy that database held.
#
# Usage: scripts/musilogy-sample.sh   (the local stack's Postgres running, `pnpm stack`)
set -euo pipefail
cd "$(dirname "$0")/.."

# The credentials stay in .env; only the three keys libpq needs are read, never printed.
env_value() { sed -n "s/^$1=//p" .env; }

# Postgres is published on 127.0.0.1:5433 and pg_hba.conf requires TLS; the certificate
# covers localhost (scripts/make-certs.sh).
PGHOST=localhost PGPORT=5433 \
  PGUSER="$(env_value POSTGRES_USER)" PGPASSWORD="$(env_value POSTGRES_PASSWORD)" \
  PGDATABASE="$(env_value POSTGRES_DB)" \
  PGSSLMODE=verify-full PGSSLROOTCERT="$PWD/certs/ca.crt" \
  uv run --project ../musilogy --locked musilogy load --sample
