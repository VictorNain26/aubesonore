import json
from datetime import UTC, datetime, timedelta
from pathlib import Path, PurePosixPath
from typing import Any

import numpy as np
import pytest
import responses

import radio.antenna.sync as sync_mod
from radio.acquire.audio import Probe, Tags, ToolError
from radio.antenna.sync import antenne_pass
from radio.core.config import AntenneConfig, Creneau, GrilleConfig
from radio.sources.azuracast import AzuracastClient, AzuracastError, Media
from radio.sources.deezer import DeezerAlbum, DeezerError, DeezerTrack, TrackPage
from tests_radio.model_factory import NOW, add_vote, make_model_db, serve_scores

ROOT = PurePosixPath("/media/plex/Musique")
LATER = datetime(2026, 12, 1, tzinfo=UTC)


class FakeDeezer:
    def __init__(self, gone: frozenset[int] = frozenset(), no_cover: bool = False) -> None:
        self.gone = gone
        self.no_cover = no_cover

    def track_page(self, tid: int) -> TrackPage | None:
        if tid in self.gone:
            return None
        track = DeezerTrack(tid, "T", "T", 200, 1, 1, "A", True)
        return TrackPage(track, "https://signed", DeezerAlbum(f"Album {tid}", "https://cover"))

    def download(self, url: str) -> bytes:
        if self.no_cover:
            raise DeezerError("download HTTP 404")
        return b"jpeg"


class FakeStation:
    def __init__(self, media: list[Media] | None = None, refuse: set[str] = frozenset()) -> None:
        self.media = list(media or [])
        self.refuse = refuse
        self.blobs: dict[int, bytes] = {}
        self.busy: set[str] = set()
        self.deleted: list[str] = []
        self.moved: list[tuple[str, str]] = []

    def files(self) -> list[Media]:
        return list(self.media)

    def upload(self, path: str, data: bytes) -> Media:
        if path in self.refuse:
            raise AzuracastError("HTTP 413")
        m = Media(1000 + len(self.media), f"song-{path}", path)
        self.media.append(m)
        self.blobs[m.id] = data
        return m

    def download(self, media_id: int) -> bytes:
        return self.blobs[media_id]

    def delete(self, paths: list[str]) -> list[str]:
        self.deleted += paths
        self.media = [m for m in self.media if m.path not in paths]
        return []

    def move(self, paths: list[str], directory: str) -> list[str]:
        self.moved += [(p, directory) for p in paths]
        self.media = [
            Media(m.id, m.song_id, f"{directory}/{PurePosixPath(m.path).name}")
            if m.path in paths
            else m
            for m in self.media
        ]
        return []

    def busy_song_ids(self) -> set[str]:
        return self.busy


@pytest.fixture
def no_tools(monkeypatch: pytest.MonkeyPatch) -> list[Tags]:
    tagged: list[Tags] = []

    def prepare(src: Path, dest: Path, codec: str, tags: Tags, rsgain: Path) -> None:
        tagged.append(tags)
        dest.write_bytes(b"mp3")

    monkeypatch.setattr(sync_mod, "probe", lambda p: Probe("flac", 200.0, 900))
    monkeypatch.setattr(sync_mod, "prepare", prepare)
    return tagged


def _ready(conn: Any, tmp: Path, ids: list[int]) -> None:
    for tid in ids:
        f = tmp / f"{tid}.mp3"
        f.write_bytes(b"audio")
        conn.execute(
            "INSERT INTO acquisitions VALUES (?, 'ready', NULL, 1, ?, ?)", (tid, str(f), NOW)
        )
    conn.commit()


def _library_files(conn: Any) -> None:
    conn.execute("UPDATE library_tracks SET file = '/media/plex/Musique/' || plex_key || '.flac'")
    conn.execute("UPDATE library_tracks SET file = '/media/musique/x.flac' WHERE plex_key = 'p0-0'")
    conn.commit()


def _grille(fond: int = 0, reperes: int = 0) -> GrilleConfig:
    """Grille dont les stocks du fond et des repères valent exactement `fond` et `reperes`."""

    def creneau(part: float, stock: int) -> Creneau:
        return Creneau(part=part, passages=part * 14.6 * 168 / stock if stock else 1e9)

    return GrilleConfig(
        categories={
            "nouveautes": Creneau(part=1 / 3, passages=2),
            "decouvertes": Creneau(part=1 / 3, passages=2),
            "fond": creneau(1 / 6, fond),
            "reperes": creneau(1 / 6, reperes),
        }
    )


