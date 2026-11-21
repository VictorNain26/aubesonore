#!/usr/bin/env bash
# The weekly-pass guard of deploy.sh, against a systemctl that reports each
# ActiveState a unit can be in.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir "$tmp/bin" "$tmp/repo"
# deploy.sh reads the unit's ActiveState with `systemctl show`.
cat >"$tmp/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
case " $* " in
  *" show "*) echo "$WEEKLY_STATE" ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$tmp/bin/systemctl"

failures=0
for state in activating active deactivating reloading inactive failed; do
  status=0
  output=$(WEEKLY_STATE=$state PATH="$tmp/bin:$PATH" REPO_DIR="$tmp/repo" \
    bash "$here/deploy.sh" 2>&1) || status=$?
  case "$state" in
    inactive | failed) want_defer=no ;;
    *) want_defer=yes ;;
  esac
  if [[ "$output" == *deferring* ]]; then deferred=yes; else deferred=no; fi
  if [ "$deferred" != "$want_defer" ] || { [ "$deferred" = yes ] && [ "$status" -ne 0 ]; }; then
    echo "FAIL $state: deferred=$deferred (want $want_defer), exit $status: $output"
    failures=$((failures + 1))
  else
    echo "ok   $state"
  fi
done

# A deploy that fails is rolled back, and its commit is not tried again until master moves.
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.test
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.test
r="$tmp/rollback"
mkdir -p "$r/bin"
git init -q --bare --initial-branch=master "$r/origin.git"
git init -q --initial-branch=master "$r/dev"
mkdir -p "$r/dev/site" "$r/dev/pipeline"
echo a >"$r/dev/site/app"
echo p >"$r/dev/pipeline/x"
git -C "$r/dev" add .
git -C "$r/dev" commit -qm A
git -C "$r/dev" remote add origin "$r/origin.git"
git -C "$r/dev" push -q origin master
git clone -q "$r/origin.git" "$r/repo"

push() {
  echo "$1" >"$r/dev/site/app"
  git -C "$r/dev" commit -qam "$1"
  git -C "$r/dev" push -q origin master
  git -C "$r/dev" rev-parse HEAD
}

# Starts and healthchecks fail while HEAD is $BAD, as $FAIL says; a pull fails when $PULL says so.
# Every call is logged with the image tag it ran under.
cat >"$r/bin/docker" <<'EOF2'
#!/usr/bin/env bash
echo "[${IMAGE_TAG:-}] $*" >>"$DOCKER_LOG"
bad() { [ "$(git -C "$REPO_DIR" rev-parse HEAD)" = "$BAD" ] && [ "$FAIL" = "$1" ]; }
case "$*" in
  "pull "*) [ "$PULL" != fail ] ;;
  "compose up"*) ! bad build ;;
  "compose ps -q") echo c1 ;;
  "inspect -f {{if"*) if bad health; then echo unhealthy; else echo healthy; fi ;;
  "inspect -f {{.Name}}"*) echo /aubesonore-backend ;;
  # The image a container runs, unless $NORUN says the site's containers are gone.
  "inspect -f {{.Image}}"*) [ "$NORUN" = 1 ] || echo "img-${*: -1}" ;;
  "image inspect"*) echo "${*: -1}" | sed 's/:sha-.*/@sha256:0000/' ;;
  "image ls"*) cat "$IMAGES" ;;
