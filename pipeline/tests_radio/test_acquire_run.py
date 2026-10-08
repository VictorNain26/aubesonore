from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np
import pytest

import radio.acquire.run as run_mod
from radio.acquire.audio import Probe, Tags
from radio.acquire.run import acquire_pass, pending
from radio.acquire.sockseek import SockseekError
from radio.core.config import AcquisitionConfig
from radio.sources.deezer import DeezerAlbum, DeezerError, DeezerTrack, DeezerUnavailable, TrackPage
from tests_radio.model_factory import NOW, add_vote, make_model_db, serve_scores

CFG = AcquisitionConfig(max_per_pass=4, max_attempts=2)


class FakeDeezer:
    def __init__(self, gone: frozenset[int] = frozenset(), cover_status: int = 200) -> None:
        self.gone = gone
        self.cover_status = cover_status
        self.requests: list[str] = []

    def track(self, tid: int) -> tuple[DeezerTrack, str | None] | None:
        page = self.track_page(tid)
        return None if page is None else (page.track, page.preview_url)

    def track_page(self, tid: int) -> TrackPage | None:
        self.requests.append(f"/track/{tid}")
        if tid in self.gone:
            return None
        track = DeezerTrack(tid, f"T{tid}", f"T{tid}", 200, 1, 1, "Art", True)
        return TrackPage(track, "https://signed", DeezerAlbum("Album", "https://cover"))

    def download(self, url: str) -> bytes:
        if url == "https://cover":
            if self.cover_status == 404:
                raise DeezerError("download HTTP 404")
            return b"jpeg"
        return b"preview"


def _sockseek(found: set[int]) -> Any:
    """Faux Sockseek : écrit un fichier pour les ids de `found`, un échec pour les autres."""

    def run(args: Sequence[str], timeout: float) -> int:
        out = Path(args[args.index("--output-dir") + 1])
        rows = []
        for line in (out / "retenus.csv").read_text().splitlines()[1:]:
            artist, title, length, uri = line.split(",")
            if int(uri) in found:
                (out / f"{uri}.mp3").write_bytes(b"audio")
                rows.append(f"{out}/{uri}.mp3,{artist},,{title},{length},0,1,0")
            else:
                rows.append(f",{artist},,{title},{length},0,2,9")
        (out / "retenus").mkdir()
        (out / "retenus" / "_index.csv").write_text(
            "filepath,artist,album,title,length,tracktype,state,failurereason\n" + "\n".join(rows)
        )
        return 1

    return run


@pytest.fixture
def fake_audio(monkeypatch: pytest.MonkeyPatch) -> dict[int, float]:
    """Score Chromaprint simulé par id Deezer (0,95 par défaut) ; préparation = copie."""
    scores: dict[int, float] = {}
    prepared.clear()

    def fingerprint(p: Path) -> Any:
        return np.array([int(p.stem) if p.stem.isdigit() else 0], dtype=np.uint32)

    def prepare(src: Path, dest: Path, codec: str, tags: Tags, rsgain: Path) -> None:
        dest.write_bytes(src.read_bytes())
        prepared[int(dest.stem)] = tags

    monkeypatch.setattr(run_mod, "probe", lambda p: Probe("mp3", 200.0, 320))
    monkeypatch.setattr(run_mod, "fingerprint", fingerprint)
    monkeypatch.setattr(run_mod, "similarity", lambda f, _: scores.get(int(f[0]), 0.95))
    monkeypatch.setattr(run_mod, "prepare", prepare)
    return scores


prepared: dict[int, Tags] = {}


def _pass(conn: Any, tmp: Path, found: set[int], n: int, deezer: Any = None) -> Any:
    return acquire_pass(
        conn,
        deezer or FakeDeezer(),
        (tmp / f"work{n}", tmp / "antenne", tmp),
        (Path("/sockseek"), Path("/rsgain")),
        ("radio", "pw"),
        CFG,
        NOW,
        _sockseek(found),
    )


