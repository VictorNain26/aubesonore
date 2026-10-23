import logging

import pytest
import requests
import responses
from pyrate_limiter import Duration, Limiter, Rate

from radio.sources.lastfm import (
    LastfmClient,
    LastfmError,
    LastfmUnavailable,
)

URL = "https://ws.audioscrobbler.com/2.0/"
KEY = "k3y-s3cr3t"


def client() -> LastfmClient:
    return LastfmClient(KEY, limiter=Limiter(Rate(1000, Duration.SECOND)))


@responses.activate
def test_similar_artists() -> None:
    responses.get(
        URL,
        json={"similarartists": {"artist": [{"name": "Wire", "match": "0.83", "mbid": ""}]}},
    )
    assert client().similar_artists("A Certain Ratio", limit=50) == ["Wire"]
    p = responses.calls[0].request.params
    assert p["method"] == "artist.getSimilar" and p["artist"] == "A Certain Ratio"
    assert p["limit"] == "50" and p["autocorrect"] == "1" and p["format"] == "json"


@responses.activate
def test_single_similar_object_is_a_list() -> None:
    responses.get(URL, json={"similarartists": {"artist": {"name": "Wire", "match": "1"}}})
    assert client().similar_artists("x") == ["Wire"]


@responses.activate
def test_unknown_artist_gives_empty() -> None:
    responses.get(URL, json={"error": 6, "message": "not found"})
    assert client().similar_artists("zzz") == []


@pytest.mark.parametrize("code", [8, 11, 16, 29, 10, 26])
@responses.activate
def test_transient_and_global_codes_are_unavailable(code: int) -> None:
    responses.get(URL, json={"error": code, "message": f"api_key={KEY}"})
    with pytest.raises(LastfmUnavailable) as exc:
        client().similar_artists("x")
    assert KEY not in str(exc.value)


@responses.activate
def test_other_code_is_definitive() -> None:
    responses.get(URL, json={"error": 13, "message": "Invalid method signature"})
    with pytest.raises(LastfmError):
        client().similar_artists("x")
    assert len(responses.calls) == 1


@responses.activate
def test_http_errors_without_json() -> None:
    responses.get(URL, status=503, body="down")
    with pytest.raises(LastfmUnavailable):
        client().similar_artists("x")
    responses.replace(responses.GET, URL, status=403, body="forbidden")
    with pytest.raises(LastfmError):
        client().similar_artists("x")


@responses.activate
def test_network_error_leaks_no_key(caplog: pytest.LogCaptureFixture) -> None:
    responses.get(URL, body=requests.ConnectionError(f"{URL}?api_key={KEY}"))
    with caplog.at_level(logging.DEBUG), pytest.raises(LastfmUnavailable) as exc:
        client().similar_artists("x")
    assert KEY not in str(exc.value)
    assert KEY not in caplog.text


def test_unavailable_is_not_a_lastfm_error() -> None:
    assert not issubclass(LastfmUnavailable, LastfmError)