esac
EOF2
# The CI state of every commit ($CI), and the provenance check ($ATTEST).
cat >"$r/bin/gh" <<'EOF2'
#!/usr/bin/env bash
echo "gh $*" >>"$DOCKER_LOG"
case "$1 $2" in
  "api "*)
    suite() { echo "{\"app\":{\"slug\":\"github-actions\"},\"status\":\"$1\",\"conclusion\":$2}"; }
    run() { echo "{\"name\":\"$1\",\"status\":\"$2\",\"conclusion\":$3}"; }
    published() { for i in backend frontend renderer; do run "Publish images ($i)" completed "\"$1\""; done; }
    case "$* $CI" in
      *check-suites*" success" | *check-suites*" unpublished" | *check-suites*" skipped")
        suite completed '"success"'; suite completed '"success"' ;;
      *check-suites*" pending") suite completed '"success"'; suite queued null ;;
      *check-suites*" failure") suite in_progress null ;;
      *check-runs*" success") run "Build all" completed '"success"'; published success ;;
      # Every other job done, the images' not started yet.
      *check-runs*" unpublished") run "Build all" completed '"success"' ;;
      # A workflow_dispatch on master: the images' jobs skipped, nothing published.
      *check-runs*" skipped") run "Build all" completed '"success"'; published skipped ;;
      *check-runs*" pending") run "Build all" completed '"success"' ;;
      # A job failed while another still runs: nothing will make this commit deployable.
      *check-runs*" failure") run "Build all" completed '"failure"'; run Visual in_progress null ;;
    esac ;;
  # Fails for every image when $ATTEST=fail, or for the commit $ATTEST names.
  "attestation verify") [ "$ATTEST" != fail ] && [[ " $* " != *" --source-digest $ATTEST "* ]] ;;
esac
EOF2
cat >"$r/bin/systemctl" <<'EOF2'
#!/usr/bin/env bash
[[ " $* " == *" show "* ]] && echo inactive
exit 0
EOF2
printf '#!/usr/bin/env bash\nexit 0\n' >"$r/bin/uv"
# The backend's answer to the search: $SEARCH_BEFORE the first time in a run, before the start,
# then $SEARCH.
cat >"$r/bin/curl" <<'EOF2'
#!/usr/bin/env bash
echo "curl $*" >>"$DOCKER_LOG"
if [ -s "$SEARCHED" ]; then printf %s "$SEARCH"; else printf %s "$SEARCH_BEFORE"; fi
echo x >>"$SEARCHED"
EOF2
# The dump before migrations, which fails when $DUMP says so.
printf '#!/usr/bin/env bash\necho dump >>"$DOCKER_LOG"\n[ "$DUMP" != fail ]\n' >"$r/bin/backup-db"
chmod +x "$r/bin/docker" "$r/bin/gh" "$r/bin/systemctl" "$r/bin/uv" "$r/bin/backup-db" "$r/bin/curl"
echo token >"$r/gh-token"
: >"$r/images"

deploy() {
  status=0
  : >"$r/searched"
  output=$(SEARCHED="$r/searched" SEARCH_BEFORE="${SEARCH_BEFORE:-200}" PATH="$r/bin:$PATH" REPO_DIR="$r/repo" UV="$r/bin/uv" BACKUP_DB="$r/bin/backup-db" \
    GH_TOKEN_FILE="${TOKEN_FILE-$r/gh-token}" IMAGES="$r/images" HEALTH_TIMEOUT_S=0 \
    DOCKER_LOG="$r/docker.log" BAD="$BAD" FAIL="$FAIL" DUMP="${DUMP:-ok}" CI="${CI:-success}" \
    PULL="${PULL:-ok}" ATTEST="${ATTEST:-ok}" NORUN="${NORUN:-0}" SEARCH="${SEARCH:-200}" bash "$here/deploy.sh" 2>&1) || status=$?
}
passed() { echo "ok   $1"; }
failed() {
  echo "FAIL $1: exit $status: $output"
  failures=$((failures + 1))
}
head_is() { [ "$(git -C "$r/repo" rev-parse HEAD)" = "$1" ]; }
failed_is() { [ "$(git -C "$r/repo" config --get aubesonore.failedTarget || true)" = "$1" ]; }
logged() { grep -qF -- "$1" "$r/docker.log"; }

A=$(git -C "$r/repo" rev-parse HEAD)

# Nothing is promoted before every check of the commit has passed (GitHub's check runs).
BAD=none FAIL=none
: >"$r/docker.log"
P=$(push P)
CI=pending
deploy
name="a commit whose CI still runs waits, and the run succeeds"
if [ "$status" -eq 0 ] && head_is "$A" && [[ "$output" == *"waiting for CI"* ]] &&
  ! logged " pull --quiet"; then passed "$name"; else failed "$name"; fi

