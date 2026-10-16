"""L'exploitation : jugement de la passe, sauvegarde, rapport."""

import os
import sqlite3
from datetime import UTC, datetime

from radio.cli import common
from radio.cli.common import _db, _echo, _editorial, _fail, _n, _record, _stage, app
from radio.cli.votes import _status, _status_lines
from radio.core.backup import BackupError, backup
from radio.core.report import invocation_stages, last_stages
from radio.votes.suivi import load_suivi, suivi_lines


def _stage_lines(stages: list[tuple[str, str, bool, dict[str, object]]]) -> list[str]:
    return [
        f"{'  ' if ok else '✗ '}{stage} ({at[:16].replace('T', ' ')}) : "
        + ", ".join(f"{k} {v}" for k, v in counts.items())
        for stage, at, ok, counts in stages
    ]


# Étapes de deploy/systemd/radio-weekly.service, dans son ordre (un test les compare) : chacune
# doit avoir laissé sa ligne de rapport.
PASS_STAGES = (
    "library-sync",
    "discover",
    "nouveautes",
    "favoris",
    "signals",
    "train",
    "votes-select",
    "acquire",
    "antenne",
    "mesures",
    "grille",
)


@app.command()
def check() -> None:
    """Juge la passe systemd en cours : une étape en échec, ou aucune découverte publiée, la fait
    échouer (et Gatus alerte)."""
    invocation = os.environ.get("INVOCATION_ID")
    if not invocation:
        _fail("INVOCATION_ID absent : radio check juge une passe lancée par systemd", 2)
    with _db(common._settings()) as conn:
        stages = invocation_stages(conn, invocation)
    failed = [s for s, ok, _ in stages if not ok]
    missing = [s for s in PASS_STAGES if s not in {name for name, _, _ in stages}]
    published = sum(int(str(c.get("publiés", 0))) for s, _, c in stages if s == "antenne")
    _echo(
        [f"Passe : {_n(len(stages))} étapes, {_n(len(failed))} en échec, {_n(published)} publiés"]
    )
    if failed:
        _fail(f"Étapes en échec : {', '.join(failed)} (radio report)", 1)
    if missing:
        _fail(f"Étapes sans rapport (tuées ?) : {', '.join(missing)} (journal systemd)", 1)
    if published == 0:
        _fail("Aucune découverte publiée cette semaine (radio report)", 1)


@app.command("backup")
@_stage("backup")
def backup_command() -> None:
    """Copie la base (API de sauvegarde SQLite, vérifiée) et les modèles dans RADIO_BACKUP_DIR."""
    settings = common._settings()
    if settings.backup_dir is None:
        _fail("RADIO_BACKUP_DIR doit être défini dans .env", 2)
    try:
        target = backup(
            settings.data_dir / "radio.db",
            settings.data_dir / "models",
            settings.backup_dir,
            datetime.now(UTC).date(),
            _editorial(settings).backup.keep_days,
        )
    except (BackupError, sqlite3.Error, OSError) as e:
        _fail(f"Sauvegarde ratée : {e}", 1)
    with _db(settings) as conn:
        _record(conn, "backup", True, {"copie": target.name})
    _echo([f"Sauvegarde : {target}"])


@app.command()
def report() -> None:
    """État : dernières étapes, modèle en service, taux de oui, votes, dernière fournée."""
    settings = common._settings()
    editorial = _editorial(settings)
    with _db(settings) as conn:
        stages = last_stages(conn)
        suivi = load_suivi(conn, editorial.nouveautes)
    status = _status_lines(_status(settings, editorial), editorial.votes.quiet_days)
    _echo(["Dernières étapes :", *_stage_lines(stages), *status, *suivi_lines(suivi)])
