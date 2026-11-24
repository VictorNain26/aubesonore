from radio.bibliotheque.artistes import ArtisteBibliotheque
from radio.decouverte.voisins import chercher_voisins
from radio.sources.deezer import DeezerArtist

SEED = ArtisteBibliotheque(83, "M83", 13)


class FakeLastfm:
    def __init__(self, similar: list[str]) -> None:
        self.similar = similar
        self.calls: list[tuple[str, int]] = []

    def similar_artists(self, artist: str, limit: int = 100) -> list[str]:
        self.calls.append((artist, limit))
        return self.similar


class FakeDeezer:
    def __init__(self, related: list[DeezerArtist]) -> None:
        self._related = related

    def related(self, artist_id: int) -> list[DeezerArtist]:
        return self._related


def test_intersection_minus_library() -> None:
    lf = FakeLastfm(
        [
            "The Knife",
            "Wire",
            "Air",
            "Justice",
        ]
    )
    dz = FakeDeezer(
        [
            DeezerArtist(1, "Knife"),
            DeezerArtist(70, "Wire"),
            DeezerArtist(3, "Air"),
            DeezerArtist(4, "Only Deezer"),
            DeezerArtist(5, "Justice"),
        ]
    )
    got = chercher_voisins(SEED, dz, lf, 50, exclude_ids={70}, exclude_names=frozenset({"air"}))
    assert [a.id for a in got.artists] == [1, 5]
    assert (got.n_related, got.n_similar) == (5, 4)
    assert lf.calls == [("M83", 50)]


def test_no_lastfm_similar_means_no_neighbour() -> None:
    dz = FakeDeezer([DeezerArtist(1, "Knife")])
    got = chercher_voisins(SEED, dz, FakeLastfm([]), 50, set(), frozenset())
    assert got.artists == [] and (got.n_related, got.n_similar) == (1, 0)
