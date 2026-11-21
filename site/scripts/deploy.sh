#!/usr/bin/env bash
# Promotes origin/master onto the running stack when it moves. Driven by
# aubesonore-deploy.timer; safe to run by hand.
#
# The repository is the whole radio (~/aubesonore): site/, pipeline/ and azuracast/.
# Fast-forwarding it also deploys the pipeline code, which the weekly pass loads
# from this checkout. A commit is promoted once every GitHub check on it has passed. The site
# runs the images CI built from that commit (site.yml, job publish), pulled by their commit's tag
# and started only once their provenance verifies; nothing is built here. They change only when
# site/ changed.
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
backup_db="${BACKUP_DB:-$REPO_DIR/site/scripts/backup-db.sh}"
health_timeout="${HEALTH_TIMEOUT_S:-300}"
repo=VictorNain26/aubesonore
registry=ghcr.io/victornain26
images=(backend frontend renderer)
# A fine-grained token with no permission: `gh attestation verify` asks for one even for a public
# image, and it lifts the API's anonymous limit. Written by hand, never committed (site/README.md,
# « Déploiement »).
gh_token_file="${GH_TOKEN_FILE:-$HOME/.config/aubesonore/gh-token}"
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

# A commit whose deploy failed was rolled back (rollback below): it is not tried again every
# two minutes, only a newer master is. The unit keeps failing meanwhile.
if [ "$target" = "$(git config --get aubesonore.failedTarget || true)" ]; then
  echo "${target:0:8} failed to deploy and was rolled back; waiting for a newer master"
  exit 1
fi

if ! GH_TOKEN=$(cat "$gh_token_file" 2>/dev/null) || [ -z "$GH_TOKEN" ]; then
  echo "no GitHub token in $gh_token_file: deploy refused (site/README.md, « Déploiement »)"
  exit 1
fi
export GH_TOKEN

