import logging

import pytest
import requests
import responses
from pyrate_limiter import Duration, Limiter, Rate

from radio.sources.deezer import (
    DeezerAlbum,
    DeezerArtist,
    DeezerClient,
    DeezerError,
    DeezerTrack,
    DeezerUnavailable,
)

URL = "https://api.deezer.com/search/track"


def client() -> DeezerClient:
    return DeezerClient(limiter=Limiter(Rate(1000, Duration.SECOND)))


def item(**over: object) -> dict[str, object]:
    base: dict[str, object] = {
        "id": 3135556,
        "title": "Harder, Better, Faster, Stronger",
        "title_short": "Harder, Better, Faster, Stronger",
        "duration": 224,
        "rank": 850000,
        "preview": "https://cdnt-preview.dzcdn.net/signed",
        "artist": {"id": 27, "name": "Daft Punk"},
    }
    base.update(over)
    return base


@responses.activate
def test_search_parses_tracks() -> None:
    responses.get(URL, json={"data": [item()]})
    got = client().search_tracks('artist:"Daft Punk" track:"Harder"')
    assert got == [
        DeezerTrack(
            id=3135556,
            title="Harder, Better, Faster, Stronger",
            title_short="Harder, Better, Faster, Stronger",
            duration_s=224,
            rank=850000,
            artist_id=27,
            artist_name="Daft Punk",
            has_preview=True,
        )
    ]
    assert responses.calls[0].request.params == {
        "q": 'artist:"Daft Punk" track:"Harder"',
        "limit": "10",
    }


@responses.activate
def test_missing_preview_and_title_short() -> None:
    responses.get(URL, json={"data": [item(preview="", title_short=None)]})
    (t,) = client().search_tracks("q")
    assert t.has_preview is False
    assert t.title_short == t.title


@responses.activate
def test_code_800_is_empty() -> None:
    responses.get(URL, json={"error": {"code": 800, "message": "no data"}})
    assert client().search_tracks("q") == []


@responses.activate
def test_quota_is_retried_then_unavailable() -> None:
    responses.get(URL, json={"error": {"code": 4, "message": "Quota limit exceeded"}})
    with pytest.raises(DeezerUnavailable):
        client().search_tracks("q")
    assert len(responses.calls) == 3


@responses.activate
def test_quota_then_success() -> None:
    responses.get(URL, json={"error": {"code": 4}})
    responses.get(URL, json={"data": [item()]})
    assert len(client().search_tracks("q")) == 1


@responses.activate
def test_other_code_is_definitive() -> None:
    responses.get(URL, json={"error": {"code": 501, "message": "x"}})
    with pytest.raises(DeezerError):
        client().search_tracks("q")
    assert len(responses.calls) == 1


@responses.activate
def test_http_500_and_network_are_unavailable() -> None:
    responses.get(URL, status=500)
    with pytest.raises(DeezerUnavailable):
        client().search_tracks("q")
    responses.replace(responses.GET, URL, body=requests.ConnectionError("boom https://x"))
    with pytest.raises(DeezerUnavailable) as exc:
        client().search_tracks("q")
    assert "https" not in str(exc.value)


@responses.activate
def test_http_404_is_definitive() -> None:
    responses.get(URL, status=404, body="not json")
    with pytest.raises(DeezerError):
        client().search_tracks("q")


@responses.activate
def test_malformed_item_is_definitive() -> None:
    responses.get(URL, json={"data": [{"id": 1}]})
    with pytest.raises(DeezerError):
        client().search_tracks("q")


def test_unavailable_is_not_a_deezer_error() -> None:
    assert not issubclass(DeezerUnavailable, DeezerError)


API = "https://api.deezer.com"
PREVIEW = "https://cdnt-preview.dzcdn.net/api/1/1/x.mp3?hdnea=SIGNED-SECRET"


@responses.activate
def test_related() -> None:
    responses.get(
        API + "/artist/27/related",
        json={"data": [{"id": 1, "name": "Justice", "nb_fan": 10}], "total": 1},
    )
    assert client().related(27) == [DeezerArtist(1, "Justice")]


