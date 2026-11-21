#!/usr/bin/env bash
# Stop hook: the checks of every piece that differs from origin/master, in the tree the session works
# in. That tree is the `cwd` of the hook's input, a worktree included; $CLAUDE_PROJECT_DIR stays on
# the original checkout (code.claude.com/docs/en/hooks). Exit 2 hands the failure back to Claude.
set -uo pipefail

cwd=$(jq -r '.cwd // empty' 2>/dev/null) || cwd=
root=$(git -C "${cwd:-$CLAUDE_PROJECT_DIR}" rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

# A piece counts as changed when its files differ from origin/master, committed or not, or when it
# has new files; without origin/master every piece is checked.
changed() {
  git rev-parse -q --verify origin/master >/dev/null || return 0
  ! git diff --quiet origin/master -- "$1" ||
    [ -n "$(git ls-files --others --exclude-standard -- "$1")" ]
}

status=0
if changed site; then
  { pnpm -C site typecheck && pnpm -C site lint; } 1>&2 || status=2
fi
for piece in pipeline musilogy; do
  if changed "$piece"; then
    { uv --directory "$piece" run ruff check && uv --directory "$piece" run mypy; } 1>&2 || status=2
  fi
done
exit "$status"
