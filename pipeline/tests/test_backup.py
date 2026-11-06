import sqlite3
from datetime import date
from pathlib import Path

import pytest
from typer.testing import CliRunner

import radio.cli as cli
from radio.core.backup import BackupError, backup
from radio.core.config import Settings
from radio.core.db import connect
from radio.core.report import last_stages
from tests.model_factory import add_vote, make_model_db

TODAY = date(2026, 10, 2)


def test_backup_is_a_sound_copy_and_keeps_only_recent_days(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path / "data")
    add_vote(conn, 200000, "lesson", "oui")
    models = tmp_path / "data" / "models"
    models.mkdir()
    (models / "modele-0001.joblib").write_bytes(b"m")
    dest = tmp_path / "sauvegardes"
    (dest / "2026-09-17").mkdir(parents=True)  # au-delà de 14 jours
    (dest / "2026-09-18").mkdir()

    target = backup(tmp_path / "data" / "radio.db", models, dest, TODAY, 14)

    assert target == dest / "2026-10-02"
    copy = sqlite3.connect(target / "radio.db")
    assert copy.execute("SELECT vote FROM votes").fetchall() == [("oui",)]
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    assert copy.execute("PRAGMA user_version").fetchone() == (version,)
    assert (target / "models" / "modele-0001.joblib").read_bytes() == b"m"
    assert sorted(p.name for p in dest.iterdir()) == ["2026-09-18", "2026-10-02"]
    assert dest.stat().st_mode & 0o777 == 0o700


def test_a_second_backup_the_same_day_replaces_the_first(tmp_path: Path) -> None:
    db = tmp_path / "radio.db"
    conn = connect(db)
    dest = tmp_path / "sauvegardes"
    backup(db, tmp_path / "absent", dest, TODAY, 14)
    conn.execute("INSERT INTO votes VALUES (1, 'lesson', 'non', 'd', 'test')")
    conn.commit()
    target = backup(db, tmp_path / "absent", dest, TODAY, 14)
    assert sqlite3.connect(target / "radio.db").execute(
        "SELECT COUNT(*) FROM votes"
    ).fetchone() == (1,)


def test_an_unsound_copy_is_refused_and_older_backups_are_kept(tmp_path: Path) -> None:
    # Breaks if a corrupt copy passes for a backup, or if it makes room by pruning the sound
    # ones: the copy keeps the defect of the source, so integrity_check must see it.
    db = tmp_path / "radio.db"
    conn = connect(db)
    conn.execute("INSERT INTO votes VALUES (1, 'lesson', 'non', 'd', 'test')")
    conn.commit()
    conn.close()
    broken = sqlite3.connect(db)
    broken.executescript(
        "CREATE TABLE t (a, b); CREATE INDEX t_a ON t (a); INSERT INTO t VALUES (1, 2);"
        "PRAGMA writable_schema = ON;"
        "UPDATE sqlite_master SET sql = 'CREATE INDEX t_a ON t (b)' WHERE name = 't_a';"
    )
    broken.close()
    models = tmp_path / "models"
    models.mkdir()
    dest = tmp_path / "sauvegardes"
    (dest / "2026-09-01").mkdir(parents=True)  # au-delà de 14 jours, mais la seule saine

    with pytest.raises(BackupError, match="integrity_check : row 1 missing from index t_a"):
        backup(db, models, dest, TODAY, 14)
    assert (dest / "2026-09-01").is_dir()
    assert not (dest / "2026-10-02" / "models").exists()


def test_backup_needs_a_destination(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(_env_file=None, RADIO_DATA_DIR=tmp_path)
    monkeypatch.setattr(cli.common, "_settings", lambda: settings)
    result = CliRunner().invoke(cli.app, ["backup"])
    assert result.exit_code == 2
    assert "RADIO_BACKUP_DIR" in result.output


def test_backup_reports_its_stage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    make_model_db(tmp_path / "data").close()
    settings = Settings(
        _env_file=None, RADIO_DATA_DIR=tmp_path / "data", RADIO_BACKUP_DIR=tmp_path / "copies"
    )
    monkeypatch.setattr(cli.common, "_settings", lambda: settings)
    assert CliRunner().invoke(cli.app, ["backup"]).exit_code == 0
    with cli.common._db(settings) as conn:
        assert [(s, ok) for s, _, ok, _ in last_stages(conn)] == [("backup", True)]


def test_a_failed_backup_reports_its_stage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    make_model_db(tmp_path / "data").close()
    blocked = tmp_path / "copies"
    blocked.write_text("un fichier là où la sauvegarde attend un dossier")
    settings = Settings(_env_file=None, RADIO_DATA_DIR=tmp_path / "data", RADIO_BACKUP_DIR=blocked)
    monkeypatch.setattr(cli.common, "_settings", lambda: settings)
    result = CliRunner().invoke(cli.app, ["backup"])
    assert result.exit_code == 1, result.output
    with cli.common._db(settings) as conn:
        assert [(s, ok) for s, _, ok, _ in last_stages(conn)] == [("backup", False)]
