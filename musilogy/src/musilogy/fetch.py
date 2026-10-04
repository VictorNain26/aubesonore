"""Downloads and verifies the MusicBrainz archives and the ListenBrainz snapshots."""

from __future__ import annotations

import hashlib
import http.client
import itertools
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable, Iterator
from email.message import Message
from http import HTTPStatus
from pathlib import Path
from typing import Any

UA = "musilogy/0.1 ( victor.lenain26@gmail.com )"
BASE = "https://data.metabrainz.org/pub/musicbrainz/data/json-dumps"
DOWNLOAD_TIMEOUT = 30.0  # seconds, per connection (connect + each read)


class ChecksumError(Exception):
    pass


class DownloadError(Exception):
    pass


def sha256_file(path: Path) -> str:
    with path.open("rb") as fh:
        return hashlib.file_digest(fh, "sha256").hexdigest()


def expected_sums(sums_path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in sums_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, name = line.split(None, 1)
        out[name.strip().lstrip("*")] = digest
    return out


def verify(path: Path, expected: str) -> None:
    actual = sha256_file(path)
    if actual != expected:
        raise ChecksumError(f"{path.name}: expected {expected}, got {actual}")


def download(url: str, dest: Path, timeout: float = DOWNLOAD_TIMEOUT) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r, dest.open("wb") as out:
            while chunk := r.read(1 << 20):
                out.write(chunk)
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        raise DownloadError(f"failed to download {url}: {e}") from e
    return dest


def fetch_dump(date: str, name: str, raw_dir: Path, sums_path: Path) -> Path:
    dest = raw_dir / date / name
    if not dest.exists():
        download(f"{BASE}/{date}/{name}", dest)
    verify(dest, expected_sums(sums_path)[name])
    return dest


POPULARITY_URL = "https://api.listenbrainz.org/1/popularity/artist"
# MAX_ITEMS_PER_GET in listenbrainz/webserver/views/api_tools.py.
POPULARITY_BATCH = 1000
# "ONE call per second" (listenbrainz.readthedocs.io/en/latest/users/api/,
# Rate limiting), whatever the X-RateLimit-* headers would still allow.
MIN_INTERVAL = 1.0
# A snapshot takes an hour: ListenBrainz answers 502 for a minute or more now
# and then (2026-10-02), and a give-up costs the whole hour. About 3 min of
# outage is ridden out, with waits doubling up to MAX_BACKOFF.
MAX_ATTEMPTS = 8
MAX_BACKOFF = 60.0


def _post(url: str, payload: dict[str, Any]) -> tuple[Any, Message]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"User-Agent": UA, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT) as r:
        return json.load(r), r.headers


def _reset_in(headers: Message) -> float:
    return float(headers.get("X-RateLimit-Reset-In") or MIN_INTERVAL)


def _backoff(attempt: int) -> float:
    return min(2.0**attempt, MAX_BACKOFF)


def _with_retries(call: Callable[[], tuple[Any, Message]]) -> tuple[Any, Message]:
    """One ListenBrainz request, through its outages: a 429 waits for the reset
    the service names, a 5xx or a cut connection waits longer each time, any
    other refusal is final."""
    attempt = 0
    while True:
        attempt += 1
        try:
            return call()
        except urllib.error.HTTPError as e:
            throttled = e.code == HTTPStatus.TOO_MANY_REQUESTS
            if not throttled and e.code < HTTPStatus.INTERNAL_SERVER_ERROR:
                raise DownloadError(f"ListenBrainz refused a request: {e}") from e
            if attempt == MAX_ATTEMPTS:
                raise DownloadError(f"ListenBrainz: {e}, {attempt} attempts") from e
            time.sleep(_reset_in(e.headers) if throttled else _backoff(attempt))
        # A connection cut mid-answer raises outside URLError (RemoteDisconnected,
        # ConnectionResetError, IncompleteRead): an outage all the same.
        except (
            urllib.error.URLError,
            TimeoutError,
            ConnectionError,
            http.client.HTTPException,
        ) as e:
            if attempt == MAX_ATTEMPTS:
                raise DownloadError(f"ListenBrainz: {e}, {attempt} attempts") from e
            time.sleep(_backoff(attempt))


def popularity_batch(mbids: list[str]) -> tuple[list[dict[str, Any]], float]:
    """Rows of one batch, and how long to wait before the next request.

    The response is an external payload: it must answer the batch asked, in
    order, or a count lands on the wrong artist without anything noticing."""
    rows, headers = _with_retries(lambda: _post(POPULARITY_URL, {"artist_mbids": mbids}))
    if (
        not isinstance(rows, list)
        or [r.get("artist_mbid") if isinstance(r, dict) else None for r in rows] != mbids
    ):
        raise DownloadError("ListenBrainz answered a batch other than the one asked")
    remaining = int(headers.get("X-RateLimit-Remaining") or 1)
    return rows, _reset_in(headers) if remaining == 0 else MIN_INTERVAL


