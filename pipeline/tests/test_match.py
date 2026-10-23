import sqlite3
from pathlib import Path

import pytest

from radio.core.db import connect
from radio.library.match import (
    MatchReport,
    coverage,
    match_library,
    normalize,
    pick_match,
    search_query,
)
from radio.library.sync import sync_library
from radio.sources.deezer import DeezerError, DeezerTrack, DeezerUnavailable
from radio.sources.plex import PlexTrack


def dz(
    id: int, artist: str, title: str, dur: int, rank: int = 0, preview: bool = True
) -> DeezerTrack:
    return DeezerTrack(id, title, title, dur, rank, 100 + id, artist, preview)


@pytest.mark.parametrize(
    ("raw", "norm"),
    [
        ("Love Like Blood - 2007 Remaster", "love like blood"),
        ("Mannequin (2006 Remastered Version)", "mannequin"),
        ("Café Del Mar [Energy 52 Mix]", "cafe del mar energy 52 mix"),
        ("Sorry for Laughing feat. Someone", "sorry for laughing"),
        ("Simon & Garfunkel", "simon and garfunkel"),
        ("The Feelies", "feelies"),
        ("(Interlude)", "interlude"),
        ("  Hey,   Boy!  ", "hey boy"),
        ("Love Story (Taylor's Version)", "love story taylor s version"),
        ("Mannequin - Live", "mannequin live"),
        ("Song (feat. X)", "song"),
        ("Hey Jude (Remastered 2015)", "hey jude"),
        ("Ten Ft. Tall", "ten ft tall"),
        ("A Feat of Strength", "a feat of strength"),
        ("!!!", ""),
        ("Song feat. X (Live)", "song live"),
        ("Song feat. X [Instrumental]", "song instrumental"),
        ("Song feat. X \u2013 Live", "song live"),
        ("Song feat. X \u2014 Live", "song live"),
        ("Song feat. X / Live", "song live"),
        ("Song feat. X -Live", "song live"),
        ("Song feat. X: Live", "song live"),
        ("Song feat. Jay-Z", "song"),
        ("Song feat. Jay-Z - Live", "song live"),
        ("Song - 2007 Remaster", "song"),
        ("Song \u2013 2007 Remaster", "song"),
        ("Song \u2014 Remastered", "song"),
    ],
)
def test_normalize(raw: str, norm: str) -> None:
    assert normalize(raw) == norm


def test_search_query_strips_quotes_and_decorations() -> None:
    assert search_query('Say "Hi"', "Mannequin (Remastered) - Live") == "Say Hi Mannequin - Live"


def test_search_query_keeps_non_harmless_bracket_group() -> None:
    assert search_query("Wire", "(Interlude)") == "Wire (Interlude)"


def test_search_query_is_simple_no_advanced_syntax() -> None:
    assert search_query("Daft Punk", "Harder Better Faster Stronger") == (
        "Daft Punk Harder Better Faster Stronger"
    )


def test_search_query_strips_feat_from_artist() -> None:
    assert search_query("M83 feat. Susanne Sundfør", "For the Kids") == "M83 For the Kids"


def test_search_query_strips_feat_from_title() -> None:
    assert search_query("Artist", "Song feat. Someone") == "Artist Song"


def test_search_query_keeps_live_after_stripping_feat_from_title() -> None:
    assert search_query("Artist", "Song feat. X (Live)") == "Artist Song (Live)"


def test_search_query_strips_feat_from_title_with_accent() -> None:
    # _FEAT s'applique sur le texte brut (pas de _base au préalable) : vérifie qu'il ne dépend
    # pas des accents dans le nom retiré.
    assert search_query("Artist", "Song feat. Ünal (Live)") == "Artist Song (Live)"


def test_search_query_falls_back_to_raw_artist_when_emptied() -> None:
    # L'artiste entier disparaît via _FEAT (feat. en tête) : repli sur l'artiste brut.
    assert search_query(" feat. Guest", "Song") == "feat. Guest Song"


def test_pick_exact_prefers_preview_then_duration_then_rank() -> None:
    results = [
        dz(1, "Wire", "Mannequin", 157, rank=10, preview=False),
        dz(2, "Wire", "Mannequin", 159, rank=5),
        dz(3, "Wire", "Mannequin", 158, rank=1),
        dz(4, "Wire", "Mannequin", 158, rank=9),
    ]
    got = pick_match("Wire", "Mannequin", 157500, results, tolerance_s=3)
    assert got is not None and got.id == 4


