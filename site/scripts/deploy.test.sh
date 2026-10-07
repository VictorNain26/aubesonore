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

exit "$failures"