SIMILAR_URL = "https://labs.api.listenbrainz.org/similar-artists/json"
# Of the algorithms the service lists, the one reading the longest history of
# listening sessions (7 500 days), so a 1970s band's neighbours are not only
# today's listening. Pinned: another algorithm is another snapshot.
SIMILAR_ALGORITHM = (
    "session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30"
)


def _get(url: str, params: dict[str, str]) -> tuple[Any, Message]:
    req = urllib.request.Request(
        f"{url}?{urllib.parse.urlencode(params)}", headers={"User-Agent": UA}
    )
    with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT) as r:
        return json.load(r), r.headers


def similar_artists(mbid: str) -> dict[str, Any]:
    """The neighbours ListenBrainz gives one artist, as one snapshot row. The
    service answers one artist per request (it takes no batch) and states no
    rate limit: the snapshot keeps to the API's one call per second.

    An external payload: no neighbour may name another artist than the one
    asked, or it lands on the wrong artist without anything noticing. A
    neighbour naming none is kept: the service leaves `reference_mbid` empty
    now and then (Pitty, among the neighbours of 00034ede…, 2026-10-04), and
    the request asked about one artist only."""
    rows, _ = _with_retries(
        lambda: _get(SIMILAR_URL, {"artist_mbids": mbid, "algorithm": SIMILAR_ALGORITHM})
    )
    if not isinstance(rows, list) or any(
        not isinstance(r, dict)
        or r.get("reference_mbid") not in (mbid, None)
        or not isinstance(r.get("artist_mbid"), str)
        or not isinstance(r.get("score"), int)
        for r in rows
    ):
        raise DownloadError(f"ListenBrainz answered another artist than {mbid}")
    return {
        "artist_mbid": mbid,
        "similar": [{"artist_mbid": r["artist_mbid"], "score": r["score"]} for r in rows],
    }


def _skip_written(partial: Path, batches: Iterator[list[str]]) -> tuple[int, Iterator[list[str]]]:
    """A run cut short resumes where it stopped. The batches whose answers the
    partial file holds whole, artist by artist and in order, are not asked
    again; the file is cut after the last of them. The snapshot directory
    carries its date, so only a run of the same day resumes."""
    kept_bytes, kept_rows = 0, 0
    pending: list[str] | None = None
    with partial.open("rb") as fh:
        lines = iter(fh)
        for batch in batches:
            size = 0
            for mbid in batch:
                line = next(lines, b"")
                try:
                    written = json.loads(line)["artist_mbid"]
                except (ValueError, KeyError, TypeError):
                    # Bytes left by a crash: cut there and ask again.
                    written = None
                if not line.endswith(b"\n") or written != mbid:
                    pending = batch
                    break
                size += len(line)
            if pending is not None:
                break
            kept_bytes += size
            kept_rows += len(batch)
    with partial.open("r+b") as fh:
        fh.truncate(kept_bytes)
    return kept_rows, itertools.chain([pending] if pending else [], batches)


def _resume(dest: Path, batches: Iterable[list[str]]) -> tuple[Path, int, Iterator[list[str]]]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_name(dest.name + ".partial")
    if partial.exists():
        n, rest = _skip_written(partial, iter(batches))
        return partial, n, rest
    return partial, 0, iter(batches)


def fetch_proximity(mbids: Iterable[str], dest: Path) -> int:
    """One line per artist asked, written as answered, aside then renamed like
    the popularity snapshot: about 31 hours for the 111 402 artists with 500
    listeners or more (2026-10-04), so a stopped run resumes where it was."""
    partial, n, rest = _resume(dest, ([m] for m in mbids))
    with partial.open("a", encoding="utf-8") as out:
        for (mbid,) in rest:
            started = time.monotonic()
            out.write(json.dumps(similar_artists(mbid)) + "\n")
            out.flush()
            n += 1
            time.sleep(max(0.0, MIN_INTERVAL - (time.monotonic() - started)))
    partial.replace(dest)
    return n


def fetch_popularity(batches: Iterable[list[str]], dest: Path) -> int:
    """Writes the answers as received, one row per line. Written aside and
    renamed at the end: an interrupted snapshot leaves no file that looks like
    a complete one, and the next run of the day resumes it."""
    partial, n, rest = _resume(dest, batches)
    wait = 0.0
    with partial.open("a", encoding="utf-8") as out:
        for batch in rest:
            time.sleep(wait)
            rows, wait = popularity_batch(batch)
            out.writelines(json.dumps(r) + "\n" for r in rows)
            n += len(rows)
    partial.replace(dest)
    return n