def test_acquire_prepares_verified_files_and_retries_failures(
    tmp_path: Path, fake_audio: dict[int, float]
) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    first = pending(conn, CFG).tids
    assert len(first) == 4  # max_per_pass, la dernière fournée et les mieux notés d'abord
    ok, wrong, missing = first[0], first[1], first[2:]
    fake_audio[wrong] = 0.55  # Chromaprint : un autre morceau

    rep = _pass(conn, tmp_path, {ok, wrong}, 1)
    assert (rep.n_wanted, rep.n_ready) == (4, 1)
    assert dict(rep.failures) == {"identité": 1, "aucun résultat": 2}
    assert (tmp_path / "antenne" / f"{ok}.mp3").exists()
    assert not (tmp_path / "work1").exists()  # dossier de la passe effacé
    assert prepared[ok].album == "Album" and prepared[ok].cover == b"jpeg"

    # Deuxième passe : les échecs sont retentés (1 tentative < 2), le prêt ne l'est plus.
    again = pending(conn, CFG).tids
    assert ok not in again and wrong in again and set(missing) <= set(again)
    _pass(conn, tmp_path, set(), 2)
    rows = dict(conn.execute("SELECT deezer_track_id, attempts FROM acquisitions").fetchall())
    assert rows[wrong] == 2 and rows[ok] == 1
    assert wrong not in pending(conn, CFG).tids  # abandonné après max_attempts


def _artist(conn: Any, tid: int) -> int:
    row = conn.execute(
        "SELECT deezer_artist_id FROM tracks WHERE deezer_track_id = ?", (tid,)
    ).fetchone()
    return int(row[0])


def test_one_title_per_artist_enters_and_the_next_waits_its_turn(tmp_path: Path) -> None:
    # Breaks if an artist gets two titles in rotation, or if a waiting title is not counted.
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    cfg = AcquisitionConfig(max_per_pass=100, max_attempts=2)
    first = pending(conn, cfg)
    artists = [_artist(conn, t) for t in first.tids]
    assert len(artists) == len(set(artists)) and first.waiting > 0

    # Le premier artiste a désormais un titre en découvertes : son retenu attend.
    on_air = artists[0]
    other = conn.execute(
        "SELECT deezer_track_id FROM tracks WHERE deezer_artist_id = ? AND deezer_track_id != ?",
        (on_air, first.tids[0]),
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO antenne VALUES "
        "(?, 'decouverte', 'decouvertes', 1, 's1', 'antenne/1.mp3', ?, ?)",
        (other, NOW, NOW),
    )
    conn.commit()
    again = pending(conn, cfg)
    assert on_air not in {_artist(conn, t) for t in again.tids}
    assert again.waiting == first.waiting + 1


