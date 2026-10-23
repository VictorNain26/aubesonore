import sqlite3
from pathlib import Path
from typing import ClassVar

import numpy as np
import pytest
import responses

from radio.core.config import FreshConfig, ModelConfig
from radio.discover.candidates import add_tracks
from radio.discover.favorites import favorites_pass
from radio.discover.fresh import fresh_pass
from radio.library.artists import register_library
from radio.model.model import FavoritesRetained, favorites_retained, rescore, train
from radio.signals.audio import DIM, MODEL_TAG, to_blob
from radio.sources.deezer import DeezerTrack
from radio.sources.hypem import API, HypemClient, HypemNotFound, HypemTrack
from tests.factories import make_library
from tests.model_factory import DISLIKED, LIKED, make_model_db, seed_run

NOW = "2026-10-02T00:00:00+00:00"


def dt(tid: int, aid: int, artist: str, title: str, duration: int = 200) -> DeezerTrack:
    return DeezerTrack(tid, title, title, duration, 1, aid, artist, True)


def h(artist: str, title: str, duration: int = 200) -> dict[str, object]:
    return {"artist": artist, "title": title, "time": duration, "sitename": "Blog"}


@responses.activate
def test_favorites_are_read_page_by_page_until_a_short_page() -> None:
    url = API + "/users/GhostRAvage/favorites"
    responses.get(url, json=[h("A", f"T{k}") for k in range(50)])
    responses.get(url, json=[h("B", "Last")])

    tracks = HypemClient().favorites("GhostRAvage")

    assert len(tracks) == 51 and tracks[-1] == HypemTrack("B", "Last", 200, "Blog")
    assert len(responses.calls) == 2
    assert "page=2" in str(responses.calls[1].request.url)


@responses.activate
def test_a_404_ends_the_list_after_a_full_page_but_is_an_error_on_the_first() -> None:
    url = API + "/users/GhostRAvage/favorites"
    responses.get(url, json=[h("A", f"T{k}") for k in range(50)])
    responses.get(url, status=404)
    assert len(HypemClient().favorites("GhostRAvage")) == 50

    responses.get(API + "/users/nobody/favorites", status=404)
    with pytest.raises(HypemNotFound):
        HypemClient().favorites("nobody")


class FakeHypem:
    def __init__(
        self, favorites: list[HypemTrack], popular: list[HypemTrack] | None = None
    ) -> None:
        self._favorites, self._popular = favorites, popular or []

    def favorites(self, user: str) -> list[HypemTrack]:
        assert user == "GhostRAvage"
        return self._favorites

    def popular(self, mode: str, page: int) -> list[HypemTrack]:
        return self._popular


class FakeDeezer:
    SEARCH: ClassVar[dict[str, list[DeezerTrack]]] = {
        "Fine Sometimes i rush": [dt(501, 50, "Fine", "Sometimes i rush")],
        "M83 Midnight City": [dt(101, 83, "M83", "Midnight City", duration=243)],
        "Julia Holter Sea Calls Me Home": [dt(601, 60, "Julia Holter", "Sea Calls Me Home")],
    }

    def search_tracks(self, query: str, limit: int = 10) -> list[DeezerTrack]:
        return self.SEARCH.get(query, [])

    def editorial_selection(self, genre_id: int) -> list[int]:
        return []


def _db(tmp_path: Path) -> sqlite3.Connection:
    conn = make_library(tmp_path)
    register_library(conn, NOW)
    conn.execute("INSERT INTO discover_runs VALUES (4, 'd', 'd', 'done')")
    # Sea Calls Me Home est déjà candidat de la fournée 4.
    add_tracks(
        conn,
        60,
        "Julia Holter",
        [dt(601, 60, "Julia Holter", "Sea Calls Me Home")],
        "candidate",
        NOW,
    )
    conn.execute(
        "INSERT INTO candidates (deezer_track_id, run_id, source, detail) "
        "VALUES (601, 4, 'hypem', 'Blog')"
    )
    conn.commit()
    return conn


