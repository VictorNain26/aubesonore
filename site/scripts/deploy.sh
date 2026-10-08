#!/usr/bin/env bash
# Promotes origin/master onto the running stack when it moves. Driven by
# aubesonore-deploy.timer; safe to run by hand.
#
# The repository is the whole radio (~/aubesonore): site/, pipeline/ and azuracast/.
# Fast-forwarding it also deploys the pipeline code, which the weekly pass loads
# from this checkout; the site containers are only rebuilt when site/ changed.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/aubesonore}"
cd "$REPO_DIR"

# The weekly pass imports its code from pipeline/ at each step: never move the
# tree under it. The next timer run promotes once the pass is over. A oneshot
# stays "activating" for its whole run, which `is-active` reports as not active:
# three deploys landed in the middle of the pass of 2026-10-04.
weekly=$(systemctl --user show -P ActiveState radio-weekly.service)
case "$weekly" in
  inactive | failed) ;;
  *)
    echo "radio-weekly is $weekly, deferring the deploy"
    exit 0
    ;;
esac

# The checkout serves production: anything but a clean master is someone's work
# in progress. A fast-forward would then move their branch, or fail on their
# files every run; refuse loudly instead, and leave the tree to its owner.
branch=$(git symbolic-ref --quiet --short HEAD || echo "a detached HEAD")
if [ "$branch" != master ]; then
  echo "$REPO_DIR is on $branch, not master: deploy refused"
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "$REPO_DIR has local changes: deploy refused"
  git status --short | head -20
  exit 1
fi

# The radio-* units run pipeline/.venv directly. Syncing it on every pass, not only when
# uv.lock moves, also repairs a sync that failed after its code was already promoted.
uv="${UV:-$HOME/.local/bin/uv}"
(cd pipeline && "$uv" sync --locked --quiet)

current=$(git rev-parse HEAD)
target=$(git ls-remote origin refs/heads/master | cut -f1)

if [ -z "$target" ]; then
  echo "cannot reach origin, leaving $current in place"
  exit 1
fi

if [ "$current" = "$target" ]; then
  exit 0
fi

git fetch --quiet origin master
target=$(git rev-parse origin/master)

# Comparing SHAs is not enough: once HEAD carries an unpushed local commit it
# can never equal origin/master, so every run saw itself behind, `git merge
# --ff-only` answered "Already up to date." with exit 0, and `docker compose up
# --build` ran again every 2.5 minutes (103 useless deploys in three hours on
# 2026-08-19). The real question is whether origin/master is already in HEAD.
if git merge-base --is-ancestor "$target" HEAD; then
  echo "origin/master (${target:0:8}) already in HEAD (${current:0:8}), nothing to promote"
  exit 0
fi

echo "deploying ${current:0:8} -> ${target:0:8}"

# The backend applies new drizzle/*.sql migrations at boot (src/db/migrate.ts).
# A schema.ts change that ships without one would boot the new code against the
# old tables, so it waits for the operator. Each change on master (a squash or a
# merge commit, diffed against its first parent) must add its own migration: an
# unrelated one landing in the same range does not count. HEAD only moves once
# the gate opens, so the operator records the schema.ts blob they applied.
schema=site/apps/backend/src/db/schema.ts
running_schema=$(git rev-parse -q --verify "HEAD:$schema" || echo absent)
target_schema=$(git rev-parse -q --verify "$target:$schema" || echo absent)
applied_schema=$(git config --get aubesonore.appliedSchema || true)
unmigrated=""
for c in $(git rev-list --first-parent "$current..$target"); do
  git diff --quiet "$c^" "$c" -- "$schema" && continue
  [ -n "$(git diff --name-only --diff-filter=A "$c^" "$c" -- 'site/apps/backend/drizzle/*.sql')" ] && continue
  unmigrated="$unmigrated ${c:0:8}"
done
if [ -n "$unmigrated" ] && [ "$target_schema" != "$running_schema" ] && [ "$target_schema" != "$applied_schema" ]; then
  echo "schema.ts changed without a migration in:$unmigrated — apply it by hand from ${target:0:8}, then:"
  echo "  git -C $REPO_DIR config aubesonore.appliedSchema $target_schema"
  echo "  systemctl --user start aubesonore-deploy"
  exit 1
fi

git merge --ff-only "$target"

# The vote page is a long-running process: it keeps serving the pipeline code it
# was started with until it restarts.
if ! git diff --quiet "$current" "$target" -- pipeline/; then
  (cd pipeline && "$uv" sync --locked --quiet)
  systemctl --user try-restart radio-votes.service
  echo "restarted radio-votes on ${target:0:8}"
fi

if git diff --quiet "$current" "$target" -- site/; then
  echo "promoted ${target:0:8} (no change under site/, containers left as they are)"
  exit 0
fi

cd site
docker compose up -d --build --remove-orphans

deadline=$((SECONDS + 300))
while true; do
  pending=""
  for cid in $(docker compose ps -q); do
    health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid")
    [ -z "$health" ] && continue
    [ "$health" = "healthy" ] && continue
    pending="$pending $(docker inspect -f '{{.Name}}' "$cid")=$health"
  done

  if [ -z "$pending" ]; then
    echo "deployed ${target:0:8}, all healthchecks green"
    break
  fi

  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "deployed ${target:0:8} but unhealthy after 300s:$pending"
    exit 1
  fi

  sleep 5
done

docker image prune -f --filter "until=72h" >/dev/null
# Each build adds to the build cache and nothing removed it: 28 GB on 2026-10-08, 22 of them
# reclaimable, on a disk shared with other services. Past 10 GB the least recently used records
# go first (docs.docker.com/reference/cli/docker/buildx/prune/), so the layers of the last
# builds stay and the next deploy keeps its cache.
docker buildx prune -f --max-used-space 10gb >/dev/null