def test_pick_rejects_wrong_artist_title_or_duration() -> None:
    assert pick_match("Wire", "Mannequin", 157000, [dz(1, "Wired", "Mannequin", 157)], 3) is None
    assert pick_match("Wire", "Mannequin", 157000, [dz(1, "Wire", "Manequin", 157)], 3) is None
    assert pick_match("Wire", "Mannequin", 157000, [dz(1, "Wire", "Mannequin", 161)], 3) is None


@pytest.mark.parametrize(
    ("lib_title", "dz_title"),
    [
        ("Love Story", "Love Story (Taylor's Version)"),
        ("Accordion", "Accordion (Instrumental)"),
        ("Mannequin", "Mannequin - Live"),
        ("Song (Part 1)", "Song (Part 2)"),
        ("Crazy", "Crazy (Remix)"),
        ("Hey Jude", "Hey Jude - Mono"),
        ("Song", "Song feat. X (Live)"),
        ("Song feat. X (Live)", "Song"),
        ("Song feat. X - Part 1", "Song feat. X - Part 2"),
        ("Song", "Song (with Strings)"),
        ("Song", "Song feat. X \u2013 Live"),
        ("Song", "Song feat. X \u2014 Live"),
        ("Song", "Song feat. X: Live Version"),
        ("Song", "Song feat. X / Live"),
        ("Song", "Song feat. X -Live"),
        ("Song", "Song (feat. X - Live)"),
    ],
)
def test_pick_rejects_false_matches(lib_title: str, dz_title: str) -> None:
    assert pick_match("Artist", lib_title, 180000, [dz(1, "Artist", dz_title, 180)], 3) is None


def test_pick_ignores_title_short() -> None:
    # title_short="X" ressemblerait à "X" côté bibliothèque ; seul title (complet) compte.
    track = DeezerTrack(1, "X (Live)", "X", 180, 0, 101, "Artist", True)
    assert pick_match("Artist", "X", 180000, [track], 3) is None


def test_pick_matches_harmless_remaster_qualifier() -> None:
    got = pick_match(
        "Wire",
        "Mannequin (2006 Remastered Version)",
        157000,
        [dz(7, "Wire", "Mannequin", 157)],
        3,
    )
    assert got is not None and got.id == 7


def test_pick_never_matches_empty_normalized_artist() -> None:
    assert pick_match("!!!", "Song", 120000, [dz(1, "!!!", "Song", 120)], 3) is None


class FakeDeezer:
    def __init__(self, answers: dict[str, list[DeezerTrack] | Exception]) -> None:
        self.answers = answers
        self.queries: list[str] = []

    def search_tracks(self, query: str, limit: int = 10) -> list[DeezerTrack]:
        self.queries.append(query)
        a = self.answers[query]
        if isinstance(a, Exception):
            raise a
        return a


def setup(tmp_path: Path) -> sqlite3.Connection:
    conn = connect(tmp_path / "db")
    sync_library(
        conn,
        [
            PlexTrack("1", "Wire", "Mannequin", "Pink Flag", 157000, 3),
            PlexTrack("2", "Wire", "Unknown Song", "Pink Flag", 100000, 0),
            PlexTrack("3", "Wire", "No Dur", "Pink Flag", None, 0),
            PlexTrack("4", "Wire", "Fuzzy", "Pink Flag", 120000, 0),
            PlexTrack("5", "Wire", "Broken", "Pink Flag", 120000, 0),
        ],
        "d0",
    )
    return conn


def test_match_library_records_every_outcome(tmp_path: Path) -> None:
    conn = setup(tmp_path)
    fake = FakeDeezer(
        {
            search_query("Wire", "Mannequin"): [dz(7, "Wire", "Mannequin", 157)],
            search_query("Wire", "Unknown Song"): [],
            search_query("Wire", "Fuzzy"): [dz(8, "Wire", "Fuzzy Remix", 120)],
            search_query("Wire", "Broken"): DeezerError("code 501"),
        }
    )
    rep = match_library(conn, fake, tolerance_s=3, now="d1")  # type: ignore[arg-type]
    assert rep == MatchReport(
        n_todo=5,
        n_matched=1,
        unmatched={"no_duration": 1, "no_result": 1, "no_exact_match": 1},
        errors=["Wire — Broken (DeezerError)"],
    )
    row = conn.execute("SELECT * FROM deezer_matches WHERE plex_key='1'").fetchone()
    assert (row["status"], row["deezer_track_id"], row["deezer_artist_id"]) == ("matched", 7, 107)
    assert conn.execute("SELECT COUNT(*) FROM deezer_matches").fetchone()[0] == 4
    assert coverage(conn) == (1, 5)
    # Titre sans durée : aucune requête Deezer.
    assert search_query("Wire", "No Dur") not in fake.queries