def _run(
    conn: Any, station: FakeStation, deezer: Any = None, fond: int = 0, reperes: int = 0, **cfg: Any
) -> Any:
    return antenne_pass(
        conn,
        station,
        deezer or FakeDeezer(),
        AntenneConfig(**cfg),
        _grille(fond, reperes),
        ROOT,
        Path("/r"),
        np.random.default_rng(0),
        LATER,
    )


def _on_air(
    conn: Any, rows: list[tuple[int, str, str]], since: datetime, folder: str = "antenne"
) -> FakeStation:
    """Inscrit des titres (id, origine, catégorie) entrés à `since`, et leurs fichiers."""
    for tid, origin, categorie in rows:
        conn.execute(
            "INSERT INTO antenne VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                tid,
                origin,
                categorie,
                tid,
                f"s{tid}",
                f"{folder}/{tid}.mp3",
                since.isoformat(),
                since.isoformat(),
            ),
        )
    conn.commit()
    return FakeStation([Media(t, f"s{t}", f"{folder}/{t}.mp3") for t, _, _ in rows])


def _categories(conn: Any) -> dict[int, tuple[str, str]]:
    return {
        int(r[0]): (str(r[1]), str(r[2]))
        for r in conn.execute("SELECT deezer_track_id, categorie, path FROM antenne")
    }


def test_publish_ready_files_and_references(tmp_path: Path, no_tools: list[Tags]) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    _library_files(conn)
    ready = [200000 + 100 * a for a in range(8)]
    _ready(conn, tmp_path, ready)
    station = FakeStation([Media(1, "old", "ancien.mp3")])

    # Stock de 12 repères, rempli au rythme où il se renouvelle : 12 / 6 semaines = 2.
    rep = _run(conn, station, reperes=12)

    assert (rep.n_published, rep.n_references, rep.errors) == (8, 2, [])
    assert rep.n_total == 10
    assert not any((tmp_path / f"{t}.mp3").exists() for t in ready)  # effacés après dépôt
    cats = dict(conn.execute("SELECT categorie, COUNT(*) FROM antenne GROUP BY 1").fetchall())
    assert cats == {"decouvertes": 8, "reperes": 2}
    refs = [
        r[0] for r in conn.execute("SELECT deezer_track_id FROM antenne WHERE origin = 'repere'")
    ]
    assert 100000 not in refs  # fichier hors de la racine Plex : jamais lu
    assert sorted(t.deezer_id for t in no_tools) == sorted(refs)
    assert all(t.album == f"Album {t.deezer_id}" and t.cover == b"jpeg" for t in no_tools)
    assert all(m.path.startswith("antenne/") for m in station.media[1:])


def test_a_reference_never_gives_an_artist_a_second_title(
    tmp_path: Path, no_tools: list[Tags]
) -> None:
    # Breaks if a reference is drawn for an artist who already has a title on air.
    conn = make_model_db(tmp_path)
    _library_files(conn)
    one_each = [(100000 + 10 * a, "decouverte", "fond") for a in range(12)]
    station = _on_air(conn, one_each, LATER)

    rep = _run(conn, station, fond=12, reperes=12)

    assert (rep.n_references, rep.n_references_artist_full) == (0, 2)
    assert no_tools == []


def test_a_fresh_pick_enters_as_a_fresh_pick(tmp_path: Path, no_tools: None) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    conn.execute(
        "UPDATE candidates SET source = 'hypem', seed_artist_id = NULL, "
        "neighbour_artist_id = NULL, detail = 'Blog' WHERE deezer_track_id = 200600"
    )
    _ready(conn, tmp_path, [200600, 200700])
    _run(conn, FakeStation())
    assert {t: c for t, (c, _) in _categories(conn).items()} == {
        200600: "nouveautes",
        200700: "decouvertes",
    }


def test_reconcile_forgets_missing_and_counts_unknown(tmp_path: Path, no_tools: None) -> None:
    conn = make_model_db(tmp_path)
    _on_air(conn, [(5, "decouverte", "decouvertes")], LATER)
    station = FakeStation([Media(2, "u", "antenne/9.mp3"), Media(3, "v", "repos/8.mp3")])
    rep = _run(conn, station)
    assert (rep.n_forgotten, rep.n_unknown, rep.n_total) == (1, 2, 0)
    assert station.deleted == []  # un inconnu n'est jamais supprimé


