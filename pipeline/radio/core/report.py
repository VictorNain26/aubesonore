"""Rapports d'étape (docs/conception.md §8.1) : une ligne par étape et par passe."""

import json
import os
import sqlite3
from datetime import UTC, datetime


def record_stage(conn: sqlite3.Connection, stage: str, ok: bool, counts: dict[str, object]) -> None:
    with conn:
        conn.execute(
            "INSERT INTO stage_reports (invocation, stage, finished_at, ok, counts) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                os.environ.get("INVOCATION_ID"),
                stage,
                datetime.now(UTC).isoformat(),
                int(ok),
                json.dumps(counts, ensure_ascii=False),
            ),
        )


def last_stages(conn: sqlite3.Connection) -> list[tuple[str, str, bool, dict[str, object]]]:
    """Dernier rapport de chaque étape : (étape, fin, réussie, compteurs), du plus récent au plus
    ancien."""
    rows = conn.execute(
        """
        SELECT stage, finished_at, ok, counts FROM stage_reports
        WHERE report_id IN (SELECT MAX(report_id) FROM stage_reports GROUP BY stage)
        ORDER BY report_id DESC
        """
    ).fetchall()
    return [(str(r[0]), str(r[1]), bool(r[2]), json.loads(r[3])) for r in rows]


def invocation_stages(
    conn: sqlite3.Connection, invocation: str
) -> list[tuple[str, bool, dict[str, object]]]:
    """Rapports des étapes d'une passe systemd, dans l'ordre : (étape, réussie, compteurs)."""
    rows = conn.execute(
        "SELECT stage, ok, counts FROM stage_reports WHERE invocation = ? ORDER BY report_id",
        (invocation,),
    ).fetchall()
    return [(str(r[0]), bool(r[1]), json.loads(r[2])) for r in rows]
