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
- **Hooks**: the git hooks are in `site/.husky/`, wired by the `prepare` script of
  `site/package.json`, so they exist only in a clone where `pnpm install` has run in `site/`; no
  CI job checks commit messages. Messages are in English and follow Conventional Commits;
  commitlint (`site/commitlint.config.js`) checks them and their scope, the piece or `repo`
  or `deps`.
- **Deploying is merging to `master`.** `aubesonore-deploy.timer` fast-forwards `~/aubesonore`; it
  rebuilds the site containers only when `site/` changed, and never moves the tree while the
  radio's weekly pass (`radio-weekly.service`) runs, since that pass loads `pipeline/` code.
  When `pipeline/` changed, the pass runs `uv sync --locked` there after the fast-forward
  (`site/scripts/deploy.sh`), so a dependency change reaches the `.venv` the radio-* units run.
- **Where to develop.** Every piece is developed on the workstation, in a git worktree of the
  clone, one per branch; each piece's commands are in its `.claude/rules/<piece>.md`. The
  server is used only for the runs on the real data: Musilogy's build and
  its load into production, and the radio's passes. Never work in `~/aubesonore` itself: it
  is the production checkout. Start Claude Code at the worktree's root, never in a piece's
  folder, and run a piece's commands from there (`uv --directory musilogy run …`,
  `pnpm -C site …`).
- **Servers Claude starts run outside its sandbox.** On Linux and WSL2 a sandboxed command's
  `localhost` is private to it: a dev server started there is unreachable from the browser.
  The commands that start one are the `sandbox.excludedCommands` of `.claude/settings.json`,
  matched on their exact text, so call them exactly as listed there, without a redirect or `cd`.
- **Victor runs a rebase or merge that changes `.claude/settings.json`.** The sandbox forbids writing
  that file: git stops halfway, the working tree half rewritten. Ask him to run it.

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
  work (a full `musilogy run` reads several large dumps, see `.claude/rules/musilogy.md`), or moving data, check what else is running — the broadcast container is CPU-weighted to
  win against batch workloads for a reason.
- **Scheduling is systemd *user* timers**, not cron, and depends on lingering being enabled.
- **Secrets are untracked `.env` files in `site/`, `pipeline/` and `azuracast/`** (plus `azuracast/azuracast.env`, mode 600), and the broadcast runtime also
  holds listener access logs. Keep all of it out of diffs, pastes, and issue reports.
- **Language**: human documentation (`README.md` files and `docs/`) is in French in every piece,
  like the product. `CLAUDE.md`, `SECURITY.md` and the workflow comments are in English; each
  `.claude/rules/<piece>.md` keeps its own language.
