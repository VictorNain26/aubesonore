import re
import subprocess
from pathlib import Path

import pytest

from radio.core.config import REPO_ROOT

DEPLOY = REPO_ROOT / "deploy"
HEARTBEAT = DEPLOY / "heartbeat.sh"


def _beat(tmp_path: Path, result: str | None) -> list[str]:
    """Lance heartbeat.sh avec un faux curl qui note ses arguments."""
    seen = tmp_path / "args"
    curl = tmp_path / "curl"
    curl.write_text(f'#!/bin/sh\nprintf "%s\\n" "$@" > {seen}\n')
    curl.chmod(0o755)
    env = {"PATH": f"{tmp_path}:/usr/bin:/bin", "GATUS_TOKEN": "jeton"}
    if result is not None:
        env["SERVICE_RESULT"] = result
    subprocess.run([str(HEARTBEAT), "radio_rappel"], env=env, check=True)
    return seen.read_text().splitlines()


@pytest.mark.parametrize(
    ("result", "query"),
    [
        ("success", "success=true&error=success"),
        ("exit-code", "success=false&error=exit-code"),
        (None, "success=false&error=inconnu"),
    ],
)
def test_heartbeat_reports_the_units_result(tmp_path: Path, result: str | None, query: str) -> None:
    args = _beat(tmp_path, result)
    assert "Authorization: Bearer jeton" in args
    assert args[-1] == f"http://127.0.0.1:8050/api/v1/endpoints/radio_rappel/external?{query}"


def test_every_unit_heartbeat_names_a_gatus_endpoint() -> None:
    # Un battement vers un endpoint que Gatus ne déclare pas répond 404 : l'unité n'est alors
    # jamais surveillée, sans que rien ne le signale (le rappel l'a été jusqu'au 2026-10-16).
    config = (DEPLOY / "gatus" / "config" / "config.yaml").read_text()
    external = config.split("external-endpoints:", 1)[1]
    declared = {
        f"{group}_{name}"
        for name, group in re.findall(r"^  - name: (\S+)\n    group: (\S+)$", external, re.M)
    }
    beats = {
        unit.name: re.findall(
            r"^ExecStopPost=-\S+/deploy/heartbeat\.sh (\S+)$", unit.read_text(), re.M
        )
        for unit in (DEPLOY / "systemd").glob("*.service")
    }
    assert {u: b for u, b in beats.items() if b} == {
        "radio-backup.service": ["radio_sauvegarde"],
        "radio-grille.service": ["radio_grille"],
        "radio-remind.service": ["radio_rappel"],
        "radio-weekly.service": ["radio_passe-hebdo"],
    }
    assert {b for bs in beats.values() for b in bs} <= declared
