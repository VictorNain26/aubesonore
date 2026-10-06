"""Streaming projection of the MusicBrainz JSON dumps. No business rule here."""

from __future__ import annotations

import json
import logging
import lzma
import tarfile
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# The special purpose artists MusicBrainz keeps for credits that name no artist
# ([unknown], Various Artists…) and the subsets of [unknown] and [no artist]
# it lists (musicbrainz.org/doc/Style/Unknown_and_untitled/Special_purpose_artist,
# read 2026-10-06): never a page, never a neighbour. Every other artist is kept,
# whatever its type, none included.
SPECIAL_PURPOSE = frozenset(
    {
        "f731ccc4-e22a-43af-a747-64213329e088",  # [anonymous]
        "33cf029c-63b0-41a0-9855-be2a3665fb3b",  # [data]
        "314e1c25-dde7-4e4d-b2f4-0a7b9f7c56dc",  # [dialogue]
        "eec63d3c-3b81-4ad4-b1e4-7c147d4d2b61",  # [no artist]
        "9be7f096-97ec-4615-8957-8d40b5dcbc41",  # [traditional]
        "125ec42a-7229-4250-afc5-e057484327fe",  # [unknown]
        "89ad4ac3-39f7-470e-963a-56509c546377",  # Various Artists
        "7e84f845-ac16-41fe-9ff8-df12eb32af55",  # MusicBrainz Test Artist
        "66ea0139-149f-4a0c-8fbf-5ea9ec4a6e49",  # [Disney]
        "a0ef7e1d-44ff-4039-9435-7d5fefdeecc9",  # [theatre]
        "90068d37-bae7-4292-be4a-704c145bd616",  # [church chimes]
        "80a8851f-444c-4539-892b-ad2a49292aa9",  # [language instruction]
    }
)
KEPT_RELEASE_TYPES = {"Album", "EP"}


def reduce_artist(rec: dict[str, Any]) -> dict[str, Any] | None:
    if rec.get("id") in SPECIAL_PURPOSE:
        return None
    span = rec.get("life-span") or {}
    return {
        "mbid": rec.get("id"),
        "name": rec.get("name"),
        "disambiguation": rec.get("disambiguation"),
        "type": rec.get("type"),
        "begin": span.get("begin"),
        "end": span.get("end"),
        "ended": span.get("ended"),
        "country": rec.get("country"),
        "begin_area": (rec.get("begin-area") or {}).get("name"),
        "begin_area_mbid": (rec.get("begin-area") or {}).get("id"),
        "genres": [
            {"mbid": g.get("id"), "name": g.get("name"), "votes": g["count"]}
            for g in (rec.get("genres") or [])
        ],
        "relations": [
            {
                "type": r.get("type"),
                "direction": r.get("direction"),
                "mbid": (r.get("artist") or {}).get("id"),
                "begin": r.get("begin"),
                "end": r.get("end"),
            }
            for r in (rec.get("relations") or [])
            if r.get("target-type") == "artist"
        ],
        "urls": [
            {
                "type": r.get("type"),
                "url": (r.get("url") or {}).get("resource"),
                "ended": r.get("ended"),
            }
            for r in (rec.get("relations") or [])
            if r.get("target-type") == "url"
        ],
    }


def reduce_release_group(rec: dict[str, Any]) -> dict[str, Any] | None:
    if rec.get("primary-type") not in KEPT_RELEASE_TYPES:
        return None
    return {
        "mbid": rec.get("id"),
        "title": rec.get("title"),
        "primary_type": rec.get("primary-type"),
        "date": rec.get("first-release-date"),
        "secondary": rec.get("secondary-types") or [],
        "artists": [(c.get("artist") or {}).get("id") for c in (rec.get("artist-credit") or [])],
        "genres": [
            {"mbid": g.get("id"), "name": g.get("name"), "votes": g["count"]}
            for g in (rec.get("genres") or [])
        ],
    }


def iter_records(archive: Path) -> Iterator[dict[str, Any]]:
    """Walks the JSON lines of mbdump/* without ever writing the decompressed tar."""
    skipped = 0
    with lzma.open(archive) as xz, tarfile.open(fileobj=xz, mode="r|") as tar:
        for member in tar:
            if not member.isfile() or not member.name.startswith("mbdump/"):
                continue
            stream = tar.extractfile(member)
            if stream is None:
                continue
            for raw in stream:
                line = raw.strip()
                if not line.startswith(b"{"):
                    continue
                try:
                    yield json.loads(line, strict=False)
                except json.JSONDecodeError:
                    skipped += 1
                    continue
    if skipped:
        logger.warning("%s: %d malformed JSON line(s) ignored", archive, skipped)


def extract(
    archive: Path, reducer: Callable[[dict[str, Any]], dict[str, Any] | None], out: Path
) -> tuple[int, int]:
    """Returns (kept, dropped). The second counts what the projection filter
    removes: it is the only trace the manifest keeps of it, a dropped record
    existing nowhere downstream."""
    out.parent.mkdir(parents=True, exist_ok=True)
    kept = 0
    dropped = 0
    with out.open("w", encoding="utf-8") as fh:
        for rec in iter_records(archive):
            reduced = reducer(rec)
            if reduced is None:
                dropped += 1
                continue
            fh.write(json.dumps(reduced, ensure_ascii=False) + "\n")
            kept += 1
    return kept, dropped
