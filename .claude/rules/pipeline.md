---
paths:
  - "pipeline/**"
---

# pipeline

- `pipeline/docs/conception.md` is the only design and operations document: read it before a change,
  and update it in the same commit as the code.
- Checks, from the repository root: `uv --directory pipeline run ruff check`, `… ruff format --check`,
  `… mypy`, `… pytest -q -W error -rs`. Run `pipeline/scripts/dev-setup.sh` once, or some tests skip.
- The current schema: `sqlite3 pipeline/data/radio.db .schema`.
- `gout` does not run while `empreintes` runs.
- A SQLite migration script has no `BEGIN` or `COMMIT` (`radio/socle/db.py`, `_migrate`).