def _origins(conn: sqlite3.Connection) -> dict[int, str]:
    return {
        int(r[0]): str(r[1]) for r in conn.execute("SELECT deezer_track_id, origin FROM tracks")
    }


def test_a_favorite_is_no_longer_a_discovery_and_the_library_keeps_its_own(tmp_path: Path) -> None:
    conn = _db(tmp_path)
    favorites = [
        HypemTrack("Fine", "Sometimes i rush", 200, "Blog"),
        HypemTrack("M83", "Midnight City", 243, "Blog"),  # déjà dans la bibliothèque
        HypemTrack("Julia Holter", "Sea Calls Me Home", 200, "Blog"),  # candidat de la fournée
        HypemTrack("Nobody", "Not on Deezer", 200, "Blog"),
    ]

    rep = favorites_pass(conn, FakeDeezer(), FakeHypem(favorites), "GhostRAvage", 3, NOW)  # type: ignore[arg-type]

    origins = _origins(conn)
    assert origins[501] == "favorite" and origins[601] == "favorite"
    assert origins[101] == "library"
    assert (rep.n_seen, rep.n_matched, rep.n_unmatched, rep.n_library) == (4, 3, 1, 1)


def test_an_unfavorited_track_returns_to_its_batch_or_is_forgotten(tmp_path: Path) -> None:
    conn = _db(tmp_path)
    favorites = [
        HypemTrack("Fine", "Sometimes i rush", 200, "Blog"),
        HypemTrack("Julia Holter", "Sea Calls Me Home", 200, "Blog"),
    ]
    favorites_pass(conn, FakeDeezer(), FakeHypem(favorites), "GhostRAvage", 3, NOW)  # type: ignore[arg-type]

    rep = favorites_pass(conn, FakeDeezer(), FakeHypem([]), "GhostRAvage", 3, NOW)  # type: ignore[arg-type]

    origins = _origins(conn)
    assert origins[601] == "candidate"
    assert 501 not in origins
    assert rep.n_dropped == 2


def test_a_favorite_is_not_a_fresh_title(tmp_path: Path) -> None:
    conn = _db(tmp_path)
    fine = HypemTrack("Fine", "Sometimes i rush", 200, "Blog")
    favorites_pass(conn, FakeDeezer(), FakeHypem([fine]), "GhostRAvage", 3, NOW)  # type: ignore[arg-type]

    rep = fresh_pass(
        conn,
        FakeDeezer(),  # type: ignore[arg-type]
        FakeHypem([], popular=[fine]),  # type: ignore[arg-type]
        FreshConfig(hypem_pages=1, deezer_editorial={}),
        3,
        NOW,
    )

    assert rep.n_known == 1 and not rep.added


def test_the_share_of_favorites_the_model_would_keep(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    seed_run(conn)
    cfg = ModelConfig(keep_decouvertes=32)
    assert train(conn, tmp_path / "models", cfg, NOW).promoted
    rescore(conn, tmp_path / "models", cfg)
    assert favorites_retained(conn, tmp_path / "models") is None  # pas encore de favori

    for k, direction in enumerate([LIKED] * 3 + [DISLIKED] * 3):
        tid = 900000 + k
        add_tracks(conn, 9000, "Fav", [dt(tid, 9000, "Fav", f"F{k}")], "favorite", NOW)
        v = 6 * direction + np.eye(DIM, dtype=np.float32)[2] * 0.1
        conn.execute(
            "INSERT INTO track_measures VALUES (?, 'ok', ?, ?, ?)",
            (tid, to_blob((v / np.linalg.norm(v)).astype(np.float32)), MODEL_TAG, NOW),
        )
    conn.commit()

    # Un titre par artiste : 24 retenus sur 96, mais 71 titres notés à la coupure ou au-dessus
    # (les autres titres des mêmes artistes). Le hasard se mesure à la coupure : 71 / 96, pas
    # 24 / 96, qui ferait battre le hasard à n'importe quel modèle.
    assert favorites_retained(conn, tmp_path / "models") == FavoritesRetained(0.5, 6, 71 / 96)
