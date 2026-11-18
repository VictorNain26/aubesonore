---
paths:
  - "musilogy/**"
---

# musilogy

Paths below are relative to `musilogy/`.

Checks, from the repository root: `uv --directory musilogy run ruff check`, `… ruff format --check`,
`… mypy`, `… pytest` (`mypy src` alone skips the tests; the `pg` tests: `README.md`).

An opinion on a method or a display starts from the folders of `docs/research/` and the sources they
cite; a decision they settled is reopened only on new evidence.

## Design

- Dependencies are pinned to the patch: the pipeline's reproducibility depends on them as much as on
  the code.
- musilogy produces tables, not display views. A filter or an order that serves rendering belongs to
  the functions the site reads (`pg/90_*.sql`); the population stays complete. Mixing the two loses
  data that can no longer be recovered downstream.
- The site reads only SQL functions, whose signatures are a contract (`docs/conception.md` §4): a
  signature change is flagged in the PR.
- Rules live in the SQL; Python chains and checks, it does not arbitrate.
- A SQL file reads only tables produced by a strictly lower number: a rule that needs a table defined
  later means the numbering is wrong.
- A derived value travels with its provenance: publishing `y0` next to `y0_source` lets the consumer
  tell declared from inferred.
- A missing fixture is drawn from the dump (`make-fixtures`), not written by hand.
- A drift refused by `musilogy run`: read `README.md` « Comparaison avec la livraison précédente »
  before any `--accept-drift`.
- A source that is not CC0 is added only after a decision written in `LICENSE-DATA`.

## Measure, don't reason

The full extracts live in `data/work/` and DuckDB reads them in seconds: a numeric question (« how many
links does this rule lose? ») is settled by a query, and since the pipeline is deterministic a
counterfactual is always possible. An acceptance criterion is a number or an exit code: « `musilogy
run` publishes without `--accept-drift links` » rather than « fix the links ».

A study on a sample says whether a rule is right, not what it costs. Before writing the tests and code
of a rule that scans a large table (`colisten`, the listens, `releases`), its heaviest queries run on
the server's full data, under the `build.connect()` bound, and the PR gives the rows produced against
the previous delivery, their memory peak and their duration: a multiplied volume often reveals a wrong
rule before its cost does. Design for that scale from the start, following DuckDB's performance guide:
integer keys rather than text MBIDs, one blocking operator per query, intermediate tables freed as soon
as they are no longer used.

## Data on victorserv

- The data lives outside any checkout, in `~/musilogy-data`; only the server worktree that runs a job
  on it links to it, with `ln -s ~/musilogy-data musilogy/data`.
- The reference dump (`REFERENCE_DUMP`, `src/musilogy/__init__.py`) is no longer published by
  MetaBrainz: this copy is the only one, keep it intact.
- A computation on the full data goes through the `musilogy-run` skill; the production load is
  `/musilogy-load`, which only Victor starts.