def test_second_pass_only_retries_errors(tmp_path: Path) -> None:
    conn = setup(tmp_path)
    answers: dict[str, list[DeezerTrack] | Exception] = {
        search_query("Wire", "Mannequin"): [dz(7, "Wire", "Mannequin", 157)],
        search_query("Wire", "Unknown Song"): [],
        search_query("Wire", "Fuzzy"): [],
        search_query("Wire", "Broken"): DeezerError("code 501"),
    }
    match_library(conn, FakeDeezer(answers), 3, "d1")  # type: ignore[arg-type]
    fake2 = FakeDeezer({search_query("Wire", "Broken"): [dz(9, "Wire", "Broken", 120)]})
    rep = match_library(conn, fake2, 3, "d2")  # type: ignore[arg-type]
    assert rep.n_todo == 1 and rep.n_matched == 1
    assert fake2.queries == [search_query("Wire", "Broken")]


def test_unavailable_commits_done_work_then_raises(tmp_path: Path) -> None:
    conn = setup(tmp_path)
    fake = FakeDeezer(
        {
            search_query("Wire", "Mannequin"): [dz(7, "Wire", "Mannequin", 157)],
            search_query("Wire", "Unknown Song"): DeezerUnavailable("code 4"),
        }
    )
    with pytest.raises(DeezerUnavailable):
        match_library(conn, fake, 3, "d1", batch=50)  # type: ignore[arg-type]
    # Seconde connexion : prouve que la validation a bien été écrite sur disque.
    reader = sqlite3.connect(tmp_path / "db")
    try:
        row = reader.execute("SELECT status FROM deezer_matches WHERE plex_key='1'").fetchone()
    finally:
        reader.close()
    assert row[0] == "matched"


class BatchProbeDeezer:
    """Sonde, par sa PROPRE connexion SQLite, que le lot précédent est déjà sur
    disque au moment où le second titre échoue — donc pendant l'exécution de
    match_library, avant même que l'exception ne remonte. Sans le flush en
    cours de boucle (batch=1), la ligne du titre 1 ne serait pas encore visible
    ici et le test échouerait."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.queries: list[str] = []

    def search_tracks(self, query: str, limit: int = 10) -> list[DeezerTrack]:
        self.queries.append(query)
        if query == search_query("Wire", "Mannequin"):
            return [dz(7, "Wire", "Mannequin", 157)]
        if query == search_query("Wire", "Unknown Song"):
            reader = sqlite3.connect(self.db_path)
            try:
                row = reader.execute(
                    "SELECT status FROM deezer_matches WHERE plex_key='1'"
                ).fetchone()
            finally:
                reader.close()
            assert row is not None and row[0] == "matched"
            raise DeezerUnavailable("code 4")
        raise AssertionError(f"unexpected query: {query}")


def test_unavailable_with_batch_one_flushes_mid_loop(tmp_path: Path) -> None:
    conn = setup(tmp_path)
    fake = BatchProbeDeezer(tmp_path / "db")
    with pytest.raises(DeezerUnavailable):
        match_library(conn, fake, 3, "d1", batch=1)  # type: ignore[arg-type]


def test_pick_accepts_one_artist_of_a_shared_credit() -> None:
    bill = dz(1, "Bill Wells", "Glasgow Jubilee", 238)
    got = pick_match("Aidan Moffat & Bill Wells", "Glasgow Jubilee", 238000, [bill], 3)
    assert got is not None and got.id == 1
    eagle = dz(2, "Open Mike Eagle", "Concrete", 174)
    assert pick_match("Kenny Segal, Open Mike Eagle", "Concrete", 175000, [eagle], 3) is not None
    # Le crédit complet passe avant un seul de ses artistes.
    both = dz(3, "Aidan Moffat & Bill Wells", "Glasgow Jubilee", 239)
    got = pick_match("Aidan Moffat & Bill Wells", "Glasgow Jubilee", 238000, [bill, both], 3)
    assert got is not None and got.id == 3


def test_a_shared_credit_still_needs_the_same_title_and_duration() -> None:
    assert pick_match("A & B", "Song", 200000, [dz(1, "B", "Other", 200)], 3) is None
    assert pick_match("A & B", "Song", 200000, [dz(1, "B", "Song", 210)], 3) is None
    # « and » ne découpe jamais un nom.
    assert (
        pick_match("Florence and the Machine", "Song", 200000, [dz(1, "Florence", "Song", 200)], 3)
        is None
    )
