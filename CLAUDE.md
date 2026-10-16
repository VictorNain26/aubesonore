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

`pipeline/` and `musilogy/` carry their earlier history (git subtree).

**`docs/vision.md` is the product vision and the architecture across the pieces** (French):
who owns which data, the contracts between pieces, the identity of an artist, the roadmap. Read
it before a change that crosses pieces.

**Each piece's commands, conventions and invariants are in `.claude/rules/<piece>.md`**, loaded
when a file of that piece is opened; they are the authority for that piece. This file covers only
what spans them all. Start Claude Code at the repository root (or a worktree's root): the guards
in `.claude/settings.json` are read only from the starting directory. `azuracast/RUNBOOK.md`
covers rebuilding the whole system from nothing.

## Working in the repository

- A PR stays inside one piece unless the change truly spans them.
- **CI**: `.github/workflows/site.yml`, `pipeline.yml` and `musilogy.yml` run on every PR, with
  no path filter: their jobs are required checks on `master`. `codeql.yml` also runs, only on PRs
  that target `master`, and is not required.
- **Hooks**: husky lives in `site/.husky` (`prepare` runs `cd .. && husky site/.husky`), so the
  hooks exist only in a clone where `pnpm install` has run in `site/`; no CI job checks commit
  messages. There, commitlint checks every commit message (Conventional Commits, English),
  whatever the piece, and the site's pre-push gate runs only when `site/` changed. The scope is
  the piece (`site`, `pipeline`, `musilogy`, `azuracast`), `repo` for what spans them, `deps`
  for dependencies.
- **Deploying is merging to `master`.** `aubesonore-deploy.timer` fast-forwards `~/aubesonore`; it
  rebuilds the site containers only when `site/` changed, and never moves the tree while the
  radio's weekly pass (`radio-weekly.service`) runs, since that pass loads `pipeline/` code.
  Each pass also runs `uv sync --locked` in `pipeline/`, so a dependency change reaches the
  `.venv` the radio-* units run.
- **Where to develop.** `site/` runs on any workstation clone (`site/README.md`: local Postgres,
  `pnpm dev`, the public station for now-playing), which reads the artist pages and Musilogy from
  production: enough for a change of the interface alone. A change of the site's backend or of
  the data it reads is tried on the **preview of its branch** on the server
  (`site/scripts/preview.sh`, `site/README.md`): production's own `compose.yaml` under another
  project, with its own database holding the real Musilogy, reached through an SSH tunnel.
  `pipeline/` and `musilogy/` need the server's data (Plex, AzuraCast, MusicBrainz dumps), so
  they are developed on the server, in a git worktree next to the checkout. Never in
  `~/aubesonore` itself: it is the production checkout.

## How the pieces fit together

AzuraCast is the hub. The pipeline and the site never talk to each other.

```
   pipeline/ ──── uploads tracks into antenne/ (API) ────────► ┌───────────┐
                                                              │ AzuraCast │
                                                              └───────────┘
                                                                    ▲
                         site/ ──reads now-playing, history (never writes)
```

- The pipeline **owns the library**. It reads Plex, finds
  candidates (neighbours of Victor's artists, plus fresh picks from Hype Machine and Deezer
  editors), learns from Victor's votes, downloads the retained tracks and publishes them to the
  `antenne/` folder of AzuraCast. Each night `radio grille` sequences the next day into the hourly
  "Grille" playlists; the "AubeSonore" playlist bound to the folder is the fallback.
- The web app **owns the listener experience**: likes, multi-platform links, auth. It is a
  read-only consumer of the station and must stay that way.
- Any change that seems to need pipeline↔app coupling is a design smell — route it through
  AzuraCast, or reconsider.
- musilogy is **offline reference data**, outside the radio: it turns a MusicBrainz dump, the
  Discogs releases dump and dated ListenBrainz, MusicBrainz and Wikidata snapshots into Parquet
  tables. `musilogy load` copies them into a `musilogy`
  schema of the site's database, and the site reads them only through musilogy's SQL functions
  — never by calling musilogy at runtime (`docs/vision.md` §4.3).

## Documentation drifts faster than the system

Never trust a hostname, IP, port, or absolute path read from a `.md` file or a script default.
Confirm against the runtime before acting on it:

```bash
docker ps                      # what actually runs, and where
systemctl --user list-timers   # what is actually scheduled
```

When this file disagrees with the running system, the system is right — correct the doc.

## Cross-cutting

- **Shared machine.** Many unrelated services run here. Before binding a port, scheduling heavy
  work (a full `musilogy run` reads ~3 GB of dumps), or moving data, check what else is running — the broadcast container is CPU-weighted to
  win against batch workloads for a reason.
- **Scheduling is systemd *user* timers**, not cron, and depends on lingering being enabled.
- **Secrets are untracked `.env` files in `site/`, `pipeline/` and `azuracast/`** (plus `azuracast/azuracast.env` and `azuracast/gatus.env`, mode 600), and the broadcast runtime also
  holds listener access logs. Keep all of it out of diffs, pastes, and issue reports.
- **Language**: documentation follows the piece: the pipeline, azuracast and musilogy document in
  French, the site in English.
  At the root, `README.md` and `docs/` are in French, like the product; `CLAUDE.md`,
  `SECURITY.md` and the workflow comments are in English.
