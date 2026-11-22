import ast
import logging
import shutil
import sqlite3
import threading
import time
from pathlib import Path

import pytest
import requests
from pydantic import ValidationError

from radio.socle.config import REPO_ROOT, Settings, load_editorial
from radio.socle.db import MIGRATIONS, connect
from radio.socle.http import check_status, log_retry

N_MIGRATIONS = len(list(MIGRATIONS.glob("*.sql")))


def test_connect_applies_migrations(tmp_path: Path) -> None:
    conn = connect(tmp_path / "radio.db")
    assert conn.execute("PRAGMA user_version").fetchone()[0] == N_MIGRATIONS
    names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"library_tracks", "deezer_matches"} <= names
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    conn.close()
    # Rouvrir une base à jour ne rejoue aucune migration (un CREATE TABLE rejoué lèverait).
    again = connect(tmp_path / "radio.db")
    assert again.execute("PRAGMA user_version").fetchone()[0] == N_MIGRATIONS
    again.close()


def test_the_stage_reports_take_the_new_stage_names(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Breaks if a stage keeps its old name in stage_reports: `radio rapport` would show it next
    # to the new one, and `radio bilan` would not count it in its pass.
    before = tmp_path / "migrations"
    before.mkdir()
    for script in sorted(MIGRATIONS.glob("*.sql"))[:16]:
        shutil.copy(script, before)
    monkeypatch.setattr("radio.socle.db.MIGRATIONS", before)
    db = tmp_path / "radio.db"
    with connect(db) as conn:
        conn.executemany(
            "INSERT INTO stage_reports (invocation, stage, finished_at, ok, counts) "
            "VALUES ('passe', ?, 't', 1, '{}')",
            [(s,) for s in ("library-sync", "votes-select", "acquire", "antenne", "check")],
        )
    conn.close()
    monkeypatch.setattr("radio.socle.db.MIGRATIONS", MIGRATIONS)
    conn = connect(db)
    stages = [r[0] for r in conn.execute("SELECT stage FROM stage_reports ORDER BY report_id")]
    assert stages == ["bibliotheque", "tirage", "telechargement", "antenne", "bilan"]
    conn.close()


def test_a_migration_that_breaks_a_foreign_key_is_rolled_back(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Breaks if a rebuild that loses a parent row is committed: the keys are off during a
    # migration (official table rebuild), so only foreign_key_check sees the orphan.
    scripts = tmp_path / "migrations"
    shutil.copytree(MIGRATIONS, scripts)
    monkeypatch.setattr("radio.socle.db.MIGRATIONS", scripts)
    db = tmp_path / "radio.db"
    connect(db).close()
    name = f"{N_MIGRATIONS + 1:03d}_orpheline.sql"
    (scripts / name).write_text(
        "INSERT INTO deezer_matches VALUES ('absente', 'matched', NULL, 1, 1, 'd');",
        encoding="utf-8",
    )
    with pytest.raises(sqlite3.IntegrityError, match=f"clés étrangères rompues par {name}"):
        connect(db)
    raw = sqlite3.connect(db)
    assert raw.execute("PRAGMA user_version").fetchone()[0] == N_MIGRATIONS
    assert raw.execute("SELECT COUNT(*) FROM deezer_matches").fetchone()[0] == 0
    raw.close()


def test_failed_migration_leaves_nothing_behind(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    migrations = tmp_path / "migrations"
    migrations.mkdir()
    script = migrations / "001_test.sql"
    script.write_text("CREATE TABLE partial (x INTEGER);\nINSERT INTO missing VALUES (1);\n")
    monkeypatch.setattr("radio.socle.db.MIGRATIONS", migrations)
    db = tmp_path / "radio.db"

    with pytest.raises(sqlite3.OperationalError):
        connect(db)

    check = sqlite3.connect(db)
    names = {r[0] for r in check.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "partial" not in names
    assert check.execute("PRAGMA user_version").fetchone()[0] == 0
    check.close()

    script.write_text("CREATE TABLE partial (x INTEGER);\nINSERT INTO partial VALUES (1);\n")
    conn = connect(db)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 1
    assert [tuple(r) for r in conn.execute("SELECT x FROM partial")] == [(1,)]
    conn.close()


def test_a_migration_running_in_another_process_is_not_replayed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Breaks if user_version is read outside the write lock: the vote page and a pass that start
    # on new code both see the migration pending, and the later one replays it or fails.
    migrations = tmp_path / "migrations"
    migrations.mkdir()
    (migrations / "001_t.sql").write_text("CREATE TABLE t (x INTEGER);\n")
    monkeypatch.setattr("radio.socle.db.MIGRATIONS", migrations)
    db = tmp_path / "radio.db"
    connect(db).close()
    (migrations / "002_ligne.sql").write_text("INSERT INTO t VALUES (2);\n")

    other = sqlite3.connect(db, isolation_level=None)
    other.execute("BEGIN IMMEDIATE")
    other.execute("INSERT INTO t VALUES (2)")
    other.execute("PRAGMA user_version = 2")
    outcome: list[object] = []

    def late() -> None:
        try:
            connect(db).close()
            outcome.append("ok")
        except sqlite3.Error as e:
            outcome.append(e)

    second = threading.Thread(target=late)
    second.start()
    time.sleep(0.5)  # it sees version 1 and waits for the write lock
    other.execute("COMMIT")
    other.close()
    second.join()

    assert outcome == ["ok"]
    check = sqlite3.connect(db)
    assert check.execute("SELECT x FROM t").fetchall() == [(2,)]
    assert check.execute("PRAGMA user_version").fetchone()[0] == 2
    check.close()


def test_match_row_consistency_is_enforced(tmp_path: Path) -> None:
    conn = connect(tmp_path / "radio.db")
    conn.execute(
        "INSERT INTO library_tracks VALUES ('k1', 'A', 'T', 'Al', 200000, 0, '2026-09-24', NULL)"
    )
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO deezer_matches VALUES ('k1', 'matched', NULL, NULL, NULL, '2026-09-24')"
        )


def test_only_a_neighbour_candidate_has_a_seed(tmp_path: Path) -> None:
    conn = connect(tmp_path / "radio.db")
    conn.execute("INSERT INTO artists VALUES (1, 'A')")
    conn.execute("INSERT INTO discover_runs VALUES (1, 'd', 'd', 'done')")
    for tid in (1, 2):
        conn.execute("INSERT INTO tracks VALUES (?, 1, 'T', 'candidate', ?, 'd')", (tid, f"k{tid}"))
    conn.execute("INSERT INTO candidates VALUES (1, 1, 'hypem', NULL, NULL, 'blog')")
    with pytest.raises(sqlite3.IntegrityError, match="CHECK"):
        conn.execute("INSERT INTO candidates VALUES (2, 1, 'hypem', 83, 1, 'blog')")


def test_editorial_loads_and_validates(tmp_path: Path) -> None:
    p = tmp_path / "editorial.toml"
    p.write_text("[library]\nduration_tolerance_s = 3\n")
    assert load_editorial(p).library.duration_tolerance_s == 3
    p.write_text("[library]\nduration_tolerance_s = 60\n")
    with pytest.raises(ValidationError):
        load_editorial(p)


def test_shipped_editorial_is_valid() -> None:
    load_editorial(REPO_ROOT / "config" / "editorial.toml")


def test_env_example_copied_as_is_gives_the_defaults() -> None:
    s = Settings(_env_file=REPO_ROOT / ".env.example")
    assert s.plex_token is None and s.lastfm_api_key is None
    assert s.cf_access_team_domain is None
    assert s.azuracast_media_dir == Settings.model_fields["azuracast_media_dir"].default


def test_retry_hook_logs_no_arguments(caplog: pytest.LogCaptureFixture) -> None:
    class Details:
        name = "radio.sources.lastfm.LastfmClient._call"
        caused_by = RuntimeError("https://x?api_key=SECRET")
        retry_num = 2
        args = ("SECRET",)
        kwargs = {"api_key": "SECRET"}  # noqa: RUF012

    with caplog.at_level(logging.WARNING):
        log_retry(Details())  # type: ignore[arg-type]
    assert "SECRET" not in caplog.text
    assert "RuntimeError" in caplog.text and "attempt 2" in caplog.text


def test_tests_never_reach_the_real_data_dir() -> None:
    assert Settings(_env_file=None).data_dir != REPO_ROOT / "data"


def test_paths_derive_from_the_two_directories(tmp_path: Path) -> None:
    # Les modèles entraînés vivent sous data_dir, à part des poids MTG de models_dir : une
    # sauvegarde de data_dir les emporte, un retéléchargement des poids ne les touche pas.
    s = Settings(_env_file=None, RADIO_DATA_DIR=tmp_path / "data", RADIO_MODELS_DIR=tmp_path / "w")
    assert s.db_path == tmp_path / "data" / "radio.db"
    assert s.trained_models_dir == tmp_path / "data" / "models"
    assert s.effnet_model == tmp_path / "w" / "discogs-effnet-bs64-1.pb"


class _Down(Exception):
    pass


class _Refused(Exception):
    pass


@pytest.mark.parametrize(
    ("status", "raised"),
    [(200, None), (204, None), (404, _Refused), (413, _Refused), (429, _Down), (500, _Down)],
)
def test_check_status_sorts_outages_from_refusals(
    status: int, raised: type[Exception] | None
) -> None:
    r = requests.Response()
    r.status_code = status
    if raised is None:
        check_status(r, _Down, _Refused)
        return
    with pytest.raises(raised, match=f"^HTTP {status}$"):
        check_status(r, _Down, _Refused)


def test_core_imports_no_other_layer() -> None:
    # core est la couche du bas : les sources, l'acquisition, l'antenne et le modèle s'appuient
    # sur elle, jamais l'inverse.
    upward = {
        f"{path.name}: {name}"
        for path in (REPO_ROOT / "radio" / "core").glob("*.py")
        for node in ast.walk(ast.parse(path.read_text()))
        if isinstance(node, ast.Import | ast.ImportFrom)
        for name in (
            [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
        )
        if name.startswith("radio.") and not name.startswith("radio.socle")
    }
    assert upward == set()
