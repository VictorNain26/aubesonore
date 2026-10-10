"""Downloads and verifies the MusicBrainz and Discogs archives, the ListenBrainz and Wikidata
snapshots."""

from __future__ import annotations

import contextlib
import hashlib
import http.client
import itertools
import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable, Iterator
from email.message import Message
from functools import partial
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
    """The file at `dest` once whole: a download cut short leaves only its
    `.partial`, which the next attempt starts over, never a truncated `dest`
    that the callers would take as already fetched."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_name(dest.name + ".partial")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r, partial.open("wb") as out:
            while chunk := r.read(1 << 20):
                out.write(chunk)
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        raise DownloadError(f"failed to download {url}: {e}") from e
    partial.replace(dest)
    return dest


def fetch_dump(date: str, name: str, raw_dir: Path, sums_path: Path) -> Path:
    dest = raw_dir / date / name
    if not dest.exists():
        download(f"{BASE}/{date}/{name}", dest)
    verify(dest, expected_sums(sums_path)[name])
    return dest


# data.discogs.com serves each monthly dump under data/<year>/ (read 2026-10-07;
# "made available under the CC0 No Rights Reserved license").
DISCOGS_URL = "https://data.discogs.com/?download=data%2F{year}%2F{name}"


def fetch_discogs(date: str, dest: Path, sums_path: Path) -> Path:
    if not dest.exists():
        download(DISCOGS_URL.format(year=date[:4], name=dest.name), dest)
    verify(dest, expected_sums(sums_path)[dest.name])
    return dest


# The statistics export sits in the full export's folder (read 2026-10-08), one
# tar.zst whose first member is the file wanted: users' top artists of all time.
LISTENING_URL = (
    "https://data.metabrainz.org/pub/musicbrainz/listenbrainz/fullexport/"
    "listenbrainz-dump-{ref}-full/listenbrainz-statistics-dump-{stamp}.tar.zst"
)
LISTENING_MEMBER = "listenbrainz-statistics-dump-{stamp}/lbdump/statistics/artists_all_time.jsonl"


def fetch_listening(ref: str, dest: Path, sums_path: Path) -> Path:
    """The 4 GB file wanted out of a 22 GB archive, without storing the archive:
    the download is streamed into `tar`, which stops after its first match
    (--occurrence=1), and the transfer stops with it. The archive's own digest
    covers bytes never fetched; the file's digest, pinned under reference/,
    is the check. `tar --zstd` needs zstd installed."""
    if not dest.exists():
        stamp = ref.split("-", 1)[1]
        dest.parent.mkdir(parents=True, exist_ok=True)
        partial = dest.with_name(dest.name + ".partial")
        req = urllib.request.Request(
            LISTENING_URL.format(ref=ref, stamp=stamp), headers={"User-Agent": UA}
        )
        member = LISTENING_MEMBER.format(stamp=stamp)
        with partial.open("wb") as out:
            tar = subprocess.Popen(
                ["tar", "--zstd", "-xO", "--occurrence=1", "-f", "-", member],
                stdin=subprocess.PIPE,
                stdout=out,
            )
            assert tar.stdin is not None  # stdin=PIPE
            try:
                with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT) as r:
                    while chunk := r.read(1 << 20):
                        tar.stdin.write(chunk)
            except BrokenPipeError:
                pass  # tar has its member and stopped reading: the transfer is done
            except (urllib.error.HTTPError, urllib.error.URLError) as e:
                tar.kill()
                raise DownloadError(f"failed to download the statistics export: {e}") from e
            finally:
                with contextlib.suppress(BrokenPipeError):
                    tar.stdin.close()
            if tar.wait() != 0:
                raise DownloadError(f"tar could not extract {member}")
        partial.replace(dest)
    verify(dest, expected_sums(sums_path)[dest.name])
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
    # ListenBrainz names the wait X-RateLimit-Reset-In; the Wikidata Query
    # Service answers its 429 with Retry-After (User Manual, "Query limits").
    return float(headers.get("X-RateLimit-Reset-In") or headers.get("Retry-After") or MIN_INTERVAL)


def _backoff(attempt: int) -> float:
    return min(2.0**attempt, MAX_BACKOFF)


def _with_retries(
    call: Callable[[], tuple[Any, Message]], service: str = "ListenBrainz"
) -> tuple[Any, Message]:
    """One request, through the service's outages: a 429 waits for the reset
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
                raise DownloadError(f"{service} refused a request: {e}") from e
            if attempt == MAX_ATTEMPTS:
                raise DownloadError(f"{service}: {e}, {attempt} attempts") from e
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
                raise DownloadError(f"{service}: {e}, {attempt} attempts") from e
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


def _get(url: str, params: dict[str, str]) -> tuple[Any, Message]:
    req = urllib.request.Request(
        f"{url}?{urllib.parse.urlencode(params)}", headers={"User-Agent": UA}
    )
    with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT) as r:
        return json.load(r), r.headers


def _skip_written(partial: Path, batches: Iterator[list[str]]) -> tuple[int, Iterator[list[str]]]:
    """A run cut short resumes where it stopped. The batches whose answers the
    partial file holds whole, artist by artist and in order, are not asked
    again; the file is cut after the last of them."""
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


RELEASE_GROUPS_URL = "https://musicbrainz.org/ws/2/release-group"
# A browse answers 100 release groups at most (musicbrainz.org/doc/MusicBrainz_API,
# "Browse"). "website-default" leaves out the release groups whose releases
# are all promotions, bootlegs or pseudo-releases, as the artist's page on
# musicbrainz.org does (same page, "release-group-status"). The service allows
# one request a second on average, and answers 503 above it
# (musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting): _with_retries waits.
BROWSE_LIMIT = 100


