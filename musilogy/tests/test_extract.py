import io
import logging
import lzma
import tarfile

import pytest

from musilogy.extract import extract, iter_records, reduce_artist, reduce_release_group

GROUP = {
    "id": "a9424175-8b06-44ad-a1f4-319e92a50879",
    "name": "Disincarnate",
    "type": "Group",
    "country": "US",
    "life-span": {"begin": "1992", "end": None, "ended": False},
    "area": {"name": "United States"},
    "begin-area": {"id": "ff21865c-ce46-4417-967c-a3d2d02d29bf", "name": "Tampa"},
    "genres": [{"id": "eacfa027-2fad-413f-a2f1-80fa43674f0b", "name": "death metal", "count": 1}],
    "relations": [
        {
            "type": "member of band",
            "target-type": "artist",
            "direction": "backward",
            "begin": "1991",
            "end": "1991",
            "artist": {"id": "5b640e8d-bcb8-45be-a32e-8f4325c8d6c9", "name": "Alex Marquez"},
        },
        {
            "type": "discogs",
            "target-type": "url",
            "direction": "forward",
            "url": {"resource": "https://example.invalid"},
        },
    ],
}


def test_reduce_artist_keeps_genre_mbid_and_votes():
    out = reduce_artist(GROUP)
    assert out is not None
    assert out["mbid"] == GROUP["id"]
    assert out["begin"] == "1992"
    assert out["ended"] is False
    assert out["begin_area"] == "Tampa"
    assert out["begin_area_mbid"] == "ff21865c-ce46-4417-967c-a3d2d02d29bf"
    assert out["genres"] == [
        {"mbid": "eacfa027-2fad-413f-a2f1-80fa43674f0b", "name": "death metal", "votes": 1}
    ]


def test_reduce_artist_keeps_the_disambiguation_comment_as_written():
    # Breaks if the projection drops the field or normalises it here: turning
    # "" into NULL is a rule, and rules live in 10_bands.sql.
    for comment in ("Tampa death metal", ""):
        out = reduce_artist({**GROUP, "disambiguation": comment})
        assert out is not None
        assert out["disambiguation"] == comment


def test_reduce_artist_drops_area_no_table_consumes():
    # `area` is present in the source record above and must not survive the
    # projection: it duplicated `country` and `begin_area`, both published,
    # for 9.9 MB of the intermediate that no table ever read.
    out = reduce_artist(GROUP)
    assert out is not None
    assert "area" not in out
    assert out["country"] == "US"
    assert out["begin_area"] == "Tampa"


def test_reduce_artist_keeps_artist_relations_with_their_type_and_direction():
    # The discogs relation targets a URL, not an artist: it has no place in a
    # table of links between artists.
    out = reduce_artist(GROUP)
    assert out is not None
    assert out["relations"] == [
        {
            "type": "member of band",
            "direction": "backward",
            "mbid": "5b640e8d-bcb8-45be-a32e-8f4325c8d6c9",
            "begin": "1991",
            "end": "1991",
        }
    ]


def test_reduce_artist_keeps_url_relations_with_their_type_and_end():
    # Case this must catch: url relations dropped again, or their type lost,
    # which would leave artist_urls without a platform to name.
    out = reduce_artist(
        {
            **GROUP,
            "relations": [
                *GROUP["relations"],
                {
                    "type": "bandcamp",
                    "target-type": "url",
                    "ended": True,
                    "url": {"resource": "https://disincarnate.bandcamp.com/"},
                },
            ],
        }
    )
    assert out is not None
    assert out["urls"] == [
        {"type": "discogs", "url": "https://example.invalid", "ended": None},
        {"type": "bandcamp", "url": "https://disincarnate.bandcamp.com/", "ended": True},
    ]


def test_reduce_artist_keeps_persons():
    out = reduce_artist({"id": "x", "name": "y", "type": "Person"})
    assert out is not None
    assert out["type"] == "Person"


