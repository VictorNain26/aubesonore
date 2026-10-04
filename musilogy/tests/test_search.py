from conftest import loaded, pg_query, synthetic_artist


def mbid(i):
    return f"00000000-0000-4000-8000-0000000001{i:02d}"


def artists(*names):
    return [synthetic_artist(mbid(i), "1990", None, name=n) for i, n in enumerate(names)]


def search(conninfo, query, page_size=10):
    escaped = query.replace("'", "''")
    return [
        r[0]
        for r in pg_query(
            conninfo, f"SELECT name FROM musilogy.search_artists('{escaped}', {page_size})"
        )
    ]


def test_a_prefix_finds_the_name_whatever_its_case_and_accents(tmp_path, pg):
    loaded(tmp_path, pg, artists("Björk", "Bjorn Again", "Blur"), popularity={})
    # Neither has a listen: by name then, "bjork" before "bjorn again".
    assert search(pg, "BJÖ") == search(pg, "bjo") == ["Björk", "Bjorn Again"]
    assert search(pg, "björk") == ["Björk"]


def test_the_most_listened_come_first_and_the_unknown_last(tmp_path, pg):
    # Ab has no listen on ListenBrainz: after every artist it has, not before
    # them as a NULL sorted descending would be.
    loaded(tmp_path, pg, artists("Ab", "Abc", "Abd"), popularity={mbid(1): 500, mbid(2): 10})
    assert search(pg, "ab") == ["Abc", "Abd", "Ab"]
    assert search(pg, "ab", page_size=2) == ["Abc", "Abd"]


def test_an_empty_query_finds_no_one_rather_than_everyone(tmp_path, pg):
    # A lone accent normalizes to nothing as well.
    loaded(tmp_path, pg, artists("Ab", "Abc"), popularity={})
    assert search(pg, "") == []
    assert search(pg, "́") == []


def test_like_wildcards_are_plain_characters(tmp_path, pg):
    loaded(tmp_path, pg, artists("A_C", "ABC", "100%"), popularity={})
    assert search(pg, "a_") == ["A_C"]
    assert search(pg, "%") == []
    assert search(pg, "100%") == ["100%"]


def test_the_query_is_normalized_the_way_name_key_is(tmp_path, pg):
    # name_key is built by DuckDB, the query by Postgres. Each name, typed as
    # it is written, must find itself: the Devanagari vowel signs, the Greek
    # tonos and the Hangul syllables are where a narrower normalization
    # (lowercase and Latin accents only) lost 12 987 names of the dump.
    names = ("हिन्दी", "Ελληνικά", "방탄소년단", "Motörhead", "Sigur Rós")
    loaded(tmp_path, pg, artists(*names), popularity={})
    assert [search(pg, n) for n in names] == [[n] for n in names]
