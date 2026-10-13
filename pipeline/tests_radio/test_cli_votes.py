import sqlite3
from pathlib import Path
from typing import Any

import pytest
import uvicorn
from pydantic import ValidationError
from typer.testing import CliRunner

import radio.cli as cli
from radio.core.config import Settings
from radio.core.report import record_stage
from radio.model.model import Batch, YesRate
from radio.notify.whatsapp import WhatsAppError
from radio.votes.status import Status
from tests_radio.model_factory import make_model_db, serve_scores

runner = CliRunner()
KEY = "cle-secrete-123"
PHONE = "+33600000000"


def _settings(tmp_path: Path, **extra: Any) -> Settings:
    cfg = tmp_path / "config"
    cfg.mkdir(exist_ok=True)
    (cfg / "editorial.toml").write_text("")
    return Settings(_env_file=None, RADIO_DATA_DIR=tmp_path / "data", RADIO_CONFIG_DIR=cfg, **extra)


@pytest.fixture
def full(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    s = _settings(
        tmp_path,
        cf_access_team_domain="aube.cloudflareaccess.com",
        cf_access_aud="aud-tag",
        whatsapp_phone=PHONE,
        callmebot_apikey=KEY,
        RADIO_VOTES_URL="https://votes.example.org",
    )
    monkeypatch.setattr(cli, "_settings", lambda: s)
    return tmp_path


def _st(**kw: Any) -> Status:
    base: dict[str, Any] = {
        "model_id": 3,
        "exam_auc": 0.8,
        "n_exam": 60,
        "yes": YesRate(48, 40, 0.70, 0.91),
        "last_exam_vote": "2026-09-20T10:00:00+00:00",
        "pending": 20,
        "last_selection": "2026-09-27T03:40:00+00:00",
        "stale_selection_days": 0,
        "recent_votes": 12,
        "batch": Batch(7, 400, 133),
    }
    base.update(kw)
    return Status(**base)


def test_status_lines() -> None:
    lines = cli._status_lines(_st(), 7)
    assert "Modèle n°3 : AUC d'examen 0,800 sur 60" in lines
    assert "Taux de oui des retenus : 83,3 % [70,0 % - 91,0 %] sur 48 votes d'examen" in lines
    assert "Dernière fournée (passe n°7) : 133 retenus sur 400 candidats" in lines
    none = cli._status_lines(_st(model_id=None, exam_auc=None, n_exam=0, yes=None), 7)
    assert none[:2] == [
        "Aucun modèle en service",
        "Taux de oui des retenus : aucun vote d'examen sur la page",
    ]


def test_status_lines_alert_when_the_weekly_pass_seems_to_have_failed() -> None:
    stale = cli._status_lines(_st(pending=0, stale_selection_days=8), 7)
    assert any(
        "ALERTE : aucune sélection depuis 8 jours (passe hebdomadaire en échec ?)" in line
        for line in stale
    )

    fresh = cli._status_lines(_st(pending=0, stale_selection_days=2), 7)
    assert not any("ALERTE : aucune sélection" in line for line in fresh)

    never = cli._status_lines(_st(pending=0, last_selection=None, stale_selection_days=None), 7)
    assert "ALERTE : aucune sélection encore tirée (passe hebdomadaire en échec ?)" in never

    waiting = cli._status_lines(_st(pending=20, stale_selection_days=8), 7)
    assert not any("ALERTE : aucune sélection" in line for line in waiting)


def test_votes_select_draws_then_waits(full: Path) -> None:
    conn = make_model_db(full / "data")
    serve_scores(conn)
    conn.close()
    res = runner.invoke(cli.app, ["votes-select"])
    assert res.exit_code == 0, res.output
    assert (
        "Sélection n°1 (modèle n°1, fournée n°2) : 10 d'examen parmi 48 titres de la fournée, "
        "10 de leçon" in res.output
    )
    res = runner.invoke(cli.app, ["votes-select"])
    assert res.exit_code == 0, res.output
    assert "20 titres encore en attente de vote : pas de nouvelle sélection" in res.output
    stages = (
        sqlite3.connect(full / "data" / "radio.db")
        .execute(
            "SELECT ok, counts FROM stage_reports WHERE stage = 'votes-select' ORDER BY report_id"
        )
        .fetchall()
    )
    assert stages == [
        (1, '{"examen": 10, "leçon": 10, "fournée": 48}'),
        (1, '{"en attente de vote": 20}'),
    ]


def test_votes_select_without_model_fails(full: Path) -> None:
    make_model_db(full / "data").close()
    res = runner.invoke(cli.app, ["votes-select"])
    assert res.exit_code == 1
    assert "Aucun modèle en service" in res.output
    row = (
        sqlite3.connect(full / "data" / "radio.db")
        .execute("SELECT ok, counts FROM stage_reports WHERE stage = 'votes-select'")
        .fetchone()
    )
    assert row == (0, '{"erreur": "Aucun modèle en service : lancer radio train"}')


def test_votes_serve_requires_access_settings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(cli, "_settings", lambda: _settings(tmp_path))
    res = runner.invoke(cli.app, ["votes-serve"])
    assert res.exit_code == 2
    assert "CF_ACCESS_TEAM_DOMAIN et CF_ACCESS_AUD" in res.output
    with pytest.raises(ValidationError):
        _settings(tmp_path, cf_access_team_domain="https://aube.fr", cf_access_aud="a")


def test_votes_serve_runs_uvicorn_on_loopback(full: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    def fake_run(app: Any, host: str, port: int) -> None:
        seen.update(app=app, host=host, port=port)

    monkeypatch.setattr(uvicorn, "run", fake_run)
    res = runner.invoke(cli.app, ["votes-serve"])
    assert res.exit_code == 0, res.output
    assert (seen["host"], seen["port"]) == ("127.0.0.1", 8040)
    assert seen["app"].title == "FastAPI"


def test_votes_remind_sends_the_status(full: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    make_model_db(full / "data").close()
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(cli, "send_whatsapp", lambda p, k, t: sent.append((p, k, t)))
    monkeypatch.setattr(cli, "_page_ok", lambda s: True)
    res = runner.invoke(cli.app, ["votes-remind"])
    assert res.exit_code == 0, res.output
    assert len(sent) == 1
    phone, key, text = sent[0]
    assert (phone, key) == (PHONE, KEY)
    assert text.startswith("AubeSonore : aucun titre en attente de vote")
    assert "/suivi (" in text  # lien du suivi et nombre de points à ajuster
    assert "Aucun modèle en service" in text
    assert "Rappel WhatsApp envoyé" in res.output
    assert KEY not in res.output and PHONE not in res.output


def test_votes_remind_failure_is_visible(full: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    make_model_db(full / "data").close()

    def refuse(p: str, k: str, t: str) -> None:
        raise WhatsAppError("HTTP 210 : quota CallMeBot épuisé (16 messages / 4 h)")

    monkeypatch.setattr(cli, "send_whatsapp", refuse)
    monkeypatch.setattr(cli, "_page_ok", lambda s: True)
    res = runner.invoke(cli.app, ["votes-remind"])
    assert res.exit_code == 1
    assert "Rappel WhatsApp non envoyé : HTTP 210" in res.output
    assert KEY not in res.output


def test_votes_remind_requires_its_settings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(cli, "_settings", lambda: _settings(tmp_path))
    res = runner.invoke(cli.app, ["votes-remind"])
    assert res.exit_code == 2
    assert "WHATSAPP_PHONE et CALLMEBOT_APIKEY" in res.output


def test_report_prints_the_status(full: Path) -> None:
    make_model_db(full / "data").close()
    res = runner.invoke(cli.app, ["report"])
    assert res.exit_code == 0, res.output
    assert "Aucun modèle en service" in res.output
    assert "Titres en attente de vote : 0 (dernière sélection : aucune)" in res.output


def test_report_shows_the_last_run_of_each_stage(full: Path) -> None:
    conn = make_model_db(full / "data")
    record_stage(conn, "discover", True, {"ajoutés": 3})
    record_stage(conn, "acquire", False, {"prêts": 0})
    record_stage(conn, "discover", True, {"ajoutés": 7})
    conn.close()
    res = runner.invoke(cli.app, ["report"])
    assert res.exit_code == 0, res.output
    lines = res.output.splitlines()
    assert lines[0] == "Dernières étapes :"
    assert lines[1].startswith("  discover (") and lines[1].endswith(") : ajoutés 7")
    assert lines[2].startswith("✗ acquire (")


def test_acquire_requires_the_radio_soulseek_account(full: Path) -> None:
    res = runner.invoke(cli.app, ["acquire"])
    assert res.exit_code == 2
    assert "SOULSEEK_USER et SOULSEEK_PASSWORD" in res.output
