# CLAUDE.md — AubeSonore

`docs/vision.md` (French) is the product vision and the architecture across the pieces. Before a
change that crosses pieces, read its §4: who owns which data, the flows, the contracts and the
forbidden couplings.

Each piece's commands, conventions and invariants are in `.claude/rules/<piece>.md`, loaded when a
file of that piece is opened; they are the authority for that piece. This file covers only what
spans them all.

## Working in the repository

- A PR stays inside one piece unless the change truly spans them.
- **CI**: `site.yml`, `pipeline.yml` and `musilogy.yml` have no path filter: their jobs are required
  checks on `master`, on every PR.
- **Deploying is merging to `master`** (`site/README.md` « Déploiement », `site/scripts/deploy.sh`).
- **Where to develop.** Every piece is developed on the workstation (clone `~/projets/aubesonore`),
  in a git worktree, one per branch. `~/aubesonore` is the production clone on victorserv: never
  work in it. The server is used only for the runs on the real data: Musilogy's build and its load
  into production, and the radio's passes.
- **Start Claude Code at the worktree's root**, never in a piece's folder: the guards in
  `.claude/settings.json` are read only from the starting directory. Never `cd` in Bash; use
  `git -C`, `pnpm -C site …`, `uv --directory <piece> run …`: every directory that becomes the
  working directory gets a `.claude/.cc-writes` folder from the sandbox, never cleaned up.
- **Servers Claude starts run outside its sandbox.** On Linux and WSL2 a sandboxed command's
  `localhost` is private to it: a dev server started there is unreachable from the browser.
  The commands that start one are the `sandbox.excludedCommands` of `.claude/settings.json`,
  matched on their exact text, so call them exactly as listed there, without a redirect or `cd`.
- **Victor runs a rebase or merge that changes `.claude/settings.json`.** The sandbox forbids writing
  that file: git stops halfway, the working tree half rewritten. Ask him to run it.

## On victorserv, documentation drifts faster than the system

On the server, never trust a hostname, IP, port, or absolute path read from a `.md` file or a
script default. Confirm against the runtime before acting on it (on the workstation these show
the local stack, not production):

```bash
docker ps                      # what actually runs, and where
systemctl --user list-timers   # what is actually scheduled
```

When a doc disagrees with the running system, the system is right — correct the doc.

## Cross-cutting

- **Shared machine.** victorserv runs many unrelated services: before binding a port, scheduling
  heavy work (the `musilogy-run` skill) or moving data, check what else is running.
- The broadcast runtime holds listener access logs: keep them out of diffs, pastes and reports.
- **Language**: human documentation (`README.md` files and `docs/`) is in French in every piece,
  like the product. `CLAUDE.md`, `SECURITY.md` and the workflow comments are in English; each
  `.claude/rules/<piece>.md` keeps its own language.
