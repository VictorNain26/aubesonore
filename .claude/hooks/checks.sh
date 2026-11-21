#!/usr/bin/env bash
# Stop hook: the checks of every piece the branch changed, in the tree the session works in. That
# tree is the `cwd` of the hook's input, a worktree included; $CLAUDE_PROJECT_DIR stays on the
# original checkout (code.claude.com/docs/en/hooks). .claude/settings.json runs this file from that
# tree, and only when the tree has it. Exit 2 hands the failure back to Claude.
set -uo pipefail

if ! cwd=$(jq -er '.cwd' 2>/dev/null); then
  echo "checks.sh: no cwd in the hook input (is jq installed?), checking $CLAUDE_PROJECT_DIR" >&2
  cwd=$CLAUDE_PROJECT_DIR
fi
root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

# A piece counts as changed when it differs from where the branch left origin/master, committed or
# not, or has new files, as site/.husky/pre-push compares; without origin/master every piece counts.
base=$(git merge-base origin/master HEAD 2>/dev/null) || base=
changed() {
  [ -n "$base" ] || return 0
  ! git diff --quiet "$base" -- "$1" ||
    [ -n "$(git ls-files --others --exclude-standard -- "$1")" ]
}

status=0
if changed site; then
  # Lint resolves @aubesonore/shared-types from its build, which a fresh worktree lacks.
  { pnpm -C site exec turbo build --filter=@aubesonore/shared-types &&
    pnpm -C site typecheck && pnpm -C site lint; } 1>&2 || status=2
fi
for piece in pipeline musilogy; do
  if changed "$piece"; then
    { uv --directory "$piece" run ruff check && uv --directory "$piece" run mypy; } 1>&2 || status=2
  fi
done
exit "$status"