@responses.activate
def test_top_passes_limit() -> None:
    responses.get(API + "/artist/27/top", json={"data": [item()], "total": 100})
    assert [t.id for t in client().top(27, limit=10)] == [3135556]
    assert responses.calls[0].request.params == {"limit": "10"}


@responses.activate
def test_track_returns_fresh_preview_url() -> None:
    responses.get(API + "/track/3135556", json=item())
    got = client().track(3135556)
    assert got is not None
    track, url = got
    assert (track.id, track.rank) == (3135556, 850000)
    assert url == "https://cdnt-preview.dzcdn.net/signed"


@responses.activate
def test_track_without_preview() -> None:
    responses.get(API + "/track/1", json=item(id=1, preview=""))
    got = client().track(1)
    assert got is not None and got[1] is None


@responses.activate
def test_gone_track_is_none() -> None:
    responses.get(API + "/track/1", json={"error": {"type": "DataException", "code": 800}})
    assert client().track(1) is None


@responses.activate
def test_track_page_carries_preview_and_album_in_one_request() -> None:
    album = {"id": 1, "title": "Discovery", "cover_xl": "https://cdn/cover.jpg"}
    responses.get(API + "/track/1", json=item(id=1, album=album))
    responses.get(API + "/track/2", json=item(id=2, album={"id": 2, "title": "Sans image"}))
    responses.get(API + "/track/4", json=item(id=4))
    responses.get(API + "/track/3", json={"error": {"type": "DataException", "code": 800}})
    page = client().track_page(1)
    assert page is not None
    assert page.track.id == 1 and page.preview_url == "https://cdnt-preview.dzcdn.net/signed"
    assert page.album == DeezerAlbum("Discovery", "https://cdn/cover.jpg")
    assert "dzcdn" not in repr(page)
    second = client().track_page(2)
    assert second is not None and second.album == DeezerAlbum("Sans image", None)
    fourth = client().track_page(4)
    assert fourth is not None and fourth.album is None
    assert client().track_page(3) is None
    assert len(responses.calls) == 4


@responses.activate
def test_track_page_keeps_only_a_well_formed_isrc() -> None:
    responses.get(API + "/track/1", json=item(id=1, isrc="FRZ039800212"))
    responses.get(API + "/track/2", json=item(id=2, isrc=""))
    responses.get(API + "/track/3", json=item(id=3, isrc="FR-Z03-98-00212"))
    responses.get(API + "/track/4", json=item(id=4))
    isrcs = [p.isrc if (p := client().track_page(t)) else "?" for t in (1, 2, 3, 4)]
    assert isrcs == ["FRZ039800212", None, None, None]


@responses.activate
def test_download() -> None:
    responses.get(PREVIEW, body=b"ID3data")
    assert client().download(PREVIEW) == b"ID3data"


@responses.activate
def test_preview_server_error_is_retried() -> None:
    responses.get(PREVIEW, status=503)
    with pytest.raises(DeezerUnavailable):
        client().download(PREVIEW)
    assert len(responses.calls) == 3


@responses.activate
def test_preview_errors_never_carry_the_signed_url(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    responses.get(PREVIEW, status=404)
    with pytest.raises(DeezerError) as definitive:
        client().download(PREVIEW)
    responses.replace(responses.GET, PREVIEW, body=requests.ConnectionError(PREVIEW))
    with pytest.raises(DeezerUnavailable) as transient:
        client().download(PREVIEW)
    for text in (str(definitive.value), str(transient.value), caplog.text):
        assert "SIGNED-SECRET" not in text


@responses.activate
def test_editorial_selection_and_album_tracks() -> None:
    responses.get(API + "/editorial/85/selection", json={"data": [{"id": 7}, {"id": 8}]})
    responses.get(API + "/album/7/tracks", json={"data": [item()]})
    assert client().editorial_selection(85) == [7, 8]
    assert [t.id for t in client().album_tracks(7)] == [3135556]
    responses.replace(responses.GET, API + "/editorial/85/selection", json={"data": [{"x": 1}]})
    with pytest.raises(DeezerError):
        client().editorial_selection(85)
