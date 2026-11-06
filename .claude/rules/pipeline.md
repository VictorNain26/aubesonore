---
description: Pipeline de la radio — chargé en ouvrant un fichier de pipeline/
paths:
  - "pipeline/**"
---

# pipeline

- **`pipeline/docs/conception.md` est l'unique document de conception et d'exploitation** : le
  lire avant toute modification, et le tenir à jour dans le même commit que le code.
- Les contrôles de la CI sont ceux de `.github/actions/check-python`, lancés depuis la racine par
  `uv --directory pipeline run …` (`ruff check`, `ruff format --check`, `mypy`,
  `pytest -q -W error -rs`). `pipeline/scripts/dev-setup.sh` une fois, sinon des tests se sautent.
- Le schéma en vigueur : `sqlite3 pipeline/data/radio.db .schema`.
- Ne pas lancer `train` pendant `signals`.
- Un script de migration SQLite ne contient ni `BEGIN` ni `COMMIT` (`radio/core/db.py`, `_migrate`).
