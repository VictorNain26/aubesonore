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
                    url("social network", "https://example.invalid/a", ended=True),
                    url("streaming", None),
                ],
            )
        ],
    )
    # A relation without a page points at nothing: dropped.
    assert con.execute("SELECT type, url, ended FROM urls ORDER BY type").fetchall() == [
        ("bandcamp", "https://a.bandcamp.com/", False),
        ("social network", "https://example.invalid/a", True),
    ]


def test_the_same_page_under_two_types_stays_two_rows(tmp_path):
    # MusicBrainz relates one page as both "streaming" and "purchase for
    # download" when it is both; each type is a statement of its own.
    con = build_synthetic(
        tmp_path,
        [
            synthetic_artist(
                A,
                "1980",
                None,
                urls=[
                    url("streaming", "https://a.bandcamp.com/"),
                    url("purchase for download", "https://a.bandcamp.com/"),
                ],
            )
        ],
    )
    assert con.execute("SELECT count(*) FROM urls").fetchone() == (2,)


BEATLES = "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d"


def test_the_beatles_keep_their_pages_and_the_ones_that_are_no_longer_theirs(con):
    # 73 pages in the dump, 6 of them ended: kept and flagged, so the
    # population stays whole and artist_urls leaves them out.
    assert con.execute(
        "SELECT count(*), count(*) FILTER (WHERE ended) FROM urls WHERE artist_mbid = ?",
        [BEATLES],
    ).fetchone() == (73, 6)
    assert con.execute(
        "SELECT type, url FROM urls WHERE artist_mbid = ? "
        "AND type IN ('official homepage', 'wikidata') ORDER BY type",
        [BEATLES],
    ).fetchall() == [
        ("official homepage", "https://www.thebeatles.com/"),
        ("wikidata", "https://www.wikidata.org/wiki/Q1299"),
    ]