def test_after_its_first_stay_the_best_rests_and_the_rest_leaves(
    tmp_path: Path, no_tools: None
) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    best = [int(r[0]) for r in conn.execute("SELECT deezer_track_id FROM scores ORDER BY -score")]
    ids = best[:10]
    station = _on_air(
        conn, [(t, "decouverte", "decouvertes") for t in ids], LATER - timedelta(weeks=7)
    )
    add_vote(conn, ids[9], "exam", "oui")  # la moins bien notée, mais aimée
    station.busy = {f"s{ids[5]}"}

    rep = _run(conn, station, promotion_share=0.2)

    cats = _categories(conn)
    # 9 titres jugés (le titre en cours attend) : 0,2 x 9 arrondi = 2 promus, le « oui » d'abord.
    assert rep.n_promoted == 2 and rep.n_ended == 7
    assert cats[ids[9]] == ("repos", f"repos/{ids[9]}.mp3")
    assert cats[ids[0]] == ("repos", f"repos/{ids[0]}.mp3")
    assert set(cats) == {ids[0], ids[9], ids[5]}
    assert cats[ids[5]][0] == "decouvertes"
    assert rep.n_total == 1  # le repos est hors antenne


def test_a_promotion_never_gives_an_artist_a_second_title(tmp_path: Path, no_tools: None) -> None:
    # Breaks if the end of the first stay promotes a title whose artist still has another one on
    # air (here a title in play, which the dedup leaves for the next pass).
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    station = _on_air(conn, [(200001, "decouverte", "fond")], LATER)
    station.busy = {"s200001"}
    cohort = [200003, 200103, 200203, 200303]
    old = _on_air(
        conn, [(t, "decouverte", "decouvertes") for t in cohort], LATER - timedelta(weeks=7)
    )
    station.media += old.media

    rep = _run(conn, station, promotion_share=0.5)

    # 2 promus sur 4, par note : 200003 (0,75) donnerait un second titre à l'artiste 2000, dont
    # 200001 joue ; sa place va au suivant.
    cats = _categories(conn)
    assert (rep.n_artist_doubles, rep.n_promoted, rep.n_promotions_artist_full) == (0, 2, 1)
    assert cats[200001][0] == "fond"
    assert 200003 not in cats
    assert 200103 in cats and cats[200103][0] == "repos"


def test_an_artist_keeps_one_title_the_liked_then_in_rotation_then_best_scored(
    tmp_path: Path, no_tools: None
) -> None:
    # Breaks if an artist keeps more than one title on air, or keeps the wrong one.
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    rows = [
        (200000, "decouverte", "fond"),
        (200001, "decouverte", "decouvertes"),
        (200002, "decouverte", "decouvertes"),
        (200100, "decouverte", "fond"),
        (200101, "decouverte", "decouvertes"),
        (200102, "decouverte", "decouvertes"),
        (200200, "decouverte", "decouvertes"),
        (200201, "decouverte", "fond"),
        (100000, "repere", "reperes"),
        (100001, "repere", "reperes"),
    ]
    station = _on_air(conn, rows, LATER)
    add_vote(conn, 200000, "exam", "oui")
    station.busy = {"s200201"}
    best = max(
        (200101, 200102),
        key=lambda t: conn.execute(
            "SELECT score FROM scores WHERE deezer_track_id = ?", (t,)
        ).fetchone()[0],
    )

    rep = _run(conn, station, fond=10, reperes=2)

    kept = set(_categories(conn))
    assert kept == {200000, best, 200200, 200201, 100000}  # 200201, en trop, joue : il attend
    assert rep.n_artist_doubles == 5
    assert set(station.deleted) == {
        "antenne/200001.mp3",
        "antenne/200002.mp3",
        "antenne/200100.mp3",
        f"antenne/{200101 + 200102 - best}.mp3",
        "antenne/100001.mp3",
    }
    left = [r[0] for r in conn.execute("SELECT deezer_track_id FROM repere_sorties")]
    assert left == [100001]  # un repère sorti n'est pas retiré avant son repos


def test_a_young_title_stays_whatever_its_score(tmp_path: Path, no_tools: None) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    worst = [int(r[0]) for r in conn.execute("SELECT deezer_track_id FROM scores ORDER BY score")]
    station = _on_air(
        conn, [(t, "decouverte", "decouvertes") for t in worst[:3]], LATER - timedelta(weeks=5)
    )
    rep = _run(conn, station)
    assert (rep.n_promoted, rep.n_ended, rep.n_total) == (0, 0, 3)


