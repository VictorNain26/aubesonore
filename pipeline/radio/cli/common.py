"""Ce que partagent les commandes : l'application Typer, l'étape qui écrit son rapport même en
échec, la lecture de la configuration et la mise en forme des nombres."""

import functools
import logging
import os
import sqlite3
import sys
from collections.abc import Callable
from contextlib import closing
from datetime import UTC, datetime
from typing import NoReturn, ParamSpec, TypeVar

import typer
from pydantic import ValidationError

from radio.core.config import Editorial, Settings, load_editorial
from radio.core.db import connect
from radio.core.report import record_stage
from radio.model.model import (
    Batch,
)
from radio.sources.deezer import DeezerUnavailable
from radio.sources.lastfm import LastfmClient

app = typer.Typer(no_args_is_help=True, add_completion=False)

_P = ParamSpec("_P")
_R = TypeVar("_R")
_last_error: str | None = None
_stage_recorded = False


def _fail(message: str, code: int) -> NoReturn:
    global _last_error
    _last_error = message
    typer.echo(message, err=True)
    raise typer.Exit(code)


def _record(conn: sqlite3.Connection, stage: str, ok: bool, counts: dict[str, object]) -> None:
    global _stage_recorded
    record_stage(conn, stage, ok, counts)
    _stage_recorded = True


def _record_failure(stage: str, error: str) -> None:
    try:
        settings = _settings()
    except typer.Exit:
        return  # .env invalide : pas de base où écrire, le message est déjà sorti
    with _db(settings) as conn:
        record_stage(conn, stage, False, {"erreur": error})


def _stage(name: str) -> Callable[[Callable[_P, _R]], Callable[_P, _R]]:
    """Une étape de la passe qui échoue écrit quand même sa ligne de rapport (§8.1). D'une
    exception imprévue, seul le type est gardé : son message peut porter une URL signée."""

    def wrap(fn: Callable[_P, _R]) -> Callable[_P, _R]:
        @functools.wraps(fn)
        def run(*args: _P.args, **kwargs: _P.kwargs) -> _R:
            global _last_error, _stage_recorded
            _last_error, _stage_recorded = None, False
            try:
                return fn(*args, **kwargs)
            except typer.Exit as e:
                if e.exit_code != 0 and not _stage_recorded:
                    _record_failure(name, _last_error or f"code {e.exit_code}")
                raise
            except Exception as e:
                if not _stage_recorded:
                    _record_failure(name, type(e).__name__)
                raise

        return run

    return wrap


def _n(x: int) -> str:
    return f"{x:,}".replace(",", "\u202f")  # espace fine insécable


def _rate(x: float) -> str:
    return f"{100 * x:.1f} %".replace(".", ",")


def _pct(a: int, b: int) -> str:
    return _rate(a / b if b else 0.0)


def _dec(x: float | None) -> str:
    return "—" if x is None else f"{x:.3f}".replace(".", ",")


def _echo(lines: list[str]) -> None:
    for line in lines:
        typer.echo(line)


def _settings() -> Settings:
    try:
        return Settings()
    except ValidationError as e:
        _fail(f".env invalide : {', '.join(str(x['loc'][0]) for x in e.errors())}", 2)


def _editorial(settings: Settings) -> Editorial:
    return load_editorial(settings.config_dir / "editorial.toml")


def _db(settings: Settings) -> closing[sqlite3.Connection]:
    return closing(connect(settings.db_path))


def _lastfm(settings: Settings) -> LastfmClient:
    if settings.lastfm_api_key is None:
        _fail("LASTFM_API_KEY doit être défini dans .env", 2)
    return LastfmClient(settings.lastfm_api_key.get_secret_value())


def _unavailable(e: Exception) -> str:
    source = "Deezer" if isinstance(e, DeezerUnavailable) else "Last.fm"
    return f"{source} indisponible ({e}) : le travail fait est gardé, relancer plus tard"


def _now() -> str:
    return datetime.now(UTC).isoformat()


@app.callback()
def main() -> None:
    """AubeSonore — goût, découverte, acquisition, antenne et votes."""
    # Sous systemd, journald date déjà chaque ligne.
    stamp = "" if os.environ.get("INVOCATION_ID") else "%(asctime)s "
    logging.basicConfig(
        level=logging.INFO, stream=sys.stderr, format=f"{stamp}%(levelname)s %(message)s"
    )
    # À WARNING, urllib3 peut journaliser l'URL complète, clé Last.fm comprise.
    logging.getLogger("urllib3").setLevel(logging.ERROR)


def _batch_line(b: Batch) -> str:
    line = (
        f"Dernière fournée (passe n°{b.run_id}) : {_n(b.retained)} retenus sur {_n(b.n)} candidats"
    )
    if b.floored:
        line += f", {_n(b.floored)} nouveautés écartées sous le plancher de score"
    return line