def test_reduce_artist_drops_the_types_outside_the_population():
    # On the reference dump untyped artists carry almost no links (2.6 %),
    # "Other" few (11.7 %), against a third of the persons; characters are
    # linked, but almost only to the persons who voice them.
    for kind in ("Character", "Other", None):
        assert reduce_artist({"id": "x", "name": "y", "type": kind}) is None


def test_reduce_artist_refuses_a_genre_without_a_vote_count():
    # An absent count used to become 0 votes — a measurement asserted where the
    # source is silent, and the sort of 10_bands.sql would rank it last as if
    # it had been measured. The dump always emits count; a record without one
    # is malformed input, and the boundary is where it must fail.
    with pytest.raises(KeyError):
        reduce_artist(
            {"id": "x", "name": "y", "type": "Group", "genres": [{"id": "g", "name": "n"}]}
        )


def test_reduce_release_group_keeps_duplicate_credits():
    rec = {
        "id": "rg",
        "title": "T",
        "first-release-date": "1989",
        "primary-type": "Album",
        "secondary-types": [],
        "artist-credit": [{"artist": {"id": "a"}}, {"artist": {"id": "a"}}],
    }
    reduced = reduce_release_group(rec)
    assert reduced is not None
    assert reduced["artists"] == ["a", "a"]


def test_reduce_release_group_keeps_genre_mbid_and_votes():
    rec = {
        "id": "rg",
        "primary-type": "Album",
        "genres": [
            {"id": "eacfa027-2fad-413f-a2f1-80fa43674f0b", "name": "death metal", "count": 2}
        ],
    }
    reduced = reduce_release_group(rec)
    assert reduced is not None
    assert reduced["genres"] == [
        {"mbid": "eacfa027-2fad-413f-a2f1-80fa43674f0b", "name": "death metal", "votes": 2}
    ]


def test_reduce_release_group_refuses_a_genre_without_a_vote_count():
    with pytest.raises(KeyError):
        reduce_release_group({"id": "r", "primary-type": "Album", "genres": [{"id": "g"}]})


def test_reduce_release_group_keeps_eps_and_names_the_type():
    for kind in ("Album", "EP"):
        reduced = reduce_release_group({"id": "r", "primary-type": kind})
        assert reduced is not None
        assert reduced["primary_type"] == kind


def test_reduce_release_group_drops_singles_and_the_other_types():
    for kind in ("Single", "Broadcast", "Other", None):
        assert reduce_release_group({"id": "r", "primary-type": kind}) is None


def _write_mbdump_archive(path, lines: list[bytes]) -> None:
    content = b"\n".join(lines) + b"\n"
    with lzma.open(path, "wb") as xz, tarfile.open(fileobj=xz, mode="w|") as tar:
        info = tarfile.TarInfo(name="mbdump/mbdump")
        info.size = len(content)
        tar.addfile(info, io.BytesIO(content))


def test_iter_records_surfaces_malformed_lines_instead_of_dropping_them_silently(tmp_path, caplog):
    archive = tmp_path / "sample.tar.xz"
    _write_mbdump_archive(archive, [b'{"id": "ok"}', b"{not json"])

    with caplog.at_level(logging.WARNING):
        records = list(iter_records(archive))

    assert records == [{"id": "ok"}]
    assert any("1" in r.message for r in caplog.records)


def test_extract_reports_what_it_dropped(tmp_path):
    # A rule that removes data must leave a visible trace: the primary-type
    # filter lives in the projection for size reasons — keeping every
    # release-group, singles included, would inflate the intermediate — so the
    # count is the only way the manifest can show what it cost.
    archive = tmp_path / "sample.tar.xz"
    _write_mbdump_archive(
        archive,
        [
            b'{"id": "a", "primary-type": "Album", "artist-credit": []}',
            b'{"id": "b", "primary-type": "Single", "artist-credit": []}',
            b'{"id": "c", "primary-type": "EP", "artist-credit": []}',
        ],
    )
    kept, dropped = extract(archive, reduce_release_group, tmp_path / "out.jsonl")
    assert (kept, dropped) == (2, 1)
