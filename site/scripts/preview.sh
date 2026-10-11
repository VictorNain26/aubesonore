#!/usr/bin/env bash
# The preview of a branch, on the production box, beside production: compose.yaml with
# compose.preview.yaml, under the project aubesonore-preview, built from a worktree of the
# branch, with its own database and the real Musilogy. Reachable on the box's loopback only,
# through an SSH tunnel. README « Aperçu d'une branche ».
#
#   scripts/preview.sh up <branch>   build and start <branch> (origin's); the first run also
#                                    writes the preview's .env and certificates, then its schema
#                                    and test listener (dev-init)
#   scripts/preview.sh musilogy      load musilogy's current delivery into the preview's database
#   scripts/preview.sh down          stop the preview, keeping its database
#   scripts/preview.sh destroy       stop it and delete its database
#
# Never touches production: its own project, containers, ports, image tags and volumes; the
# worktree is not ~/aubesonore, which deploy.sh needs clean.
set -euo pipefail
# uv, for the Musilogy load, lives here on the box.
export PATH="$HOME/.local/bin:$PATH"

PROD="${PROD_CHECKOUT:-$HOME/aubesonore}"
ROOT="${PREVIEW_ROOT:-$HOME/aubesonore-preview}"
SITE="$ROOT/site"
PROJECT=aubesonore-preview
PORT=3012
DB_PORT=5434

compose() {
  docker compose -p "$PROJECT" --project-directory "$SITE" \
    -f "$SITE/compose.yaml" -f "$SITE/compose.preview.yaml" "$@"
}

# The preview's own settings: random secrets, the tunnel's origin, no mail, no production key.
write_env() {
  (
    umask 077
    cat >"$SITE/.env" <<EOF
# The preview's settings (scripts/preview.sh): no production secret, no listener's data.
NODE_ENV=production
POSTGRES_PASSWORD=$(openssl rand -hex 24)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
BETTER_AUTH_URL=http://localhost:$PORT
BACKEND_BASE_URL=http://localhost:$PORT
FRONTEND_BASE_URL=http://localhost:$PORT
ALLOWED_ORIGINS=http://localhost:$PORT
COOKIE_DOMAIN=
DISABLE_EMAILS=true
ENABLE_CRON=false
DEV_USER_EMAIL=preview@aubesonore.test
DEV_USER_PASSWORD=$(openssl rand -hex 12)
DEV_USER_NAME=Aperçu
EOF
  )
}

up() {
  local branch="${1:?usage: preview.sh up <branch>}"
  if [ ! -d "$ROOT" ]; then
    git -C "$PROD" fetch -q origin
    git -C "$PROD" worktree add -q --detach "$ROOT" origin/master
  fi
  git -C "$ROOT" fetch -q origin
  git -C "$ROOT" checkout -q --detach "origin/$branch"
  [ -f "$SITE/.env" ] || write_env
  "$SITE/scripts/make-certs.sh" >/dev/null
  local fresh=false
  docker volume inspect "${PROJECT}_postgres_data" >/dev/null 2>&1 || fresh=true
  compose build backend frontend renderer
  if $fresh; then
    # An empty database: the schema from schema.ts and the test listener, as on a workstation.
    compose --profile dev run --rm dev-init
  fi
  compose up -d --wait postgres backend frontend renderer
  echo "preview of $branch at $(git -C "$ROOT" rev-parse --short HEAD)"
  echo "from the workstation: ssh -N -L $PORT:127.0.0.1:$PORT victormoi@victorserv,"
  echo "then http://localhost:$PORT (test listener: DEV_USER_* in $SITE/.env)"
  $fresh && echo "empty Musilogy: scripts/preview.sh musilogy" || true
}

musilogy() {
  local password
  password="$(sed -n 's/^POSTGRES_PASSWORD=//p' "$SITE/.env")"
  cd "$ROOT/musilogy"
  [ -e data ] || ln -s "$HOME/musilogy-data" data
  uv sync --locked -q
  # The scope and its ceiling are production's load (musilogy/CLAUDE.md).
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