def test_platooning_rests_the_tired_and_brings_back_the_longest_rested(
    tmp_path: Path, no_tools: None
) -> None:
    conn = make_model_db(tmp_path)
    tired = _on_air(
        conn,
        [(200000, "decouverte", "fond"), (200300, "decouverte", "fond")],
        LATER - timedelta(weeks=7),
    )
    rested = _on_air(
        conn,
        [(200100, "decouverte", "repos"), (200400, "decouverte", "repos")],
        LATER - timedelta(weeks=13),
        folder="repos",
    )
    conn.execute(
        "UPDATE antenne SET since = ? WHERE deezer_track_id = 200400",
        ((LATER - timedelta(weeks=20)).isoformat(),),
    )
    resting = _on_air(conn, [(200200, "decouverte", "repos")], LATER - timedelta(weeks=5), "repos")
    station = FakeStation(tired.media + rested.media + resting.media)

    rep = _run(conn, station, fond=1)

    cats = _categories(conn)
    assert (rep.n_rested, rep.n_returned) == (2, 1)
    assert cats[200400] == ("fond", "antenne/200400.mp3")  # au repos depuis le plus longtemps
    assert cats[200100][0] == cats[200200][0] == "repos"
    assert cats[200000] == ("repos", "repos/200000.mp3")
    assert rep.n_total == 1


def test_a_recurrent_expires_eighteen_months_after_its_first_play(
    tmp_path: Path, no_tools: None
) -> None:
    conn = make_model_db(tmp_path)
    station = _on_air(conn, [(200000, "decouverte", "fond")], LATER - timedelta(weeks=2))
    conn.execute(
        "UPDATE antenne SET published_at = ?", ((LATER - timedelta(weeks=79)).isoformat(),)
    )
    conn.commit()
    rep = _run(conn, station, fond=5)
    assert rep.n_expired == 1 and station.deleted == ["antenne/200000.mp3"]


def test_references_rotate_and_rest_before_coming_back(
    tmp_path: Path, no_tools: list[Tags]
) -> None:
    conn = make_model_db(tmp_path)
    _library_files(conn)
    conn.execute("UPDATE library_tracks SET file = NULL WHERE plex_key NOT IN ('p1-0', 'p1-1')")
    station = _on_air(conn, [(100010, "repere", "reperes")], LATER - timedelta(weeks=7))

    rep = _run(conn, station, reperes=6)

    # Le repère fatigué sort ; seul l'autre titre lisible peut entrer, l'ancien se repose.
    assert rep.n_references_out == 1 and station.deleted == ["antenne/100010.mp3"]
    assert [t.deezer_id for t in no_tools] == [100011]
    left = conn.execute("SELECT deezer_track_id FROM repere_sorties").fetchall()
    assert [r[0] for r in left] == [100010]


def test_upload_refusal_is_reported_and_file_kept(tmp_path: Path, no_tools: None) -> None:
    conn = make_model_db(tmp_path)
    _ready(conn, tmp_path, [200000])
    rep = _run(conn, FakeStation(refuse={"antenne/200000.mp3"}))
    assert rep.errors == ["dépôt 200000 : HTTP 413"]
    assert (tmp_path / "200000.mp3").exists()


def test_a_discovery_removed_from_antenna_is_never_republished(
    tmp_path: Path, no_tools: None
) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    _ready(conn, tmp_path, [200000])
    station = FakeStation()
    assert _run(conn, station).n_published == 1
    status = conn.execute("SELECT status, file FROM acquisitions").fetchone()
    assert tuple(status) == ("published", None)

    station.media = []  # retiré dans l'interface d'AzuraCast, ou sorti en fin de séjour
    rep = _run(conn, station)
    assert (rep.n_forgotten, rep.n_published, rep.errors) == (1, 0, [])
    assert station.media == []


def test_voted_no_leaves_the_antenna_unless_busy(tmp_path: Path, no_tools: list[Tags]) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    _library_files(conn)
    rows = [(200000, "decouverte", "decouvertes"), (200001, "decouverte", "decouvertes")]
    rows += [(200002, "decouverte", "decouvertes"), (100010, "repere", "reperes")]
    station = _on_air(conn, rows, LATER)
    for tid in (200000, 200001, 100010):
        add_vote(conn, tid, "exam", "non")
    station.busy = {"s200001"}
    # Seuls deux titres de la bibliothèque sont lisibles, dont le repère voté « non ».
    conn.execute("UPDATE library_tracks SET file = NULL WHERE plex_key NOT IN ('p1-0', 'p1-1')")
    conn.commit()

    rep = _run(conn, station, reperes=1)

    assert sorted(station.deleted) == ["antenne/100010.mp3", "antenne/200000.mp3"]
    assert rep.n_voted_out == 2
    on_air = {r[0] for r in conn.execute("SELECT deezer_track_id FROM antenne")}
    assert {200001, 200002} <= on_air and not on_air & {200000, 100010}
    assert [t.deezer_id for t in no_tools] == [100011]  # le repère voté « non » n'est pas repris

    station.busy = set()
    assert _run(conn, station).n_voted_out == 1  # le titre en cours sort à la passe suivante


