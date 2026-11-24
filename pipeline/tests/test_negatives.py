from pathlib import Path

import pytest
from pydantic import ValidationError

from radio.decouverte.negatifs import ArtisteNegatif, charger_negatifs, importer_negatifs
from radio.socle.config import REPO_ROOT
from radio.socle.db import connect
from radio.sources.deezer import DeezerError, DeezerTrack, DeezerUnavailable
from tests.factories import make_library


def test_shipped_negatives_file_is_valid() -> None:
    # charger_negatifs refuse une catégorie inconnue et un deezer_id en double.
    charger_negatifs(REPO_ROOT / "config" / "negatives.toml")


def test_invalid_file_is_refused(tmp_path: Path) -> None:
    p = tmp_path / "n.toml"
    p.write_text('[[artist]]\nname = "X"\ndeezer_id = 1\ncategory = "jazz"\n')
    with pytest.raises(ValidationError):
        charger_negatifs(p)
    p.write_text(
        '[[artist]]\nname = "X"\ndeezer_id = 1\ncategory = "metal"\n'
        '[[artist]]\nname = "Y"\ndeezer_id = 1\ncategory = "metal"\n'
    )
    with pytest.raises(ValueError, match="1"):
        charger_negatifs(p)


class FakeDeezer:
    def __init__(self, top: dict[int, list[DeezerTrack] | Exception]) -> None:
        self._top = top
        self.calls: list[int] = []

    def top(self, artist_id: int, limit: int = 10) -> list[DeezerTrack]:
        self.calls.append(artist_id)
        v = self._top[artist_id]
        if isinstance(v, Exception):
            raise v
        return v


def dt(tid: int, aid: int, title: str) -> DeezerTrack:
    return DeezerTrack(tid, title, title, 200, 1000, aid, "x", True)


NEGS = [
    ArtisteNegatif(name="Jul", deezer_id=900, category="commercial_fr"),
    ArtisteNegatif(name="Broken", deezer_id=901, category="metal"),
]


def test_import_negatives(tmp_path: Path) -> None:
    conn = connect(tmp_path / "radio.db")
    dz = FakeDeezer(
        {
            900: [dt(1, 900, "Tchikita"), dt(2, 900, "Tchikita (Edit)"), dt(3, 5, "Feat")],
            901: DeezerError("code 501"),
        }
    )
    rep = importer_negatifs(conn, dz, NEGS, 10, "d")
    assert (rep.n_artists, rep.n_already, rep.n_added) == (2, 0, 1)
    assert (rep.n_duplicates, rep.n_filtered, rep.skipped) == (1, 1, ["Broken (DeezerError)"])
    row = conn.execute("SELECT * FROM artistes_negatifs").fetchone()
    assert (row["artiste_id"], row["category"]) == (900, "commercial_fr")
    assert conn.execute("SELECT provenance FROM titres").fetchone()[0] == "negatif"
    dz.calls.clear()
    rep2 = importer_negatifs(conn, dz, NEGS, 10, "d")
    assert rep2.n_already == 1 and dz.calls == [901]


def test_import_negatives_skips_library_artists(tmp_path: Path) -> None:
    # M83 (83) est un artiste de bibliothèque (tests.factories.make_library) : un négatif
    # partageant son deezer_id serait une étiquette empoisonnée (F5).
    conn = make_library(tmp_path)
    dz = FakeDeezer({901: [dt(1, 901, "Track")]})
    negs = [
        ArtisteNegatif(name="M83 imposteur", deezer_id=83, category="metal"),
        ArtisteNegatif(name="Broken", deezer_id=901, category="metal"),
    ]
    rep = importer_negatifs(conn, dz, negs, 10, "d")
    assert rep.skipped == ["M83 imposteur (dans la bibliothèque)"]
    assert (rep.n_added, dz.calls) == (1, [901])
    assert (
        conn.execute("SELECT COUNT(*) FROM artistes_negatifs WHERE artiste_id = 83").fetchone()[0]
        == 0
    )


def test_import_stops_when_deezer_is_unavailable(tmp_path: Path) -> None:
    conn = connect(tmp_path / "radio.db")
    dz = FakeDeezer({900: [dt(1, 900, "Tchikita")], 901: DeezerUnavailable("code 4")})
    with pytest.raises(DeezerUnavailable):
        importer_negatifs(conn, dz, NEGS, 10, "d")
    assert conn.execute("SELECT COUNT(*) FROM artistes_negatifs").fetchone()[0] == 1
