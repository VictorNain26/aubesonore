#!/usr/bin/env bash
# Loads the small Musilogy into the local stack's database: musilogy's pipeline run on its
# versioned fixtures (`musilogy load --sample`), with the production schema and code path on a
# few hundred artists. Replaces whatever Musilogy that database held.
#
# Usage: scripts/musilogy-sample.sh   (the local stack's Postgres running, `pnpm stack`)
set -euo pipefail
cd "$(dirname "$0")/.."

# The credentials stay in .env; only the keys libpq needs are read, never printed.
env_value() { sed -n "s/^$1=//p" .env; }

# On the server, the port below and .env are production's: only a workstation's .env
# (.env.example) lets the sample replace a Musilogy.
if [ ! -f .env ] || [ "$(env_value NODE_ENV)" != development ]; then
  echo "refusing: .env is not a workstation's (NODE_ENV=development, from .env.example)" >&2
  exit 1
fi

# Postgres is published on 127.0.0.1:5433 and pg_hba.conf requires TLS; the certificate
# covers localhost (scripts/make-certs.sh). The load signs in as the `musilogy` role, which owns
# its schema and holds no right over the site's tables (compose.yaml, db-roles-init).
PGHOST=localhost PGPORT=5433 \
  PGUSER=musilogy PGPASSWORD="$(env_value MUSILOGY_DB_PASSWORD)" \
  PGDATABASE="$(env_value POSTGRES_DB)" \
  PGSSLMODE=verify-full PGSSLROOTCERT="$PWD/certs/ca.crt" \
  uv run --project ../musilogy --locked musilogy load --sample
