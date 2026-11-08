# AubeSonore

`docs/vision.md` §4 (in French) says who owns which data, the contracts and the forbidden couplings
between pieces: read it before a change that crosses pieces. A PR stays inside one piece unless the
change truly spans them.

## Working in the repository

- `site.yml`, `pipeline.yml` and `musilogy.yml` have no path filter on purpose: their jobs are required
  checks on `master`, on every PR.
- Deploying is merging to `master` (`site/README.md` « Déploiement »).
- Every piece is developed on the workstation, in a git worktree per branch. `~/aubesonore` is the
  production clone on victorserv; the server is for runs on the real data only (Musilogy's build and
  its load into production, the radio's passes).
- Start Claude Code at the worktree's root: `.claude/settings.json` is read only from the starting
  directory.
- Prefer `git -C`, `pnpm -C site …` and `uv --directory <piece> run …` to `cd`: every directory that
  becomes the working directory gets a `.claude/.cc-writes` folder from the sandbox, never cleaned up.
- A sandboxed command's `localhost` is private to it, so a dev server started there is unreachable
  from the browser. The commands that start one are the `sandbox.excludedCommands` of
  `.claude/settings.json`, matched on their exact text: call them as listed, without a redirect or
  `cd`.
- Victor runs a rebase or merge that changes `.claude/settings.json`: the sandbox forbids writing
  that file, so git would stop halfway with the tree half rewritten.

## On victorserv

Hostnames, IPs, ports and absolute paths in a `.md` file or a script default drift faster than the
system. Confirm against the runtime before acting on one, and when a doc disagrees with the running
system, correct the doc. On the workstation these show the local stack, not production:

```bash
docker ps                      # what actually runs, and where
systemctl --user list-timers   # what is actually scheduled
```

The machine runs many unrelated services: check what else is running before binding a port,
scheduling heavy work or moving data.

## Cross-cutting

- The broadcast runtime holds listener access logs: keep them out of diffs, pastes and reports.
- Human documentation (`README.md` files and `docs/`) is in French in every piece, like the product.
  `CLAUDE.md`, `SECURITY.md` and the workflow comments are in English; each `.claude/rules/<piece>.md`
  keeps its own language.