CI=unpublished
deploy
name="a commit whose images are not published yet waits"
if [ "$status" -eq 0 ] && head_is "$A" && [[ "$output" == *"waiting for CI"* ]] &&
  ! logged " pull --quiet"; then passed "$name"; else failed "$name"; fi

CI=skipped
deploy
name="a commit whose images were skipped, not published, waits"
if [ "$status" -eq 0 ] && head_is "$A" && [[ "$output" == *"waiting for CI"* ]] &&
  ! logged " pull --quiet"; then passed "$name"; else failed "$name"; fi

CI=failure
deploy
name="a commit whose CI failed is not deployed"
if [ "$status" -ne 0 ] && head_is "$A" && [[ "$output" == *"CI failed"* ]] &&
  ! logged " pull --quiet"; then passed "$name"; else failed "$name"; fi
CI=success

TOKEN_FILE="$r/nowhere"
deploy
unset TOKEN_FILE
name="without the GitHub token the deploy is refused"
if [ "$status" -ne 0 ] && head_is "$A" && [[ "$output" == *"token"* ]]; then
  passed "$name"
else failed "$name"; fi

# The images are pulled and their provenance verified before anything moves.
PULL=fail
deploy
PULL=ok
name="an image that cannot be pulled leaves everything as it is, and is retried"
if [ "$status" -ne 0 ] && head_is "$A" && failed_is "" && ! logged "compose up"; then
  passed "$name"
else failed "$name"; fi

: >"$r/docker.log"
ATTEST=fail
deploy
ATTEST=ok
name="an image whose provenance does not verify is never started, and is checked again"
if [ "$status" -ne 0 ] && head_is "$A" && failed_is "" && ! logged "compose up" &&
  logged "attestation verify oci://ghcr.io/victornain26/aubesonore-backend@sha256:0000" &&
  logged "--source-digest $P"; then
  passed "$name"
else failed "$name"; fi

# The verified images run under their commit's tag; the images of other commits but the one
# before are removed.
Q=$(push Q)
printf '%s\n' "ghcr.io/victornain26/aubesonore-backend:sha-old" \
  "ghcr.io/victornain26/aubesonore-backend:sha-$A" \
  "ghcr.io/victornain26/aubesonore-backend:sha-$Q" >"$r/images"
: >"$r/docker.log"
deploy
name="the verified images start under their commit's tag"
if [ "$status" -eq 0 ] && head_is "$Q" && failed_is "" &&
  logged "[sha-$Q] compose up -d --no-build"; then passed "$name"; else failed "$name"; fi
name="only the running commit's images are kept"
if logged "image rm ghcr.io/victornain26/aubesonore-backend:sha-old" &&
  logged "image rm ghcr.io/victornain26/aubesonore-backend:sha-$A" &&
  ! logged "image rm ghcr.io/victornain26/aubesonore-backend:sha-$Q"; then
  passed "$name"
else failed "$name"; fi
: >"$r/images"
A=$Q

BAD=$(push B) FAIL=build
: >"$r/docker.log"
deploy
name="a failed start rolls back to the images that ran before, without pulling them"
if [ "$status" -ne 0 ] && head_is "$A" && failed_is "$BAD" &&
  logged "tag img-aubesonore-backend ghcr.io/victornain26/aubesonore-backend:rollback" &&
  logged "[rollback] compose up -d --no-build" && ! logged "sha-$A"; then
  passed "$name"
else failed "$name"; fi

: >"$r/docker.log"
deploy
name="the failed commit is not retried"
if [ "$status" -ne 0 ] && [[ "$output" == *"waiting for a newer master"* ]] &&
  ! grep -q "compose up" "$r/docker.log"; then passed "$name"; else failed "$name"; fi

C=$(push C)
deploy
name="a newer master deploys and clears the failure"
if [ "$status" -eq 0 ] && head_is "$C" && failed_is ""; then passed "$name"; else failed "$name"; fi