def test_the_latest_batch_is_acquired_first(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    # Mêmes notes dans les deux fournées : la dernière (artistes 6 à 11) passe d'abord.
    assert all(t // 100 % 100 >= 6 for t in pending(conn, CFG).tids)


def test_a_title_gone_from_deezer_is_counted(tmp_path: Path, fake_audio: dict[int, float]) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    gone = pending(conn, CFG).tids[0]
    rep = acquire_pass(
        conn,
        FakeDeezer(frozenset({gone})),
        (tmp_path / "w", tmp_path / "antenne", tmp_path),
        (Path("/s"), Path("/r")),
        ("u", "p"),
        CFG,
        NOW,
        _sockseek(set()),
    )
    assert rep.failures["disparu de Deezer"] == 1
    assert rep.n_wanted == 3


def test_one_track_request_per_title_after_the_wanted_list(
    tmp_path: Path, fake_audio: dict[int, float]
) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    ok = pending(conn, CFG).tids[0]
    deezer = FakeDeezer()
    _pass(conn, tmp_path, {ok}, 1, deezer)
    # Une lecture pour la liste, une seule ensuite : extrait frais, album et pochette ensemble.
    assert deezer.requests.count(f"/track/{ok}") == 2


def test_a_title_voted_no_is_never_acquired(tmp_path: Path, fake_audio: dict[int, float]) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    first, second = pending(conn, CFG).tids[:2]
    add_vote(conn, first, "exam", "non")
    add_vote(conn, second, "lesson", "non")
    left = pending(conn, CFG).tids
    assert first not in left and second not in left and len(left) == 4


def test_missing_cover_keeps_the_verified_file(
    tmp_path: Path, fake_audio: dict[int, float]
) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    ok = pending(conn, CFG).tids[0]
    rep = _pass(conn, tmp_path, {ok}, 1, FakeDeezer(cover_status=404))
    assert (rep.n_ready, rep.n_no_cover) == (1, 1)
    assert (tmp_path / "antenne" / f"{ok}.mp3").exists()
    assert prepared[ok].cover is None and prepared[ok].album == "Album"


def _no_attempt_recorded(conn: Any) -> bool:
    return conn.execute("SELECT COUNT(*) FROM acquisitions").fetchone()[0] == 0


def test_sockseek_without_index_consumes_no_attempt(
    tmp_path: Path, fake_audio: dict[int, float]
) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    with pytest.raises(SockseekError):
        acquire_pass(
            conn,
            FakeDeezer(),
            (tmp_path / "w", tmp_path / "antenne", tmp_path),
            (Path("/s"), Path("/r")),
            ("u", "p"),
            CFG,
            NOW,
            lambda args, timeout: 1,
        )
    assert _no_attempt_recorded(conn)
    assert not (tmp_path / "w").exists()


def test_sockseek_fatal_code_consumes_no_attempt(
    tmp_path: Path, fake_audio: dict[int, float]
) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    found = set(pending(conn, CFG).tids)
    run = _sockseek(found)

    def usage_error(args: Sequence[str], timeout: float) -> int:
        run(args, timeout)
        return 2

    with pytest.raises(SockseekError):
        acquire_pass(
            conn,
            FakeDeezer(),
            (tmp_path / "w", tmp_path / "antenne", tmp_path),
            (Path("/s"), Path("/r")),
            ("u", "p"),
            CFG,
            NOW,
            usage_error,
        )
    assert _no_attempt_recorded(conn)
    assert not (tmp_path / "w").exists()


def test_titles_missing_from_a_partial_index_are_not_attempts(
    tmp_path: Path, fake_audio: dict[int, float]
) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    first = pending(conn, CFG).tids[0]
    run = _sockseek({first})

    def interrupted(args: Sequence[str], timeout: float) -> int:
        run(args, timeout)
        index = Path(args[args.index("--output-dir") + 1]) / "retenus" / "_index.csv"
        index.write_text("\n".join(index.read_text().splitlines()[:2]))
        return 1

    rep = acquire_pass(
        conn,
        FakeDeezer(),
        (tmp_path / "w", tmp_path / "antenne", tmp_path),
        (Path("/s"), Path("/r")),
        ("u", "p"),
        CFG,
        NOW,
        interrupted,
    )
    assert (rep.n_ready, rep.n_unindexed, rep.n_attempted) == (1, 3, 1)
    rows = conn.execute("SELECT deezer_track_id, status FROM acquisitions").fetchall()
    assert [tuple(r) for r in rows] == [(first, "ready")]


def test_deezer_outage_still_cleans_the_pass_folder(
    tmp_path: Path, fake_audio: dict[int, float]
) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    found = set(pending(conn, CFG).tids)

    class Outage(FakeDeezer):
        def track_page(self, tid: int) -> TrackPage | None:
            if self.requests:
                raise DeezerUnavailable("HTTP 503")
            return super().track_page(tid)

        def track(self, tid: int) -> tuple[DeezerTrack, str | None] | None:
            t = DeezerTrack(tid, f"T{tid}", f"T{tid}", 200, 1, 1, "Art", True)
            return t, "https://signed"

    with pytest.raises(DeezerUnavailable):
        _pass(conn, tmp_path, found, 1, Outage())
    assert not (tmp_path / "work1").exists()


def test_two_titles_with_the_same_sockseek_key_do_not_loop(
    tmp_path: Path, fake_audio: dict[int, float]
) -> None:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    first, second = pending(conn, CFG).tids[:2]

    class SameKey(FakeDeezer):
        def track_page(self, tid: int) -> TrackPage | None:
            page = super().track_page(tid)
            if page is None or tid != second:
                return page
            twin = DeezerTrack(tid, f"T{first}", f"T{first}", 200, 1, 1, "Art", True)
            return TrackPage(twin, page.preview_url, page.album)

    rep = _pass(conn, tmp_path, {first, second}, 1, SameKey())
    assert rep.failures["doublon d'artiste, titre et durée"] == 1
    status = dict(conn.execute("SELECT deezer_track_id, status FROM acquisitions").fetchall())
    assert status[first] == "ready" and status[second] == "failed"
