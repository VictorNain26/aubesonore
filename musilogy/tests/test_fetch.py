import http.client
import json
import urllib.error
from email.message import Message

import pytest

from musilogy import REFERENCE_DUMP, fetch
from musilogy.fetch import ChecksumError, expected_sums, sha256_file, verify
from musilogy.paths import REFERENCE_DIR

REF = REFERENCE_DIR / f"{REFERENCE_DUMP}.SHA256SUMS"


def test_sha256_of_known_content(tmp_path):
    p = tmp_path / "a.bin"
    p.write_bytes(b"musilogy")
    assert sha256_file(p) == ("a4164857777a9573db9057c25dd069b99c641aa3909b3fe38e5e3e711dfa01ae")


def test_expected_sums_reads_the_reference_file():
    sums = expected_sums(REF)
    assert sums["artist.tar.xz"] == (
        "a68940e911830f65ff412275f4ba8a9100569cba1f677bdd6e6c091938e452f2"
    )
    assert sums["release-group.tar.xz"] == (
        "38de1e46c25b6b6e5acc051e3ab359ed13e873056e1ddfe4aae75fe2e642124f"
    )


def test_verify_rejects_a_corrupted_file(tmp_path):
    p = tmp_path / "a.bin"
    p.write_bytes(b"corrompu")
    with pytest.raises(ChecksumError):
        verify(p, "0" * 64)


def mbids(n, start=0):
    return [f"00000000-0000-4000-8000-{i:012d}" for i in range(start, start + n)]


def answer(batch):
    return [{"artist_mbid": m, "total_listen_count": 10, "total_user_count": 2} for m in batch]


@pytest.fixture
def slept(monkeypatch):
    waits: list[float] = []
    monkeypatch.setattr("musilogy.fetch.time.sleep", waits.append)
    return waits


def test_a_snapshot_keeps_every_answer_in_order_and_paces_the_requests(
    tmp_path, monkeypatch, slept
):
    # Breaks if a batch is lost or reordered, or if requests go out faster
    # than the one per second ListenBrainz asks of every client.
    asked = []

    def post(_url, payload):
        asked.append(payload["artist_mbids"])
        return answer(payload["artist_mbids"]), message_with({"X-RateLimit-Remaining": "20"})

    monkeypatch.setattr(fetch, "_post", post)
    batches = [mbids(3), mbids(2, start=3)]
    dest = tmp_path / "snap" / "artist-popularity.jsonl"
    assert fetch.fetch_popularity(iter(batches), dest) == 5
    assert asked == batches
    rows = [json.loads(line) for line in dest.read_text(encoding="utf-8").splitlines()]
    assert [r["artist_mbid"] for r in rows] == mbids(5)
    assert slept == [0.0, fetch.MIN_INTERVAL]


@pytest.mark.usefixtures("slept")
def test_a_snapshot_cut_short_resumes_where_it_stopped(tmp_path, monkeypatch):
    # Breaks if a resumed run asks again what it holds, keeps a batch written
    # halfway, or keeps rows that do not answer the batch at their place.
    asked = []

    def post(_url, payload):
        asked.append(payload["artist_mbids"])
        return answer(payload["artist_mbids"]), message_with({"X-RateLimit-Remaining": "20"})

    monkeypatch.setattr(fetch, "_post", post)
    batches = [mbids(2), mbids(2, start=2), mbids(2, start=4)]
    dest = tmp_path / "artist-popularity.jsonl"
    written = [json.dumps(r) + "\n" for r in answer(mbids(3))]
    dest.with_name(dest.name + ".partial").write_text(
        "".join(written) + written[0][:10], encoding="utf-8"
    )

    assert fetch.fetch_popularity(iter(batches), dest) == 6
    assert asked == batches[1:]
    rows = [json.loads(line) for line in dest.read_text(encoding="utf-8").splitlines()]
    assert [r["artist_mbid"] for r in rows] == mbids(6)


@pytest.mark.usefixtures("slept")
def test_bytes_left_by_a_crash_are_cut_and_asked_again(tmp_path, monkeypatch):
    asked = []

    def post(_url, payload):
        asked.append(payload["artist_mbids"])
        return answer(payload["artist_mbids"]), message_with({"X-RateLimit-Remaining": "20"})

    monkeypatch.setattr(fetch, "_post", post)
    batches = [mbids(2), mbids(2, start=2)]
    dest = tmp_path / "artist-popularity.jsonl"
    written = "".join(json.dumps(r) + "\n" for r in answer(mbids(2)))
    dest.with_name(dest.name + ".partial").write_bytes(written.encode() + b"\x00\xff\x00\n")

    assert fetch.fetch_popularity(iter(batches), dest) == 4
    assert asked == batches[1:]


def test_a_connection_cut_mid_answer_is_retried(monkeypatch, slept):
    calls = []

    def post(_url, payload):
        calls.append(1)
        if len(calls) == 1:
            raise http.client.RemoteDisconnected("Remote end closed connection")
        return answer(payload["artist_mbids"]), message_with({"X-RateLimit-Remaining": "5"})

    monkeypatch.setattr(fetch, "_post", post)
    rows, _ = fetch.popularity_batch(mbids(2))
    assert len(rows) == 2
    assert slept == [2.0]