BAD=$(push D) FAIL=health
deploy
name="failed healthchecks roll back"
if [ "$status" -ne 0 ] && head_is "$C" && failed_is "$BAD"; then passed "$name"; else failed "$name"; fi

# Without the images that ran before, a rollback starts nothing rather than something else.
BAD=$(push D2) FAIL=health NORUN=1
: >"$r/docker.log"
deploy
NORUN=0
name="a rollback without the previous images starts nothing"
if [ "$status" -ne 0 ] && head_is "$C" && [[ "$output" == *"nothing restarted"* ]] &&
  ! logged "[rollback] compose up"; then passed "$name"; else failed "$name"; fi

# Healthy containers can still fail every listener: a backend that cannot read Musilogy answered
# 500 on each artist page while /health said ok (2026-11-21). The search runs after the start.
BAD=none FAIL=none
SEARCH=500
S=$(push S)
: >"$r/docker.log"
deploy
SEARCH=200
name="a backend whose Musilogy search fails rolls back to the images that ran before"
if [ "$status" -ne 0 ] && head_is "$C" && failed_is "$S" &&
  [[ "$output" == *"search answered 500"* ]] && logged "[rollback] compose up -d --no-build" &&
  logged "CF-Connecting-IP: 127.0.0.1"; then passed "$name"; else failed "$name"; fi

# Failing before the start too, the search says nothing of the commit, which may be the fix.
SEARCH_BEFORE=500 SEARCH=500
S2=$(push S2)
deploy
SEARCH_BEFORE=200 SEARCH=200
name="a search that already failed before the deploy keeps the commit"
if [ "$status" -eq 0 ] && head_is "$S2" && failed_is "" &&
  [[ "$output" == *"as before this deploy"* ]]; then passed "$name"; else failed "$name"; fi
C=$S2

SEARCH=000
S3=$(push S3)
deploy
SEARCH=200
name="a search that gets no answer rolls back, and says so"
if [ "$status" -ne 0 ] && head_is "$C" && [[ "$output" == *"search did not answer"* ]]; then
  passed "$name"
else failed "$name"; fi

SEARCH=503
U=$(push U)
deploy
SEARCH=200
name="a search that says Musilogy is not loaded deploys, and says so"
if [ "$status" -eq 0 ] && head_is "$U" && failed_is "" &&
  [[ "$output" == *"Musilogy is not loaded"* ]]; then passed "$name"; else failed "$name"; fi

# The backend applies new migrations at boot and a rollback does not undo them: a range that adds
# one is dumped first, or waits.
commit_migration() { # <migration file> <message>
  mkdir -p "$r/dev/site/apps/backend/drizzle"
  echo "SELECT 1;" >"$r/dev/site/apps/backend/drizzle/$1"
  git -C "$r/dev" add -A
  git -C "$r/dev" commit -qm "$2"
  git -C "$r/dev" push -q origin master
  git -C "$r/dev" rev-parse HEAD
}
BAD=none FAIL=none

M=$(commit_migration 0001_v1.sql "a migration")
DUMP=fail
deploy
DUMP=ok
name="no dump, no migration: the deploy waits and is retried"
if [ "$status" -ne 0 ] && ! head_is "$M" && ! failed_is "$M" &&
  [[ "$output" == *"deploy deferred"* ]]; then passed "$name"; else failed "$name"; fi

: >"$r/docker.log"
deploy
# The dump comes before the new backend starts, which applies the migration; the CI read and the
# pull may come first, so an image that will not pull never costs a dump.
dump_line=$(grep -n -m1 -x dump "$r/docker.log" | cut -d: -f1)
up_line=$(grep -n -m1 "compose up" "$r/docker.log" | cut -d: -f1)
name="a migration deploys after a dump"
if [ "$status" -eq 0 ] && head_is "$M" && [ -n "$dump_line" ] && [ -n "$up_line" ] &&
  [ "$dump_line" -lt "$up_line" ]; then
  passed "$name"
else failed "$name"; fi

exit "$failures"
