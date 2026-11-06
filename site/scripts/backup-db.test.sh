#!/usr/bin/env bash
# The guards of backup-db.sh, against a docker that answers as the database container would.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/bin"

# HEALTHY=yes lists the container among the healthy ones; RESTORE_OK=no makes pg_restore
# --list refuse the archive. Every call is logged.
cat >"$tmp/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "$*" >>"$DOCKER_LOG"
case "$*" in
  # The container runs: a filter on its health alone tells whether it is healthy.
  "ps "*)
    if [[ "$*" != *health=healthy* || "$HEALTHY" = yes ]]; then echo aubesonore-db; fi
    ;;
  "exec aubesonore-db pg_dump "*) echo "PGDMP archive" ;;
  "exec -i aubesonore-db pg_restore --list") cat >/dev/null; [ "$RESTORE_OK" = yes ] ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$tmp/bin/docker"

# The script as it is, but for its destination: a directory of the test's own.
sed "s#^DEST=.*#DEST=$tmp/dest#" "$here/backup-db.sh" >"$tmp/backup-db.sh"
if ! grep -qx "DEST=$tmp/dest" "$tmp/backup-db.sh"; then
  echo "FAIL backup-db.sh no longer sets DEST on a line of its own"
  exit 1
fi

failures=0
backup() { # <healthy> <restore ok>
  : >"$tmp/docker.log"
  status=0
  output=$(PATH="$tmp/bin:$PATH" DOCKER_LOG="$tmp/docker.log" \
    HEALTHY=$1 RESTORE_OK=$2 bash "$tmp/backup-db.sh" 2>&1) || status=$?
}
passed() { echo "ok   $1"; }
failed() {
  echo "FAIL $1: exit $status: $output"
  failures=$((failures + 1))
}
dumps() { find "$tmp/dest" -name 'aubesonore-*.dump' -type f | sort; }
mode() { stat -c %a "$1"; }

backup no yes
name="refuses to dump an unhealthy container"
if [ "$status" -ne 0 ] && [ -z "$(dumps)" ] && ! grep -q pg_dump "$tmp/docker.log"; then
  passed "$name"
else failed "$name"; fi

backup yes yes
name="writes a verified dump, unreadable to other users, without musilogy"
dump=$(dumps | tail -1)
if [ "$status" -eq 0 ] && [ -n "$dump" ] && [ "$(mode "$dump")" = 600 ] &&
  [ "$(mode "$tmp/dest")" = 700 ] &&
  grep -q -- "pg_dump -U aubesonore -Fc --exclude-schema=musilogy aubesonore" "$tmp/docker.log"; then
  passed "$name"
else failed "$name"; fi

rm -f "$tmp/dest"/*.dump
touch -d '2 days ago' "$tmp/dest/aubesonore-older.dump"
backup yes no
name="deletes a dump pg_restore cannot read, and keeps the older ones"
if [ "$status" -ne 0 ] && [ "$(dumps)" = "$tmp/dest/aubesonore-older.dump" ]; then
  passed "$name"
else failed "$name"; fi

rm -f "$tmp/dest"/*.dump
touch -d '16 days ago' "$tmp/dest/aubesonore-expired.dump"
touch -d '13 days ago' "$tmp/dest/aubesonore-recent.dump"
backup yes yes
name="keeps fourteen days of dumps"
if [ "$status" -eq 0 ] && [ ! -e "$tmp/dest/aubesonore-expired.dump" ] &&
  [ -e "$tmp/dest/aubesonore-recent.dump" ] && [ "$(dumps | wc -l)" -eq 2 ]; then
  passed "$name"
else failed "$name"; fi

exit "$failures"
