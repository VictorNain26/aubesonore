#!/usr/bin/env bash
# The preview of a branch, on the production box, beside production: compose.yaml with
# compose.preview.yaml, under the project aubesonore-preview, built from a worktree of the
# branch, with its own database and the real Musilogy. Reachable on the box's loopback only,
# through an SSH tunnel. README « Aperçu d'une branche ».
#
#   scripts/preview.sh up <branch>   build and start <branch> (origin's); an empty database
#                                    first gets its schema and test listener (dev-init)
#   scripts/preview.sh musilogy      load musilogy's current delivery into the preview's database
#   scripts/preview.sh down          stop the preview, keeping its database
#   scripts/preview.sh destroy       stop it and delete its database
#
# Never touches production: its own project, containers, ports, image tags, journal tags and
# volumes; the worktree is not ~/aubesonore, which deploy.sh needs clean.
set -euo pipefail
# uv, for the Musilogy load, lives here on the box.
export PATH="$HOME/.local/bin:$PATH"

PROD="${PROD_CHECKOUT:-$HOME/aubesonore}"
ROOT="${PREVIEW_ROOT:-$HOME/aubesonore-preview}"
SITE="$ROOT/site"
PROJECT=aubesonore-preview
PORT=3012
DB_PORT=5434

if [ "$(realpath -m "$ROOT")" = "$(realpath -m "$PROD")" ]; then
  echo "the preview's worktree cannot be production's checkout ($PROD)" >&2
  exit 1
fi

compose() {
  docker compose -p "$PROJECT" --project-directory "$SITE" \
    -f "$SITE/compose.yaml" -f "$SITE/compose.preview.yaml" "$@"
}

psql_preview() {
  compose exec -T postgres psql -U aubesonore -d aubesonore -At -c "$1"
}

# The preview's settings, rewritten at each `up` so a new setting reaches an older preview;
# its secrets, drawn once, are kept. COMPOSE_PROJECT_NAME and COMPOSE_FILE make a bare
# `docker compose` run in this folder the preview's, never production's.
write_env() {
  local env="$SITE/.env"
  secret() {
    local found
    found="$( [ -f "$env" ] && sed -n "s/^$1=//p" "$env" || true)"
    if [ -n "$found" ]; then echo "$found"; else openssl rand -hex "$2"; fi
  }
  local pg auth listener
  pg="$(secret POSTGRES_PASSWORD 24)"
  auth="$(secret BETTER_AUTH_SECRET 32)"
  listener="$(secret DEV_USER_PASSWORD 12)"
  (
    umask 077
    cat >"$env.next" <<EOF
# The preview's settings (scripts/preview.sh, rewritten at each up): no production secret, no
# listener's data, no mail, no recording of the antenna.
COMPOSE_PROJECT_NAME=$PROJECT
COMPOSE_FILE=compose.yaml:compose.preview.yaml
NODE_ENV=production
POSTGRES_PASSWORD=$pg
BETTER_AUTH_SECRET=$auth
BETTER_AUTH_URL=http://localhost:$PORT
FRONTEND_BASE_URL=http://localhost:$PORT
ALLOWED_ORIGINS=http://localhost:$PORT
COOKIE_DOMAIN=
DISABLE_EMAILS=true
RECORD_ANTENNA=false
DEV_USER_EMAIL=preview@aubesonore.test
DEV_USER_PASSWORD=$listener
DEV_USER_NAME=Aperçu
EOF
    mv "$env.next" "$env"
  )
}

# A database migrated by a later branch has lost what an earlier one reads (a dropped
# column): the preview refuses rather than serve that branch errors.
check_schema() {
  local branch="$1" name
  for name in $(psql_preview "SELECT name FROM __app_migrations" 2>/dev/null || true); do
    if [ ! -f "$SITE/apps/backend/drizzle/$name.sql" ]; then
      echo "the preview's database has the migration $name, which $branch does not know:" >&2
      echo "scripts/preview.sh destroy, then up $branch and musilogy" >&2
      exit 1
    fi
  done
}

up() {
  local branch="${1:?usage: preview.sh up <branch>}"
  if [ ! -d "$ROOT" ]; then
    git -C "$PROD" fetch -q origin
    git -C "$PROD" worktree add -q --detach "$ROOT" origin/master
  fi
  git -C "$ROOT" fetch -q origin
  git -C "$ROOT" checkout -q --detach "origin/$branch"
  write_env
  "$SITE/scripts/make-certs.sh" >/dev/null
  compose up -d --wait postgres
  check_schema "$branch"
  compose build backend frontend renderer
  if [ "$(psql_preview "SELECT to_regclass('public.artist') IS NOT NULL")" != t ]; then
    # An empty database: the schema from schema.ts and the test listener, as on a workstation.
    compose --profile dev run --rm dev-init
  fi
  compose up -d --wait postgres backend frontend renderer
  echo "preview of $branch at $(git -C "$ROOT" rev-parse --short HEAD)"
  echo "from the workstation: ssh -N -L $PORT:127.0.0.1:$PORT victormoi@victorserv,"
  echo "then http://localhost:$PORT (test listener: DEV_USER_* in $SITE/.env)"
  if [ "$(psql_preview "SELECT to_regclass('musilogy.artists') IS NOT NULL")" != t ]; then
    echo "no Musilogy yet: scripts/preview.sh musilogy"
  fi
}

musilogy() {
  local password
  password="$(sed -n 's/^POSTGRES_PASSWORD=//p' "$SITE/.env")"
  cd "$ROOT/musilogy"
  [ -e data ] || ln -s "$HOME/musilogy-data" data
  uv sync --locked -q
  # The scope and its ceiling are production's load (.claude/rules/musilogy.md).
  PGPASSWORD="$password" PGHOST=localhost PGPORT="$DB_PORT" PGUSER=aubesonore \
    PGDATABASE=aubesonore PGSSLMODE=verify-full PGSSLROOTCERT="$SITE/certs/ca.crt" \
    systemd-run --user --scope -p MemoryHigh=3G -p MemoryMax=3584M -p MemorySwapMax=0 \
    nice -n 10 uv run musilogy load
}

case "${1:-}" in
  up) up "${2:-}" ;;
  musilogy) musilogy ;;
  down) compose down ;;
  destroy) compose down --volumes ;;
  *)
    echo "usage: preview.sh up <branch> | musilogy | down | destroy" >&2
    exit 2
    ;;
esac
