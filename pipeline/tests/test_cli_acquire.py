import sqlite3
from collections import Counter
from pathlib import Path
from typing import Any

import pytest
from pydantic import SecretStr
from typer.testing import CliRunner

import radio.commandes as commandes
from radio.antenne.publication import RapportAntenne
from radio.socle.config import REPO_ROOT, Settings
from radio.telechargement.sockseek import SockseekError
from radio.telechargement.telecharger import RapportTelechargement

runner = CliRunner()


def _env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, editorial: str = "") -> Path:
    cfg = tmp_path / "config"
    cfg.mkdir()
    (cfg / "editorial.toml").write_text(editorial)
    settings = Settings(
        _env_file=None,
        soulseek_user="radio",
        soulseek_password="pw",
        RUNTIME_DIRECTORY=tmp_path,
        RADIO_DATA_DIR=tmp_path / "data",
        RADIO_CONFIG_DIR=cfg,
    )
    monkeypatch.setattr(commandes.commun, "_settings", lambda: settings)
    return tmp_path / "data" / "radio.db"


def _stage(db: Path) -> tuple[int, str] | None:
    rows = sqlite3.connect(db).execute("SELECT ok, counts FROM rapports").fetchall()
    assert len(rows) <= 1  # une seule ligne par étape, même quand elle enregistre puis échoue
    return None if not rows else (int(rows[0][0]), str(rows[0][1]))


def _report(rep: RapportTelechargement) -> Any:
    return lambda *a, **k: rep


