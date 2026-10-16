#!/usr/bin/env bash
# The guards of pull-public-data.sh and musilogy-sample.sh, which write the local stack's
# database: on the server, the container and the port they reach are production's. Against an
# ssh, a docker and a uv that only record what they are sent.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin" "$tmp/site/scripts"
# The server: its cluster's identifier when asked, else a dump.
cat >"$tmp/bin/ssh" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *pg_dump* ]]; then echo '-- the dump'; exit 0; fi
input=$(cat)
[[ "$input" == *pg_control_system* ]] && echo "$REMOTE_ID"
exit 0
EOF
# The local container: its cluster's identifier when asked; what it is sent is recorded.
cat >"$tmp/bin/docker" <<'EOF'
#!/usr/bin/env bash
input=$(cat)
if [[ "$input" == *pg_control_system* ]]; then echo "$LOCAL_ID"; else printf '%s\n' "$input" >>"$SENT"; fi
EOF
cat >"$tmp/bin/uv" <<'EOF'
#!/usr/bin/env bash
echo "$*" >>"$SENT"
EOF
chmod +x "$tmp/bin/"*
cp "$here/musilogy-sample.sh" "$tmp/site/scripts/"

failures=0
check() {
  if [ "$2" = "$3" ]; then echo "ok   $1"; else
    echo "FAIL $1: got $2, want $3"
    failures=$((failures + 1))
  fi
}

pull() {
  : >"$tmp/sent"
  status=0
  LOCAL_ID=$1 REMOTE_ID=$2 SENT="$tmp/sent" PATH="$tmp/bin:$PATH" \
    bash "$here/pull-public-data.sh" </dev/null >/dev/null 2>&1 || status=$?
  if grep -q 'DELETE FROM' "$tmp/sent"; then wrote=yes; else wrote=no; fi
}

pull 7001 7001
check 'pull refuses the cluster it reads' "$wrote/$status" no/1
pull '' 7001
check 'pull refuses an unknown local cluster' "$wrote/$status" no/1
pull 7002 7001
check 'pull copies into another cluster' "$wrote/$status" yes/0
# The local antenna watcher waits for the copy rather than slip a row between its statements.
first=$(grep -n -m1 -E 'LOCK TABLE|DELETE FROM' "$tmp/sent" | cut -d: -f2-)
check 'pull locks the tables before emptying them' "${first%% *}" LOCK

sample() {
  printf 'NODE_ENV=%s\nPOSTGRES_USER=u\nPOSTGRES_PASSWORD=p\nPOSTGRES_DB=d\n' "$1" >"$tmp/site/.env"
  : >"$tmp/sent"
  status=0
  SENT="$tmp/sent" PATH="$tmp/bin:$PATH" \
    bash "$tmp/site/scripts/musilogy-sample.sh" </dev/null >/dev/null 2>&1 || status=$?
  if grep -q 'load --sample' "$tmp/sent"; then loaded=yes; else loaded=no; fi
}

sample production
check 'sample refuses a production .env' "$loaded/$status" no/1
rm -f "$tmp/site/.env"
: >"$tmp/sent"
status=0
SENT="$tmp/sent" PATH="$tmp/bin:$PATH" bash "$tmp/site/scripts/musilogy-sample.sh" \
  </dev/null >/dev/null 2>&1 || status=$?
if grep -q 'load --sample' "$tmp/sent"; then loaded=yes; else loaded=no; fi
check 'sample refuses without a .env' "$loaded/$status" no/1
sample development
check 'sample loads a workstation' "$loaded/$status" yes/0

[ "$failures" -eq 0 ]
