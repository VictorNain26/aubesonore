import logging
from collections.abc import Callable
from pathlib import Path

import pytest
import requests
from plexapi.exceptions import Unauthorized
from typer.testing import CliRunner

import radio.cli as cli
from radio.core.config import Settings
from radio.core.report import last_stages
from radio.signals.audio import ModelError
from radio.sources.deezer import DeezerArtist, DeezerTrack, DeezerUnavailable
from radio.sources.lastfm import LastfmUnavailable
from radio.sources.plex import LibraryGuardError, PlexTrack
from tests_radio.factories import make_library

runner = CliRunner()


class FakePlex:
    def __init__(self, tracks: list[PlexTrack]) -> None:
        self._tracks = tracks

    def tracks(self) -> list[PlexTrack]:
        return self._tracks


class FakeDeezer:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail

    def search_tracks(self, query: str, limit: int = 10) -> list[DeezerTrack]:
        if self.fail:
            raise DeezerUnavailable("code 4")
        if "Mannequin" in query:
            return [DeezerTrack(7, "Mannequin", "Mannequin", 157, 1, 70, "Wire", True)]
        return []


@pytest.fixture
def env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    cfg = tmp_path / "config"
    cfg.mkdir()
    (cfg / "editorial.toml").write_text("[library]\nduration_tolerance_s = 3\n")
    settings = Settings(
        _env_file=None,
        plex_token="tok",
        plex_music_section="Musique",
        RADIO_DATA_DIR=tmp_path / "data",
        RADIO_CONFIG_DIR=cfg,
    )
    monkeypatch.setattr(cli, "_settings", lambda: settings)
    return tmp_path


