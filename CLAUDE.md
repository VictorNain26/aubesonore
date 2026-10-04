# CLAUDE.md — AubeSonore (~/aubesonore)

## What this repository is

One self-hosted webradio, AubeSonore, in a single repository cloned at `~/aubesonore`
(GitHub `VictorNain26/aubesonore`, branch `master`). Four pieces live side by side on one machine:

| Directory    | Role                                        | Stack                          |
| ------------ | ------------------------------------------- | ------------------------------ |
| `site/`      | Web app (listener site + API)               | pnpm, Turbo, Bun, React        |
| `pipeline/`  | Taste model, discovery, acquisition, antenne | Python 3.12, uv                |
| `azuracast/` | Broadcast server runtime                    | Docker — **config only** here  |
| `musilogy/`  | Musilogy's data, offline, from MusicBrainz  | Python 3.12, uv, DuckDB        |

Until 2026-10-01 they were separate repositories; the standalone `radio-pipeline` and `musilogy`
repositories were deleted on 2026-10-03, their history kept under `pipeline/` and `musilogy/`
(git subtree).

**`docs/vision.md` is the product vision and the architecture across the pieces** (French):
who owns which data, the contracts between pieces, the identity of an artist, the roadmap. Read
it before a change that crosses pieces.

**Each piece has its own `CLAUDE.md`, and it is the authority for that piece**: commands,
conventions, invariants. Read it before touching anything there. This file covers only what spans
them all. `azuracast/RUNBOOK.md` covers rebuilding the whole system from nothing.

## Working in the repository

- One branch, one PR per change; a PR stays inside one piece unless the change truly spans them.
- **CI**: `.github/workflows/site.yml`, `pipeline.yml` and `musilogy.yml` run on every PR, with
  no path filter: their jobs are required checks on `master`.
- **Dependencies**: Renovate (`renovate.json`) covers pnpm, uv, GitHub Actions and Docker images.
- **Hooks**: husky lives in `site/.husky` (`prepare` runs `cd .. && husky site/.husky`). The
  commit message is checked by commitlint (Conventional Commits, English) for every commit,
  whatever the piece; the pre-push gate of the site only runs when `site/` changed.
- **Deploying is merging to `master`.** `aubesonore-deploy.timer` fast-forwards `~/aubesonore`; it
  rebuilds the site containers only when `site/` changed, and never moves the tree while the
  radio's weekly pass (`radio-weekly.service`) runs, since that pass loads `pipeline/` code.
  Each pass also runs `uv sync --locked` in `pipeline/`, so a dependency change reaches the
  `.venv` the radio-* units run.
- **Where to develop.** `site/` runs on any workstation clone (`site/README.md`: local Postgres,
  `pnpm dev`, the public station for now-playing). `pipeline/` and `musilogy/` need the server's
  data (Plex, AzuraCast, MusicBrainz dumps), so they are developed on the server, in a git
  worktree next to the checkout. Never in `~/aubesonore` itself: it is the production checkout.

## How the pieces fit together

AzuraCast is the hub. The other two never talk to each other.

```
   pipeline/ ──── uploads tracks into antenne/ (API) ────────► ┌───────────┐
                                                              │ AzuraCast │
                                                              └───────────┘
                                                                    ▲
                         site/ ──reads now-playing, history (never writes)
```

- The pipeline **owns the library**. Since the 2026-09 rewrite (v3) it reads Plex, finds
  candidates (neighbours of Victor's artists, plus fresh picks from Hype Machine and Deezer
  editors), learns from Victor's votes, downloads the retained tracks and publishes them to the
  `antenne/` folder of AzuraCast. Since the cutover of 2026-10-01 the station plays only the
  "AubeSonore" playlist bound to that folder. Sequencing is not built yet.
- The web app **owns the listener experience**: likes, multi-platform links, auth, push. It is a
  read-only consumer of the station and must stay that way.
- Any change that seems to need pipeline↔app coupling is a design smell — route it through
  AzuraCast, or reconsider.
- musilogy is **offline reference data**, outside the radio: it turns a MusicBrainz dump and
  dated ListenBrainz and Wikidata snapshots into Parquet tables. `musilogy load` copies them into a `musilogy`
  schema of the site's database, and the site reads them only through musilogy's SQL functions
  — never by calling musilogy at runtime (`docs/vision.md` §4.3).

## Documentation drifts faster than the system

Several docs in these repos predate a migration (AzuraCast used to run on a remote host, the
pieces were separate repositories, and the checkout was `~/radio` until 2026-10-02). Never trust a hostname, IP, port, or absolute path read from a
`.md` file or a script default. Confirm against the runtime before acting on it:

```bash
docker ps                      # what actually runs, and where
grep -E '^AZURACAST|^VITE_|^DATABASE' */.env */*/.env 2>/dev/null
systemctl --user list-timers   # what is actually scheduled
```

When this file disagrees with the running system, the system is right — correct the doc.

## Cross-cutting

- **Shared machine.** Many unrelated services run here. Before binding a port, scheduling heavy
  work (a full `musilogy run` reads ~3 GB of dumps), or moving data, check what else is running — the broadcast container is CPU-weighted to
  win against batch workloads for a reason.
- **Scheduling is systemd *user* timers**, not cron, and depends on lingering being enabled.
  Deploying AubeSonore is merging to `master`: `aubesonore-deploy.timer` promotes it.
- **Secrets are untracked `.env` files in `site/`, `pipeline/` and `azuracast/`** (plus `azuracast/azuracast.env`), and the broadcast runtime also
  holds listener access logs. Keep all of it out of diffs, pastes, and issue reports.
- **Language**: commits are English Conventional Commits everywhere (commitlint). Documentation
  follows the piece: the pipeline, azuracast and musilogy document in French, the site in English.
