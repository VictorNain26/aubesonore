"""L'exploitation : jugement de la passe, sauvegarde, rapport, alerte."""

import os
import smtplib
import sqlite3
import ssl
import subprocess
from datetime import UTC, datetime
from email.message import EmailMessage
from email.utils import format_datetime

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
    échouer (l'unité radio-weekly est alors en échec)."""
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
# Sans le verrou des commandes : la copie est cohérente même pendant une écriture
# (radio/core/backup.py), et la sauvegarde garde son heure, même pendant la passe du dimanche.
@_stage("backup", exclusive=False)
def backup_command() -> None:
    """Copie la base (API de sauvegarde SQLite, vérifiée) et les modèles dans RADIO_BACKUP_DIR."""
    settings = common._settings()
    if settings.backup_dir is None:
        _fail("RADIO_BACKUP_DIR doit être défini dans .env", 2)
    try:
        target = backup(
            settings.db_path,
            settings.trained_models_dir,
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


@app.command()
def alert(unit: str) -> None:
    """Envoie à ALERT_EMAIL_TO le courriel d'une unité en échec, avec la fin de son journal
    (lancée par radio-alert@.service, l'OnFailure= des unités du pipeline). Sans relais
    configuré, ou s'il refuse le courriel, elle échoue : une alerte perdue ne se tait pas."""
    settings = common._settings()
    host, sender, to = settings.smtp_host, settings.smtp_from, settings.alert_email_to
    if host is None or sender is None or to is None:
        required = (("SMTP_HOST", host), ("SMTP_FROM", sender), ("ALERT_EMAIL_TO", to))
        missing = ", ".join(name for name, value in required if value is None)
        _fail(f"Alerte {unit} non envoyée : {missing} à définir dans .env", 2)
    journal = subprocess.run(
        ["journalctl", "--user", "-u", unit, "-n", "50", "--no-pager", "-o", "cat"],
        capture_output=True,
        text=True,
        check=False,
    )
    now = datetime.now().astimezone()
    msg = EmailMessage()
    msg["Subject"] = f"AubeSonore : {unit} en échec"
    msg["From"] = sender
    msg["To"] = to
    msg["Date"] = format_datetime(now)
    msg.set_content(
        f"{unit} est en échec depuis le {now:%Y-%m-%d à %H:%M %Z}.\n"
        f"Où regarder : systemctl --user status {unit}, journalctl --user -u {unit}, "
        "radio report (docs/conception.md §8.2).\n\n"
        f"Fin du journal :\n\n{journal.stdout or journal.stderr or '(vide)'}"
    )
    # Le site se connecte de même (site/apps/backend/src/services/mailerService.ts).
    implicit_tls = settings.smtp_port == 465
    context = ssl.create_default_context()
    try:
        smtp = (
            smtplib.SMTP_SSL(host, settings.smtp_port, timeout=60, context=context)
            if implicit_tls
            else smtplib.SMTP(host, settings.smtp_port, timeout=60)
        )
        with smtp:
            if not implicit_tls:
                smtp.starttls(context=context)
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password.get_secret_value())
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as e:
        _fail(f"Alerte {unit} non envoyée : {e}", 1)
    _echo([f"Alerte {unit} envoyée à ALERT_EMAIL_TO"])