@pytest.mark.usefixtures("slept")
def test_an_exhausted_window_waits_for_its_reset(monkeypatch):
    monkeypatch.setattr(
        fetch,
        "_post",
        lambda _url, payload: (
            answer(payload["artist_mbids"]),
            message_with({"X-RateLimit-Remaining": "0", "X-RateLimit-Reset-In": "7"}),
        ),
    )
    assert fetch.popularity_batch(mbids(1))[1] == 7.0


def test_a_throttled_batch_is_asked_again_after_the_reset(monkeypatch, slept):
    calls = []

    def post(url, payload):
        calls.append(1)
        if len(calls) == 1:
            raise urllib.error.HTTPError(
                url, 429, "Too Many Requests", message_with({"X-RateLimit-Reset-In": "4"}), None
            )
        return answer(payload["artist_mbids"]), message_with({"X-RateLimit-Remaining": "5"})

    monkeypatch.setattr(fetch, "_post", post)
    rows, _ = fetch.popularity_batch(mbids(2))
    assert len(rows) == 2
    assert slept == [4.0]


def test_an_outage_of_a_few_minutes_is_ridden_out(monkeypatch, slept):
    # Breaks if a server error gives up before about three minutes: the run
    # that hit a 502 burst on 2026-10-02 lost 25 minutes of snapshot.
    calls = []

    def post(url, payload):
        calls.append(1)
        if len(calls) < fetch.MAX_ATTEMPTS:
            raise urllib.error.HTTPError(url, 502, "Bad Gateway", message_with({}), None)
        return answer(payload["artist_mbids"]), message_with({"X-RateLimit-Remaining": "5"})

    monkeypatch.setattr(fetch, "_post", post)
    rows, _ = fetch.popularity_batch(mbids(2))
    assert len(rows) == 2
    assert slept == [2.0, 4.0, 8.0, 16.0, 32.0, 60.0, 60.0]


def test_a_rejected_batch_is_not_retried(monkeypatch, slept):
    def post(url, _payload):
        raise urllib.error.HTTPError(url, 400, "Bad Request", message_with({}), None)

    monkeypatch.setattr(fetch, "_post", post)
    with pytest.raises(fetch.DownloadError):
        fetch.popularity_batch(mbids(1))
    assert slept == []


@pytest.mark.usefixtures("slept")
def test_an_answer_for_other_artists_is_refused(tmp_path, monkeypatch):
    # The counts would land on the wrong artists without anything noticing:
    # the batch is checked mbid by mbid, in order. An interrupted snapshot
    # leaves no file under the final name.
    monkeypatch.setattr(
        fetch,
        "_post",
        lambda _url, payload: (answer(payload["artist_mbids"][::-1]), message_with({})),
    )
    dest = tmp_path / "artist-popularity.jsonl"
    with pytest.raises(fetch.DownloadError):
        fetch.fetch_popularity(iter([mbids(2)]), dest)
    assert not dest.exists()


def message_with(headers):
    m = Message()
    for k, v in headers.items():
        m[k] = v
    return m


def neighbours(mbid, n=2):
    return [
        {"artist_mbid": m, "name": "x", "score": 100 - i, "reference_mbid": mbid}
        for i, m in enumerate(mbids(n, start=900))
    ]


def test_a_proximity_snapshot_keeps_one_line_per_artist_in_order(tmp_path, monkeypatch, slept):
    # Breaks if an artist is lost or reordered, or if the snapshot keeps
    # fields the build does not read (names change; the MBID is the key).
    asked = []

    def get(_url, params):
        asked.append(params["artist_mbids"])
        return neighbours(params["artist_mbids"]), Message()

    monkeypatch.setattr(fetch, "_get", get)
    dest = tmp_path / "snap" / "artist-similar.jsonl"
    assert fetch.fetch_proximity(iter(mbids(3)), dest) == 3
    assert asked == mbids(3)
    rows = [json.loads(line) for line in dest.read_text(encoding="utf-8").splitlines()]
    assert [r["artist_mbid"] for r in rows] == mbids(3)
    assert rows[0]["similar"] == [
        {"artist_mbid": mbids(1, start=900)[0], "score": 100},
        {"artist_mbid": mbids(1, start=901)[0], "score": 99},
    ]
    assert len(slept) == 3
    assert all(0 < wait <= fetch.MIN_INTERVAL for wait in slept)


@pytest.mark.usefixtures("slept")
def test_a_proximity_snapshot_cut_short_resumes_where_it_stopped(tmp_path, monkeypatch):
    asked = []

    def get(_url, params):
        asked.append(params["artist_mbids"])
        return neighbours(params["artist_mbids"]), Message()

    monkeypatch.setattr(fetch, "_get", get)
    dest = tmp_path / "artist-similar.jsonl"
    written = [json.dumps({"artist_mbid": m, "similar": []}) + "\n" for m in mbids(2)]
    dest.with_name(dest.name + ".partial").write_text(
        "".join(written) + written[0][:10], encoding="utf-8"
    )

    assert fetch.fetch_proximity(iter(mbids(4)), dest) == 4
    assert asked == mbids(2, start=2)


@pytest.mark.usefixtures("slept")
def test_neighbours_of_another_artist_are_refused(monkeypatch):
    # Breaks if a neighbour could land on an artist it was not asked for.
    monkeypatch.setattr(
        fetch, "_get", lambda _url, _params: (neighbours(mbids(1, start=7)[0]), Message())
    )
    with pytest.raises(fetch.DownloadError):
        fetch.similar_artists(mbids(1)[0])
