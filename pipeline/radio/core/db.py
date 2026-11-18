"""SQLite : connexion et migrations numérotées (PRAGMA user_version)."""

import sqlite3
from pathlib import Path

MIGRATIONS = Path(__file__).parent / "migrations"


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    _migrate(conn)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """Clés étrangères coupées pendant les migrations et vérifiées avant validation : procédure
    officielle de reconstruction de table (https://www.sqlite.org/lang_altertable.html#otheralter).
    Un script ne contient ni BEGIN ni COMMIT : schéma et user_version passent ensemble.

    La page de vote et une commande peuvent ouvrir la base en même temps : user_version est relu
    sous le verrou d'écriture (BEGIN IMMEDIATE, https://www.sqlite.org/lang_transaction.html), et
    le second processus attend puis trouve la migration faite au lieu de la rejouer."""
    current = conn.execute("PRAGMA user_version").fetchone()[0]
    for script in sorted(MIGRATIONS.glob("*.sql")):
        version = int(script.name.split("_", 1)[0])
        if version <= current:
            continue
        sql = script.read_text(encoding="utf-8")
        # Sans autocommit, executescript validerait d'abord la transaction de BEGIN IMMEDIATE
        # (https://docs.python.org/3/library/sqlite3.html#sqlite3.Cursor.executescript).
        conn.autocommit = True
        try:
            conn.execute("BEGIN IMMEDIATE")
            current = conn.execute("PRAGMA user_version").fetchone()[0]
            if version > current:
                conn.executescript(f"{sql}\nPRAGMA user_version = {version};")
                if conn.execute("PRAGMA foreign_key_check").fetchone() is not None:
                    raise sqlite3.IntegrityError(f"clés étrangères rompues par {script.name}")
            conn.execute("COMMIT")
        except sqlite3.Error:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise
        finally:
            conn.autocommit = sqlite3.LEGACY_TRANSACTION_CONTROL
