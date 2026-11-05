"""The functions the site reads, and nothing else of the schema
(docs/conception.md §4): site/apps/backend/src/services/musilogyService.ts and
artistSlugs.ts call these eleven. Their signatures are the contract, every
column the site maps included: changing one is said in its PR, never slipped
into it."""

import pytest

from tests.conftest import loaded, pg_query, synthetic_artist

ARTIST = "00000000-0000-4000-8000-0000000003a1"
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


@pytest.fixture(scope="module")
def site_database(tmp_path_factory, pg):
    """One load for the whole module: every test here reads, none writes."""
    artist = synthetic_artist(ARTIST, "1990", None, name="Ab")
    return loaded(tmp_path_factory.mktemp("contract"), pg, [artist], popularity={ARTIST: 42})


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
    assert {name: (args, result, lang, vol) for name, args, result, lang, vol in rows} == {
        name: (args, result, "sql", "s") for name, (args, result) in CONTRACT.items()
    }


BY_ARTIST = [name for name, (args, _) in CONTRACT.items() if args == "artist text"]


@pytest.mark.parametrize("function", BY_ARTIST)
def test_an_unknown_mbid_gets_no_row(site_database, function):
    rows = pg_query(site_database, f"SELECT count(*) FROM musilogy.{function}('{UNKNOWN}')")
    assert rows == [(0,)]


def test_an_unknown_mbid_gets_no_rank(site_database):
    assert pg_query(
        site_database, f"SELECT count(*) FROM musilogy.artist_homonym_rank(ARRAY['{UNKNOWN}'])"
    ) == [(0,)]
