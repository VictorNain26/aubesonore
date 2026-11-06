"""The functions the site reads, and nothing else of the schema
(docs/conception.md §4): site/apps/backend/src/services/musilogyService.ts and
artistSlugs.ts call these eleven. Their signatures are the contract, every
column the site maps included: changing one is said in its PR, never slipped
into it."""

import pytest

from tests.conftest import (
    discogs_release,
    discogs_url,
    loaded,
    pg_query,
    synthetic_artist,
    synthetic_release_group,
)

ARTIST = "00000000-0000-4000-8000-0000000003a1"
MEMBER = "00000000-0000-4000-8000-0000000003a2"
OTHER_BAND = "00000000-0000-4000-8000-0000000003a3"
FORMER = "00000000-0000-4000-8000-0000000003a4"
PARTNER = "00000000-0000-4000-8000-0000000003a5"
RECORD = "00000000-0000-4000-8000-0000000003b1"
OTHER_RECORD = "00000000-0000-4000-8000-0000000003b2"
UNKNOWN = "00000000-0000-4000-8000-0000000003ff"

NEIGHBOUR = "mbid text, name text, disambiguation text, y0 integer, y_end integer, ended boolean"
CONTRACT = {
    "artist_card": (
        "artist text",
        "TABLE(mbid text, name text, disambiguation text, type text, country text, "
        "begin_area text, y_birth integer, y0 integer, y0_source text, y_end integer, "
        "y_end_source text, ended boolean, styles jsonb, listen_count bigint, user_count bigint)",
    ),
    "artist_urls": ("artist text", "TABLE(type text, url text)"),
    "artist_releases": (
        "artist text",
        "TABLE(mbid text, title text, primary_type text, soundtrack boolean, remix boolean, "
        "y integer)",
    ),
    "artist_bands": (
        "artist text",
        "TABLE(role text, mbid text, name text, disambiguation text, y0 integer, "
        "y_begin integer, y_end integer)",
    ),
    "artist_member_projects": (
        "artist text",
        "TABLE(mbid text, name text, disambiguation text, y0 integer, via text[])",
    ),
    "artist_other_names": (
        "artist text",
        "TABLE(kind text, mbid text, name text, disambiguation text, y0 integer)",
    ),
    "artist_same_sound": ("artist text", f"TABLE({NEIGHBOUR}, rank integer, term text)"),
    "artist_colisten": ("artist text", f"TABLE({NEIGHBOUR}, rank integer)"),
    "artist_credits": (
        "artist text",
        "TABLE(mbid text, name text, disambiguation text, y0 integer, records integer)",
    ),
    # The site does arithmetic on homonym_rank: a bigint would reach it as a string.
    "artist_homonym_rank": ("artists text[]", "TABLE(mbid text, homonym_rank integer)"),
    "search_artists": (
        "query text, page_size integer",
        "TABLE(mbid text, name text, disambiguation text, type text, y0 integer, "
        "user_count bigint)",
    ),
}


def related(kind, target):
    return {"type": kind, "direction": "forward", "mbid": target, "begin": None, "end": None}


@pytest.fixture(scope="module")
def site_database(tmp_path_factory, pg):
    """One load for the whole module, every test here reading, none writing.
    ARTIST has a row in each section, so that a function which ignored its
    argument would answer the unknown MBID too: a member also in OTHER_BAND,
    a former name, a page, a record shared with PARTNER, and PARTNER's
    listeners and Discogs style."""
    tmp = tmp_path_factory.mktemp("contract")
    artists = [
        synthetic_artist(
            ARTIST,
            "1990",
            None,
            name="Ab",
            urls=[
                discogs_url(1),
                {"type": "bandcamp", "url": "https://ab.bandcamp.com/", "ended": False},
            ],
        ),
        synthetic_artist(
            MEMBER,
            "1970",
            None,
            kind="Person",
            relations=[related("member of band", ARTIST), related("member of band", OTHER_BAND)],
        ),
        synthetic_artist(OTHER_BAND, "1995", None, urls=[discogs_url(3)]),
        synthetic_artist(FORMER, "1985", "1990", relations=[related("artist rename", ARTIST)]),
        synthetic_artist(PARTNER, "1990", None, urls=[discogs_url(2)]),
    ]
    release_groups = [
        synthetic_release_group(RECORD, ARTIST, "1991", co_artists=[PARTNER]),
        synthetic_release_group(OTHER_RECORD, OTHER_BAND, "1996"),
    ]
    # Three records each, the least a colour takes; OTHER_BAND's rock keeps
    # Krautrock from being every artist's style, which would weigh it nothing.
    discogs = [
        *(discogs_release(i, [1 + i % 2], 0, "1992", ["Krautrock"]) for i in range(10, 16)),
        *(discogs_release(i, [3], 0, "1996", ["Rock"]) for i in range(20, 23)),
    ]
    return loaded(
        tmp,
        pg,
        artists,
        popularity={ARTIST: 42},
        release_groups=release_groups,
        listening={user: [ARTIST, PARTNER] for user in range(3)},
        discogs=discogs,
    )


def test_the_functions_the_site_reads_keep_their_signatures(site_database):
    # Every one is in SQL and STABLE, as §4 says.
    names = ", ".join(f"'{name}'" for name in CONTRACT)
    rows = pg_query(
        site_database,
        "SELECT p.proname, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid), "
        "l.lanname, p.provolatile FROM pg_proc p "
        "JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang "
        f"WHERE n.nspname = 'musilogy' AND p.proname IN ({names})",
    )
    # A list, not a dict by name: a second overload of one function must show.
    assert sorted(rows) == sorted(
        (name, args, result, "sql", "s") for name, (args, result) in CONTRACT.items()
    )


BY_ARTIST = [name for name, (args, _) in CONTRACT.items() if args == "artist text"]


def rows(conninfo, call):
    return pg_query(conninfo, f"SELECT count(*) FROM musilogy.{call}")[0][0]


@pytest.mark.parametrize("function", BY_ARTIST)
def test_an_unknown_mbid_gets_no_row(site_database, function):
    assert rows(site_database, f"{function}('{ARTIST}')") > 0
    assert rows(site_database, f"{function}('{UNKNOWN}')") == 0


def test_an_unknown_mbid_gets_no_rank(site_database):
    assert rows(site_database, f"artist_homonym_rank(ARRAY['{ARTIST}'])") == 1
    assert rows(site_database, f"artist_homonym_rank(ARRAY['{UNKNOWN}'])") == 0
