"""Copie quotidienne de la base et des modèles sur un autre disque (docs/conception.md §9).

La base est copiée par l'API de sauvegarde de SQLite, cohérente même pendant une écriture
(https://docs.python.org/3/library/sqlite3.html#sqlite3.Connection.backup), puis vérifiée.
"""

import shutil
import sqlite3
from contextlib import closing
from datetime import date, timedelta
from pathlib import Path


class BackupError(Exception):
    """La copie n'est pas une base saine."""


def backup(db: Path, models: Path, dest: Path, today: date, keep_days: int) -> Path:
    target = dest / today.isoformat()
    target.mkdir(parents=True, exist_ok=True)
    dest.chmod(0o700)
    copy = target / "radio.db"
    copy.unlink(missing_ok=True)
    with closing(sqlite3.connect(db)) as src, closing(sqlite3.connect(copy)) as dst:
        src.backup(dst)
        check = dst.execute("PRAGMA integrity_check").fetchone()[0]
    if check != "ok":
        raise BackupError(f"integrity_check : {check}")
    if models.exists():
        shutil.copytree(models, target / "models", dirs_exist_ok=True)
    oldest = (today - timedelta(days=keep_days)).isoformat()
    for old in dest.iterdir():
        if old.is_dir() and old.name < oldest:
            shutil.rmtree(old)
    return target
