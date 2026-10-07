from conftest import build_synthetic, synthetic_artist

A = "00000000-0000-4000-8000-0000000000b1"


def url(kind, address, ended=None):
    return {"type": kind, "url": address, "ended": ended}


def test_a_page_related_twice_is_one_row_ended_only_when_every_relation_is(tmp_path):
    con = build_synthetic(
        tmp_path,
        [
            synthetic_artist(
                A,
                "1980",
                None,
                urls=[
                    url("bandcamp", "https://a.bandcamp.com/", ended=True),
                    url("bandcamp", "https://a.bandcamp.com/"),
                    url("official homepage", "https://example.invalid/a", ended=True),
                    url("streaming", None),
                ],
            )
        ],
    )
    # A relation without a page points at nothing: dropped.
    assert con.execute("SELECT type, url, ended FROM urls ORDER BY type").fetchall() == [
        ("bandcamp", "https://a.bandcamp.com/", False),
        ("official homepage", "https://example.invalid/a", True),
    ]


def test_only_the_pages_an_artist_page_uses_are_kept(tmp_path):
    # Case this must catch: the scope widening back to every page, or a
    # listening platform reached under an unexpected relation type dropped.
    con = build_synthetic(
        tmp_path,
        [
            synthetic_artist(
                A,
                "1980",
                None,
                urls=[
                    url("free streaming", "https://www.deezer.com/artist/1"),
                    url("purchase for download", "https://itunes.apple.com/gb/artist/id1"),
                    url("other databases", "https://rateyourmusic.com/artist/a"),
                    url("discogs", "https://www.discogs.com/artist/1"),
                    url("social network", "https://twitter.com/a"),
                    url("image", "https://commons.wikimedia.org/wiki/File:A.jpg"),
                    url("streaming", "https://notdeezer.com/a"),
                ],
            )
        ],
    )
    assert con.execute("SELECT url FROM urls ORDER BY url").fetchall() == [
        ("https://itunes.apple.com/gb/artist/id1",),
        ("https://www.deezer.com/artist/1",),
    ]


BEATLES = "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d"


def test_the_beatles_keep_their_listening_pages_their_site_and_their_items(con):
    assert con.execute(
        "SELECT type, url FROM urls WHERE artist_mbid = ? ORDER BY type, url", [BEATLES]
    ).fetchall() == [
        ("free streaming", "https://open.spotify.com/artist/3WrFJ7ztbogyGnTHbHJFl2"),
        ("free streaming", "https://www.deezer.com/artist/1"),
        ("official homepage", "https://www.thebeatles.com/"),
        ("purchase for download", "https://itunes.apple.com/gb/artist/id136975"),
        ("purchase for download", "https://music.apple.com/gb/artist/136975"),
        ("soundcloud", "https://soundcloud.com/thebeatles"),
        ("streaming", "https://music.apple.com/gb/artist/136975"),
        ("wikidata", "https://www.wikidata.org/wiki/Q1299"),
    ]