def _get_known(url: str, params: dict[str, str]) -> tuple[Any, Message]:
    """MusicBrainz answers 404 for an artist it no longer holds: an answer,
    not a refusal."""
    try:
        return _get(url, params)
    except urllib.error.HTTPError as e:
        if e.code == HTTPStatus.NOT_FOUND:
            return None, e.headers
        raise


def _credits(group: Any) -> set[str]:
    if not isinstance(group, dict) or not isinstance(group.get("id"), str):
        raise DownloadError("MusicBrainz answered a release group without an id")
    return {
        c["artist"]["id"]
        for c in group.get("artist-credit") or []
        if isinstance(c, dict) and isinstance(c.get("artist"), dict)
    }


def official_release_groups(mbid: str) -> dict[str, Any]:
    """The album and EP release groups MusicBrainz shows for one artist, as
    one snapshot row, every page asked at most once a second.

    An external payload: every release group must credit the artist asked.
    When none does, MusicBrainz answered for the artist this one was merged
    into since the dump, and when it no longer knows the artist it answers
    404: in both cases the row holds null, the artist left unsurveyed rather
    than given another's records. A mixed answer, or pages that do not add
    up to the count the service announces, is refused."""
    ids: list[str] = []
    count: int | None = None
    while count is None or len(ids) < count:
        started = time.monotonic()
        params = {
            "artist": mbid,
            "type": "album|ep",
            "release-group-status": "website-default",
            "inc": "artist-credits",
            "limit": str(BROWSE_LIMIT),
            "offset": str(len(ids)),
            "fmt": "json",
        }
        page, _ = _with_retries(partial(_get_known, RELEASE_GROUPS_URL, params), "MusicBrainz")
        time.sleep(max(0.0, MIN_INTERVAL - (time.monotonic() - started)))
        if page is None:
            return {"artist_mbid": mbid, "release_groups": None}
        groups = page.get("release-groups") if isinstance(page, dict) else None
        total = page.get("release-group-count") if isinstance(page, dict) else None
        if not isinstance(groups, list) or not isinstance(total, int):
            raise DownloadError(f"MusicBrainz answered an unexpected shape for {mbid}")
        if count is not None and total != count:
            raise DownloadError(f"MusicBrainz's count for {mbid} moved between pages")
        count = total
        credited = [mbid in _credits(g) for g in groups]
        if groups and not any(credited) and not ids:
            return {"artist_mbid": mbid, "release_groups": None}
        if not all(credited):
            raise DownloadError(f"MusicBrainz answered records of another artist than {mbid}")
        if not groups and len(ids) < count:
            raise DownloadError(f"MusicBrainz's pages for {mbid} stop short of its count")
        ids += [g["id"] for g in groups]
    if len(set(ids)) != len(ids) or len(ids) != count:
        raise DownloadError(f"MusicBrainz's pages for {mbid} do not add up to its count")
    return {"artist_mbid": mbid, "release_groups": sorted(ids)}


def fetch_official(mbids: Iterable[str], dest: Path) -> int:
    """One line per artist asked, written as answered, aside then renamed like
    the popularity snapshot: about 100 000 requests for the artists with 500
    listeners or more, more than a day, so a stopped run resumes where it
    was."""
    partial_file, n, rest = _resume(dest, ([m] for m in mbids))
    with partial_file.open("a", encoding="utf-8") as out:
        for (mbid,) in rest:
            out.write(json.dumps(official_release_groups(mbid)) + "\n")
            out.flush()
            n += 1
    partial_file.replace(dest)
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


# The service stops a query at 60 seconds and gives each client 60 seconds of
# processing a minute (mediawiki.org/wiki/Wikidata_Query_Service/User_Manual,
# "Query limits"). A query cut by the deadline comes back as an error or as a
# body that does not parse, never as a shorter result.
WDQS_URL = "https://query.wikidata.org/sparql"


# The release groups Wikidata files as a studio album, an EP or a soundtrack
# album (P31 "instance of" or P7937 "form of creative work"), by their
# MusicBrainz release group ID (P436): what its editors state a record is,
# which tells a posthumous record of new music from an archive
# (22_releases.sql).
# One query per form: the three in one VALUES clause took 26.6 s on
# 2026-10-05, near the service's 60-second cap (see WDQS_URL); apart they
# took 5.1, 0.9 and 0.7 s.
DISCOGRAPHY_FORMS = {"Q208569": "studio", "Q169930": "ep", "Q4176708": "soundtrack"}
DISCOGRAPHY_QUERY = "SELECT ?rg WHERE {{ ?album wdt:P436 ?rg ; wdt:P31|wdt:P7937 wd:{form} . }}"


def discography() -> list[dict[str, str]]:
    """One row per release group and form, sorted and de-duplicated. The IDs
    are written as Wikidata holds them, a malformed one included: telling a
    release group from a typo is a rule, and rules live in the SQL."""
    rows: set[tuple[str, str]] = set()
    for qid, form in DISCOGRAPHY_FORMS.items():
        params = {"query": DISCOGRAPHY_QUERY.format(form=qid), "format": "json"}
        answer, _ = _with_retries(partial(_get, WDQS_URL, params), "Wikidata")
        try:
            rows |= {(b["rg"]["value"], form) for b in answer["results"]["bindings"]}
        except (KeyError, TypeError) as e:
            raise DownloadError(f"Wikidata answered an unexpected shape: {e!r}") from e
    return [{"rg_mbid": rg, "form": form} for rg, form in sorted(rows)]


def fetch_discography(dest: Path) -> int:
    """Written aside and renamed, like the ListenBrainz snapshots: a run that
    fails leaves no file that looks like a complete one."""
    rows = discography()
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_name(dest.name + ".partial")
    partial.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    partial.replace(dest)
    return len(rows)