def test_library_sync_end_to_end(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    tracks = [
        PlexTrack("1", "Wire", "Mannequin", "Pink Flag", 157000, 2),
        PlexTrack("2", "Wire", "Nope", "Pink Flag", 100000, 0),
    ]
    monkeypatch.setattr(cli, "PlexSource", lambda *a: FakePlex(tracks))
    monkeypatch.setattr(cli, "DeezerClient", lambda: FakeDeezer())
    res = runner.invoke(cli.app, ["library-sync"])
    assert res.exit_code == 0, res.output
    assert "Bibliothèque Plex : 2 titres (2 ajoutés, 0 modifiés, 0 retirés)" in res.stdout
    assert (
        "Rapprochement Deezer : 2 à traiter → 1 trouvés, 1 non trouvés (sans résultat 1), "
        "0 en erreur" in res.stdout
    )
    assert "Couverture : 1 / 2 titres rapprochés (50,0 %)" in res.stdout
    assert (env / "data" / "radio.db").exists()


def test_missing_config_exits_2(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        cli, "_settings", lambda: Settings(_env_file=None, RADIO_CONFIG_DIR=env / "config")
    )
    res = runner.invoke(cli.app, ["library-sync"])
    assert res.exit_code == 2
    assert "PLEX_TOKEN" in res.output


def test_deezer_unavailable_exits_1(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        cli,
        "PlexSource",
        lambda *a: FakePlex([PlexTrack("1", "Wire", "Mannequin", "P", 157000, 0)]),
    )
    monkeypatch.setattr(cli, "DeezerClient", lambda: FakeDeezer(fail=True))
    res = runner.invoke(cli.app, ["library-sync"])
    assert res.exit_code == 1
    assert "Deezer indisponible" in res.output


def test_thousands_are_formatted_in_french() -> None:
    assert cli._n(3424) == "3\u202f424"
    assert cli._pct(2900, 3424) == "84,7 %"


def _raise(exc: Exception) -> Callable[..., FakePlex]:
    def plex(*args: object) -> FakePlex:
        raise exc

    return plex


def test_library_guard_error_exits_2(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "PlexSource", _raise(LibraryGuardError("section interdite : X")))
    res = runner.invoke(cli.app, ["library-sync"])
    assert res.exit_code == 2
    assert "Bibliothèque refusée : section interdite : X" in res.output


def test_plex_error_exits_1_with_type_name(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "PlexSource", _raise(Unauthorized("(401) unauthorized")))
    res = runner.invoke(cli.app, ["library-sync"])
    assert res.exit_code == 1
    assert "Plex en erreur (Unauthorized)" in res.output


def test_empty_library_exits_1(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "PlexSource", lambda *a: FakePlex([]))
    monkeypatch.setattr(cli, "DeezerClient", lambda: FakeDeezer())
    res = runner.invoke(cli.app, ["library-sync"])
    assert res.exit_code == 1
    assert "Plex n'a renvoyé aucun titre" in res.output


def test_plex_token_never_leaks(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        _env_file=None,
        plex_token="tok-SECRET-123",
        plex_music_section="Musique",
        RADIO_DATA_DIR=env / "data",
        RADIO_CONFIG_DIR=env / "config",
    )
    monkeypatch.setattr(cli, "_settings", lambda: settings)
    exc = requests.ConnectionError("http://plex?X-Plex-Token=tok-SECRET-123")
    monkeypatch.setattr(cli, "PlexSource", _raise(exc))
    res = runner.invoke(cli.app, ["library-sync"])
    assert res.exit_code == 1
    assert "Plex en erreur (ConnectionError)" in res.output
    assert "tok-SECRET-123" not in res.output


def test_urllib3_logs_are_silenced(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # urllib3 à WARNING peut journaliser l'URL complète, clé Last.fm comprise.
    urllib3_logger = logging.getLogger("urllib3")
    monkeypatch.setattr(urllib3_logger, "level", logging.NOTSET)
    monkeypatch.setattr(cli, "PlexSource", lambda *a: FakePlex([]))
    runner.invoke(cli.app, ["library-sync"])
    assert urllib3_logger.level == logging.ERROR


class DiscoverFakes:
    def __init__(self, fail: bool = False, empty_top: bool = False) -> None:
        self.fail = fail
        self.empty_top = empty_top

    def related(self, artist_id: int) -> list[DeezerArtist]:
        return [DeezerArtist(1, "Knife")] if artist_id == 83 else []

    def top(self, artist_id: int, limit: int = 10) -> list[DeezerTrack]:
        if self.empty_top:
            return []
        return [DeezerTrack(11, "Heartbeats", "Heartbeats", 200, 1000, 1, "Knife", True)]

    def similar_artists(self, artist: str, limit: int = 100) -> list[str]:
        if self.fail:
            raise LastfmUnavailable("code 29")
        return ["The Knife"]


def _discover_env(monkeypatch: pytest.MonkeyPatch, env: Path, fakes: DiscoverFakes) -> None:
    make_library(env / "data").close()
    monkeypatch.setattr(cli, "DeezerClient", lambda: fakes)
    monkeypatch.setattr(cli, "_lastfm", lambda s: fakes)


def test_discover_command(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _discover_env(monkeypatch, env, DiscoverFakes())
    res = runner.invoke(cli.app, ["discover"])
    assert res.exit_code == 0, res.output
    assert (
        "Découverte : passe n°1 (nouvelle), 2 graines → 1 voisins, 1 titres vus → 1 ajoutés, "
        "0 doublons, 0 écartés (pas l'artiste principal ou sans extrait), 0 sautés"
    ) in res.stdout


def test_discover_unavailable_exits_1(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _discover_env(monkeypatch, env, DiscoverFakes(fail=True))
    res = runner.invoke(cli.app, ["discover"])
    assert res.exit_code == 1
    assert "Last.fm indisponible (code 29) : le travail fait est gardé" in res.output


def test_discover_without_any_title_fails_as_deezer_down(
    env: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _discover_env(monkeypatch, env, DiscoverFakes(empty_top=True))
    res = runner.invoke(cli.app, ["discover"])
    assert res.exit_code == 1
    assert "Deezer indisponible (aucun titre pour 1 voisins) : le travail fait est gardé" in (
        res.output
    )
    with cli._db(cli._settings()) as conn:
        assert [(s, ok) for s, _, ok, _ in last_stages(conn)] == [("discover", False)]


def test_discover_without_lastfm_key_exits_2(env: Path) -> None:
    res = runner.invoke(cli.app, ["discover"])
    assert res.exit_code == 2
    assert "LASTFM_API_KEY" in res.output


def test_discover_without_library_exits_1(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    fakes = DiscoverFakes()
    monkeypatch.setattr(cli, "DeezerClient", lambda: fakes)
    monkeypatch.setattr(cli, "_lastfm", lambda s: fakes)
    res = runner.invoke(cli.app, ["discover"])
    assert res.exit_code == 1
    assert "radio library-sync" in res.output


def test_negatives_sync_command(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (env / "config" / "negatives.toml").write_text(
        '[[artist]]\nname = "Jul"\ndeezer_id = 900\ncategory = "commercial_fr"\n'
    )

    class Top:
        def top(self, artist_id: int, limit: int = 10) -> list[DeezerTrack]:
            return [DeezerTrack(1, "Tchikita", "Tchikita", 200, 1000, 900, "Jul", True)]

    monkeypatch.setattr(cli, "DeezerClient", lambda: Top())
    res = runner.invoke(cli.app, ["negatives-sync"])
    assert res.exit_code == 0, res.output
    assert (
        "Négatifs : 1 artistes (0 déjà importés) → 1 titres ajoutés, 0 doublons, 0 écartés, "
        "0 sautés"
    ) in res.stdout


def test_negatives_sync_invalid_file_exits_2(env: Path) -> None:
    (env / "config" / "negatives.toml").write_text('[[artist]]\nname = "X"\n')
    res = runner.invoke(cli.app, ["negatives-sync"])
    assert res.exit_code == 2
    assert "negatives.toml invalide" in res.output


def test_signals_refuses_a_bad_model(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def bad(path: Path) -> object:
        raise ModelError("somme de contrôle inattendue : m.pb")

    monkeypatch.setattr(cli, "EffnetEmbedder", bad)
    res = runner.invoke(cli.app, ["signals"])
    assert res.exit_code == 2
    assert "Modèle EffNet refusé : somme de contrôle inattendue" in res.output
