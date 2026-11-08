---
paths:
  - "pipeline/**"
---

# pipeline

- `pipeline/docs/conception.md` est l'unique document de conception et d'exploitation : le lire
  avant une modification, et le tenir à jour dans le même commit que le code.
- Contrôles, depuis la racine : `uv --directory pipeline run ruff check`, `… ruff format --check`,
  `… mypy`, `… pytest -q -W error -rs`. `pipeline/scripts/dev-setup.sh` une fois, sinon des tests se
  sautent.
- Le schéma en vigueur : `sqlite3 pipeline/data/radio.db .schema`.
- `train` ne se lance pas pendant `signals`.
- Un script de migration SQLite se passe de `BEGIN` et de `COMMIT` (`radio/core/db.py`, `_migrate`).