# The commit's GitHub Actions checks: one check suite per workflow run (Site, Pipeline, musilogy,
# CodeQL, Secrets), created as soon as the run is queued, so a workflow still waiting for a runner
# is seen; and the check runs of its jobs, all pages. All done, none failed, and the three
# `Publish images` runs succeeded: skipped (a workflow_dispatch on master) publishes nothing, and
# those jobs may not exist yet while the others are done. Other apps' suites stay queued forever.
ok='IN("success", "skipped", "neutral")'
ci=$(
  suites=$(gh api --paginate "repos/$repo/commits/$target/check-suites?per_page=100" \
    --jq '.check_suites[] | select(.app.slug == "github-actions")' | jq -s .) &&
    runs=$(gh api --paginate "repos/$repo/commits/$target/check-runs?per_page=100" \
      --jq '.check_runs[]' | jq -s .) &&
    jq -nr --argjson suites "$suites" --argjson runs "$runs" --argjson images "${#images[@]}" "
    def failed: .status == \"completed\" and (.conclusion | $ok | not);
    if (\$suites + \$runs) | any(failed) then \"failure\"
    elif (\$suites + \$runs) | any(.status != \"completed\") then \"pending\"
    elif ([\$runs[] | select((.name | startswith(\"Publish images\")) and .conclusion == \"success\")]
      | length) < \$images then \"pending\"
    else \"success\" end"
) || ci=unknown
case "$ci" in
  success) ;;
  pending)
    echo "waiting for CI on ${target:0:8}"
    exit 0
    ;;
  failure)
    echo "CI failed on ${target:0:8}: not deployed, waiting for a newer master"
    exit 1
    ;;
  *)
    echo "cannot read the CI of ${target:0:8}, retried next run"
    exit 1
    ;;
esac

site_changed() { ! git diff --quiet "$current" "$target" -- site/; }

# The images of a commit, under its tag ($IMAGE_TAG, compose.yaml). `docker pull`, not
# `compose pull`: the latter only warns when an image of a service it could build fails to pull.
pull() {
  local image
  for image in "${images[@]}"; do
    docker pull --quiet "$registry/aubesonore-$image:sha-$1" >/dev/null || return 1
  done
}

# The images of a commit, pulled, are the ones CI built from that very commit: signed by site.yml
# on master in this repository, from that source commit (--source-digest; without it, any master
# image could be passed off under another commit's tag). The digest pulled, not the tag, is what
# gets verified: a tag can move between the pull and the check (docs.github.com, « Using artifact
# attestations to establish provenance »; `gh attestation verify --help`).
verified() {
  local image digest
  for image in "${images[@]}"; do
    digest=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' \
      "$registry/aubesonore-$image:sha-$1" | grep -m1 "^$registry/aubesonore-$image@") || return 1
    gh attestation verify "oci://$digest" --repo "$repo" --bundle-from-oci \
      --signer-workflow "$repo/.github/workflows/site.yml" --source-ref refs/heads/master \
      --source-digest "$1" >/dev/null || return 1
  done
}

if site_changed; then
  if ! pull "$target"; then
    echo "cannot pull the images of ${target:0:8}, retried next run"
    exit 1
  fi
  # Nothing moved: the next run checks again. A verification that cannot reach GitHub or Sigstore
  # fails the same way as a forged image, and must not bar a good commit for good.
  if ! verified "$target"; then
    echo "the images of ${target:0:8} do not verify as built by site.yml on master: not deployed, checked again next run"
    exit 1
  fi
fi

# The images the site runs now, by ID: a rollback starts them again with no pull and no network.
# They passed their own deploy (or were built here, before images were published).
declare -A running=()
if site_changed; then
  for image in "${images[@]}"; do
    running[$image]=$(docker inspect -f '{{.Image}}' "aubesonore-$image" 2>/dev/null || true)
  done
fi

echo "deploying ${current:0:8} -> ${target:0:8}"

# Every container with a healthcheck healthy within the timeout, or the others named.
wait_healthy() {
  local deadline=$((SECONDS + health_timeout)) pending cid health
  while true; do
    pending=""
    for cid in $(docker compose ps -q); do
      health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid")
      [ -z "$health" ] && continue
      [ "$health" = "healthy" ] && continue
      pending="$pending $(docker inspect -f '{{.Name}}' "$cid")=$health"
    done
    [ -z "$pending" ] && return 0
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "unhealthy after ${health_timeout}s:$pending"
      return 1
    fi
    sleep 5
  done
}

# Back to the commit that ran before, on the images that ran then (tagged `rollback`), the
# failed one recorded so that the next runs wait for a newer master. Without this, a failed
# start left HEAD on the new commit and the containers on the old one, and the next run saw
# nothing to do. reset --keep stops rather than overwrite a local change (git-reset(1)); the
# tree was checked clean above.
rollback() {
  echo "deploy of ${target:0:8} failed ($1): rolling back to ${current:0:8}"
  cd "$REPO_DIR"
  git config aubesonore.failedTarget "$target"
  git reset --keep "$current"
  (cd pipeline && "$uv" sync --locked --quiet)
  if ! git diff --quiet "$current" "$target" -- pipeline/; then
    systemctl --user try-restart radio-votes.service
  fi
  if site_changed; then
    local image ready=yes
    for image in "${images[@]}"; do
      [ -n "${running[$image]:-}" ] &&
        docker tag "${running[$image]}" "$registry/aubesonore-$image:rollback" || ready=no
    done
    if [ "$ready" = no ]; then
      echo "the images that ran before are gone: nothing restarted, the site needs a hand"
    elif (cd site && IMAGE_TAG=rollback docker compose up -d --no-build --remove-orphans && wait_healthy); then
      echo "rolled back to ${current:0:8}, all healthchecks green"
    else
      echo "rolled back to ${current:0:8}, which is not healthy either"
    fi
  fi
  exit 1
}

# The new backend applies its migrations at boot, and a rollback brings back the code, not the
# schema it had: dump the database before a range that adds one, or wait for the next run.
if [ -n "$(git diff --name-only --diff-filter=A "$current" "$target" -- 'site/apps/backend/drizzle/*.sql')" ]; then
  "$backup_db" || {
    echo "no dump before the migrations of ${target:0:8}, deploy deferred"
    exit 1
  }
fi

git merge --ff-only "$target"

# The vote page is a long-running process: it keeps serving the pipeline code it
# was started with until it restarts.
if ! git diff --quiet "$current" "$target" -- pipeline/; then
  (cd pipeline && "$uv" sync --locked --quiet) || rollback "uv sync"
  systemctl --user try-restart radio-votes.service
  echo "restarted radio-votes on ${target:0:8}"
fi

if ! site_changed; then
  git config --unset aubesonore.failedTarget || true
  echo "promoted ${target:0:8} (no change under site/, containers left as they are)"
  exit 0
fi

cd site
IMAGE_TAG="sha-$target" docker compose up -d --no-build --remove-orphans || rollback "start"
wait_healthy || rollback "healthchecks"
git config --unset aubesonore.failedTarget || true
echo "deployed ${target:0:8}, all healthchecks green"

# Only the running commit's images stay, on a disk shared with other services: the next rollback
# starts them by ID, and GHCR keeps every commit's.
docker image ls --format '{{.Repository}}:{{.Tag}}' --filter "reference=$registry/aubesonore-*" |
  while read -r ref; do
    case "${ref##*:}" in
      "sha-$target") ;;
      *) docker image rm "$ref" >/dev/null || true ;;
    esac
  done
# Dangling images older than 72 h only: the box runs other services, whose fresh ones stay.
docker image prune -f --filter "until=72h" >/dev/null