def test_a_ready_file_voted_no_is_never_published(tmp_path: Path, no_tools: None) -> None:
    conn = make_model_db(tmp_path)
    _ready(conn, tmp_path, [200000])
    add_vote(conn, 200000, "lesson", "non")
    station = FakeStation()
    rep = _run(conn, station)
    assert (rep.n_voted_out, rep.n_published, rep.errors) == (1, 0, [])
    assert station.media == [] and not (tmp_path / "200000.mp3").exists()
    row = conn.execute("SELECT status, reason FROM acquisitions").fetchone()
    assert tuple(row) == ("failed", "voté non")


def test_a_failed_reference_is_skipped_without_failing_the_pass(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    _library_files(conn)

    def prepare(src: Path, dest: Path, codec: str, tags: Tags, rsgain: Path) -> None:
        if tags.deezer_id % 2:
            raise ToolError("ffmpeg : code 1")
        dest.write_bytes(b"mp3")

    monkeypatch.setattr(sync_mod, "probe", lambda p: Probe("flac", 200.0, None))
    monkeypatch.setattr(sync_mod, "prepare", prepare)
    rep = _run(conn, FakeStation(), FakeDeezer(), reperes=48)

    assert rep.errors == []
    # 8 tirages : chacun entre, échoue, ou trouve son artiste déjà à l'antenne.
    drawn = rep.n_references + len(rep.skipped_references) + rep.n_references_artist_full
    assert drawn == 8
    assert rep.skipped_references
    assert all(s.endswith("ffmpeg : code 1") for s in rep.skipped_references)


def test_reference_gone_from_deezer_or_without_cover(tmp_path: Path, no_tools: list[Tags]) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    _library_files(conn)
    pool = [int(r[0]) for r in conn.execute("SELECT deezer_track_id FROM deezer_matches")]
    rep = _run(conn, FakeStation(), FakeDeezer(frozenset(pool[:20]), no_cover=True), reperes=24)
    assert rep.errors == []
    assert rep.n_references == rep.n_references_no_cover
    assert all(t.cover is None and t.album.startswith("Album") for t in no_tools)
    assert all(s.endswith("disparu de Deezer") for s in rep.skipped_references)


API = "http://127.0.0.1:8080/api/station/1"
NOWPLAYING = "http://127.0.0.1:8080/api/nowplaying/1"


@responses.activate
def test_client_shapes() -> None:
    responses.get(API + "/files", json=[{"id": 3, "song_id": "s", "path": "antenne/1.mp3"}])
    responses.post(API + "/files", json={"id": 4, "song_id": "t", "path": "antenne/2.mp3"})
    responses.put(API + "/files/batch", json={"success": True, "errors": ["antenne/1.mp3: x"]})
    responses.get(API + "/queue", json=[{"song": {"id": "s"}}, {"song": {"id": "u"}}])
    responses.get(NOWPLAYING, json={"is_online": True, "now_playing": {"song": {"id": "v"}}})
    c = AzuracastClient("http://127.0.0.1:8080/", "cle")
    assert c.files() == [Media(3, "s", "antenne/1.mp3")]
    assert c.upload("antenne/2.mp3", b"ab") == Media(4, "t", "antenne/2.mp3")
    body = json.loads(responses.calls[1].request.body)
    assert body == {"path": "antenne/2.mp3", "file": "YWI="}
    assert c.delete(["antenne/1.mp3"]) == ["antenne/1.mp3: x"]
    assert json.loads(responses.calls[2].request.body) == {
        "do": "delete",
        "files": ["antenne/1.mp3"],
    }
    assert c.busy_song_ids() == {"s", "u", "v"}
    assert c.move(["antenne/1.mp3"], "repos") == ["antenne/1.mp3: x"]
    assert json.loads(responses.calls[-1].request.body) == {
        "do": "move",
        "files": ["antenne/1.mp3"],
        "currentDirectory": "",
        "directory": "repos",
    }
    assert all(call.request.headers["X-API-Key"] == "cle" for call in responses.calls)


@responses.activate
def test_offline_station_has_no_current_song() -> None:
    responses.get(API + "/queue", json=[])
    responses.get(NOWPLAYING, json={"is_online": False, "now_playing": None})
    assert AzuracastClient("http://127.0.0.1:8080", "k").busy_song_ids() == set()


@responses.activate
def test_client_refusal_is_an_error() -> None:
    responses.post(API + "/files", status=413)
    with pytest.raises(AzuracastError):
        AzuracastClient("http://127.0.0.1:8080", "k").upload("antenne/1.mp3", b"")
