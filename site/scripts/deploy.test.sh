#!/usr/bin/env bash
# The weekly-pass guard of deploy.sh, against a systemctl that reports each
# ActiveState a unit can be in.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir "$tmp/bin" "$tmp/repo"
# Answers like systemd 255: `is-active` succeeds for active and reloading only.
cat >"$tmp/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
case " $* " in
  *" is-active "*)
    [[ " $* " == *" --quiet "* ]] || echo "$WEEKLY_STATE"
    [[ "$WEEKLY_STATE" == active || "$WEEKLY_STATE" == reloading ]]
    ;;
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

# Builds and healthchecks fail while HEAD is $BAD, as $FAIL says.
cat >"$r/bin/docker" <<'EOF2'
#!/usr/bin/env bash
echo "$*" >>"$DOCKER_LOG"
bad() { [ "$(git -C "$REPO_DIR" rev-parse HEAD)" = "$BAD" ] && [ "$FAIL" = "$1" ]; }
case "$*" in
  "compose up"*) ! bad build ;;
  "compose ps -q") echo c1 ;;
  "inspect -f {{if"*) if bad health; then echo unhealthy; else echo healthy; fi ;;
  "inspect -f {{.Name}}"*) echo /aubesonore-backend ;;
esac
EOF2
cat >"$r/bin/systemctl" <<'EOF2'
#!/usr/bin/env bash
[[ " $* " == *" show "* ]] && echo inactive
exit 0
EOF2
printf '#!/usr/bin/env bash\nexit 0\n' >"$r/bin/uv"
chmod +x "$r/bin/docker" "$r/bin/systemctl" "$r/bin/uv"

deploy() {
  status=0
  output=$(PATH="$r/bin:$PATH" REPO_DIR="$r/repo" UV="$r/bin/uv" HEALTH_TIMEOUT_S=0 \
    DOCKER_LOG="$r/docker.log" BAD="$BAD" FAIL="$FAIL" bash "$here/deploy.sh" 2>&1) || status=$?
}
passed() { echo "ok   $1"; }
failed() {
  echo "FAIL $1: exit $status: $output"
  failures=$((failures + 1))
}
head_is() { [ "$(git -C "$r/repo" rev-parse HEAD)" = "$1" ]; }
failed_is() { [ "$(git -C "$r/repo" config --get aubesonore.failedTarget || true)" = "$1" ]; }

A=$(git -C "$r/repo" rev-parse HEAD)
BAD=$(push B) FAIL=build
deploy
name="a failed build rolls back"
if [ "$status" -ne 0 ] && head_is "$A" && failed_is "$BAD"; then passed "$name"; else failed "$name"; fi

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

exit "$failures"
