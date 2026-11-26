#!/usr/bin/env bash
# What checks.sh, the Stop hook, runs for each piece the branch changed: against a pnpm and a uv
# that only record what they are sent, in a repository whose origin/master is its first commit.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin"
# Each call is recorded; the one whose arguments match $FAIL exits 1.
for tool in pnpm uv; do
  cat >"$tmp/bin/$tool" <<EOF
#!/usr/bin/env bash
echo "$tool \$*" >>"\$SENT"
[ -n "\${FAIL:-}" ] && [[ "$tool \$*" == *"\$FAIL"* ]] && exit 1
exit 0
EOF
done
chmod +x "$tmp/bin/"*

# The scratch repository ignores the machine's git config (signing, hooksPath, templates).
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
repo=$tmp/repo
git init -q --template= "$repo"
for piece in site pipeline musilogy; do mkdir -p "$repo/$piece" && echo a >"$repo/$piece/file"; done
git -C "$repo" add -A
git -C "$repo" -c user.name=t -c user.email=t@t commit -qm base
git -C "$repo" update-ref refs/remotes/origin/master HEAD

failures=0
check() {
  if [ "$2" = "$3" ]; then echo "ok   $1"; else
    echo "FAIL $1: got $2, want $3"
    failures=$((failures + 1))
  fi
}

# run [FAIL pattern]: the hook on the repository, as Claude Code sends it its input.
run() {
  : >"$tmp/sent"
  status=0
  printf '{"cwd":"%s","stop_hook_active":false}' "$repo" |
    FAIL=${1:-} SENT="$tmp/sent" PATH="$tmp/bin:$PATH" bash "$here/checks.sh" >/dev/null 2>&1 ||
    status=$?
  sent=$(paste -sd ';' "$tmp/sent")
}

run
check 'nothing changed: nothing runs' "$sent/$status" /0

echo b >"$repo/site/file"
run
check 'site changed: its typecheck only' "$sent/$status" 'pnpm -C site typecheck/0'
run 'typecheck'
check 'a type error sends Claude back' "$status" 2

git -C "$repo" checkout -q -- site
echo b >"$repo/pipeline/new"
run
check 'an untracked file counts' "$sent/$status" \
  'uv --directory pipeline run ruff check;uv --directory pipeline run mypy/0'
run 'mypy'
check 'a mypy error sends Claude back' "$status" 2

rm "$repo/pipeline/new"
echo b >"$repo/musilogy/file"
run
check 'musilogy changed: its checks only' "$sent/$status" \
  'uv --directory musilogy run ruff check;uv --directory musilogy run mypy/0'

git -C "$repo" checkout -q -- musilogy
git -C "$repo" update-ref -d refs/remotes/origin/master
run
check 'without origin/master every piece counts' "$sent/$status" \
  'pnpm -C site typecheck;uv --directory pipeline run ruff check;uv --directory pipeline run mypy;uv --directory musilogy run ruff check;uv --directory musilogy run mypy/0'

[ "$failures" -eq 0 ]