def test_sockseek_failure_exits_1_and_reports_the_failed_stage(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = _env(tmp_path, monkeypatch)

    def boom(*a: Any, **k: Any) -> RapportTelechargement:
        raise SockseekError("aucun index écrit")

    monkeypatch.setattr(commandes.telechargement, "telecharger_fournee", boom)
    result = runner.invoke(commandes.app, ["telechargement"])
    assert result.exit_code == 1
    assert "Sockseek en échec (aucun index écrit) : aucune tentative comptée" in result.output
    stage = _stage(db)
    assert stage is not None and stage[0] == 0 and "Sockseek en échec" in stage[1]


def test_interrupted_sockseek_fails_the_stage(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = _env(tmp_path, monkeypatch)
    rep = RapportTelechargement(n_wanted=4, n_ready=1, n_unindexed=3)
    monkeypatch.setattr(commandes.telechargement, "telecharger_fournee", _report(rep))
    result = runner.invoke(commandes.app, ["telechargement"])
    assert result.exit_code == 1
    assert "arrêté avant 3 titres" in result.output
    stage = _stage(db)
    assert stage is not None and stage[0] == 0 and '"non tentés": 3' in stage[1]


def test_success_rate_floor_comes_from_editorial(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _env(tmp_path, monkeypatch, "[telechargement]\ntentatives_min_pour_taux = 3\n")
    rep = RapportTelechargement(n_wanted=3, failures=Counter({"aucun résultat": 3}))
    monkeypatch.setattr(commandes.telechargement, "telecharger_fournee", _report(rep))
    assert runner.invoke(commandes.app, ["telechargement"]).exit_code == 1


def test_missing_cover_is_reported_not_failed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = _env(tmp_path, monkeypatch)
    rep = RapportTelechargement(n_wanted=2, n_ready=2, n_no_cover=1)
    monkeypatch.setattr(commandes.telechargement, "telecharger_fournee", _report(rep))
    result = runner.invoke(commandes.app, ["telechargement"])
    assert result.exit_code == 0
    assert "prêts sans pochette : 1" in result.output
    stage = _stage(db)
    assert stage is not None and stage[0] == 1 and '"sans pochette": 1' in stage[1]


def test_an_unexpected_error_is_reported_without_its_message(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = _env(tmp_path, monkeypatch)

    def boom(*a: Any, **k: Any) -> RapportTelechargement:
        raise RuntimeError("https://cdn.example/preview?hdnea=SECRET")

    monkeypatch.setattr(commandes.telechargement, "telecharger_fournee", boom)
    result = runner.invoke(commandes.app, ["telechargement"])
    assert result.exit_code == 1
    assert _stage(db) == (0, '{"erreur": "RuntimeError"}')


def _stages(db: Path, rows: list[tuple[str, str, int, str]]) -> None:
    conn = sqlite3.connect(db)
    conn.executemany(
        "INSERT INTO rapports (invocation, stage, finished_at, ok, counts) "
        "VALUES (?, ?, 'd', ?, ?)",
        rows,
    )
    conn.commit()


def _pass(**over: tuple[int, str]) -> list[tuple[str, str, int, str]]:
    stages = {name: (1, "{}") for name in commandes.exploitation.PASS_STAGES} | {
        "antenne": (1, '{"publiés": 3}')
    }
    stages |= {k.replace("_", "-"): v for k, v in over.items()}
    return [("p", name, ok, counts) for name, (ok, counts) in stages.items()]


@pytest.mark.parametrize(
    ("rows", "code", "message"),
    [
        (_pass(), 0, "11 étapes, 0 en échec, 3 publiés"),
        (_pass(telechargement=(0, "{}")), 1, "Étapes en échec : telechargement"),
        (_pass(antenne=(1, '{"publiés": 0}')), 1, "Aucune découverte publiée"),
        (
            [r for r in _pass() if r[1] != "telechargement"],
            1,
            "Étapes sans rapport (tuées ?) : telechargement",
        ),
        ([("autre", "telechargement", 0, "{}"), *_pass()], 0, ""),
    ],
)
def test_check_judges_only_the_current_pass(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    rows: list[tuple[str, str, int, str]],
    code: int,
    message: str,
) -> None:
    db = _env(tmp_path, monkeypatch)
    runner.invoke(commandes.app, ["rapport"])  # crée la base
    _stages(db, rows)
    monkeypatch.setenv("INVOCATION_ID", "p")
    result = runner.invoke(commandes.app, ["bilan"])
    assert result.exit_code == code
    assert message in result.output


def test_check_reads_what_antenne_published(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = _env(tmp_path, monkeypatch)
    settings = commandes.commun._settings().model_copy(update={"azuracast_api_key": SecretStr("k")})
    monkeypatch.setattr(commandes.commun, "_settings", lambda: settings)
    monkeypatch.setattr(
        commandes.antenne, "tenir_antenne", lambda *a, **k: RapportAntenne(n_published=2)
    )
    monkeypatch.setenv("INVOCATION_ID", "p")
    result = runner.invoke(commandes.app, ["antenne"])
    assert result.exit_code == 0, result.output
    assert "Antenne : 0 titres (2 publiés" in result.output
    _stages(db, [r for r in _pass() if r[1] != "antenne"])
    result = runner.invoke(commandes.app, ["bilan"])
    assert result.exit_code == 0, result.output
    assert "11 étapes, 0 en échec, 2 publiés" in result.output


def test_check_needs_systemd(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _env(tmp_path, monkeypatch)
    monkeypatch.delenv("INVOCATION_ID", raising=False)
    assert runner.invoke(commandes.app, ["bilan"]).exit_code == 2


def test_pass_stages_are_the_weekly_units_commands() -> None:
    # check juge la passe sur PASS_STAGES : une étape ajoutée à l'unité sans y figurer ne
    # serait jamais vérifiée, une étape retirée de l'unité la ferait échouer chaque semaine.
    unit = (REPO_ROOT / "deploy" / "systemd" / "radio-passe.service").read_text()
    commands = tuple(
        line.split("/bin/radio ", 1)[1].split()[0]
        for line in unit.splitlines()
        if line.startswith("ExecStart=")
    )
    assert commands == (*commandes.exploitation.PASS_STAGES, "bilan")
