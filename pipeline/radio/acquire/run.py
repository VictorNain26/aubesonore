"""Passe d'acquisition (docs/vision.md §5, §6) : retenus → Sockseek → contrôle → fichier prêt.

Chaque issue est écrite dès qu'elle est connue : une panne de Deezer arrête la passe sans perdre
le travail fait. Un titre en échec est retenté aux passes suivantes, jusqu'à `max_attempts`. Un
titre voté « non » n'est jamais acquis.

Un artiste n'a qu'un titre à la fois en rotation, et au plus deux à l'antenne
(docs/recherches/2026-10-02-programmation.md §1) : le titre suivant d'un artiste attend que le
précédent ait fini son premier séjour. Faute d'artistes libres, il entre moins de titres.
"""

import logging
import shutil
import sqlite3
import tempfile
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import NamedTuple

from radio.acquire.audio import Tags, ToolError, check, fingerprint, prepare, probe, similarity
from radio.acquire.sockseek import Runner, Wanted, download, run_command
from radio.core.config import AcquisitionConfig
from radio.sources.deezer import DeezerClient, DeezerError, TrackPage

logger = logging.getLogger(__name__)


@dataclass
class AcquireReport:
    n_wanted: int = 0
    n_ready: int = 0
    n_no_cover: int = 0
    n_unindexed: int = 0
    n_artist_waiting: int = 0
    failures: Counter[str] = field(default_factory=Counter)

    @property
    def n_attempted(self) -> int:
        return self.n_ready + sum(self.failures.values())


class Pending(NamedTuple):
    tids: list[int]
    # Retenus mis en attente : leur artiste a déjà son titre en rotation, ou deux à l'antenne.
    waiting: int


def pending(conn: sqlite3.Connection, cfg: AcquisitionConfig) -> Pending:
    """Retenus pas encore prêts ni abandonnés ni votés « non » : la dernière fournée d'abord, car
    une nouveauté vieillit, puis les mieux notés ; un seul par artiste libre."""
    rows = conn.execute(
        """
        SELECT s.deezer_track_id, t.deezer_artist_id FROM scores s
        JOIN candidates c USING (deezer_track_id)
        JOIN tracks t USING (deezer_track_id)
        LEFT JOIN acquisitions a USING (deezer_track_id)
        WHERE s.accepted = 1
          AND (a.deezer_track_id IS NULL OR (a.status = 'failed' AND a.attempts < ?))
          AND s.deezer_track_id NOT IN (SELECT deezer_track_id FROM votes WHERE vote = 'non')
        ORDER BY c.run_id DESC, s.score DESC, s.deezer_track_id
        """,
        (cfg.max_attempts,),
    ).fetchall()
    on_air: Counter[int] = Counter()
    rotating: set[int] = set()
    # Un titre au repos revient au fond : il compte dans les deux titres de son artiste.
    for artist, categorie in conn.execute(
        "SELECT t.deezer_artist_id, n.categorie FROM antenne n JOIN tracks t USING "
        "(deezer_track_id)"
    ):
        on_air[int(artist)] += 1
        if categorie in ("nouveautes", "decouvertes"):
            rotating.add(int(artist))
    rotating |= {
        int(r[0])
        for r in conn.execute(
            "SELECT t.deezer_artist_id FROM acquisitions a JOIN tracks t USING (deezer_track_id) "
            "WHERE a.status = 'ready'"
        )
    }
    tids: list[int] = []
    waiting = 0
    for tid, artist in rows:
        if artist in rotating or on_air[artist] >= 2:
            waiting += 1
        elif len(tids) < cfg.max_per_pass:
            rotating.add(int(artist))
            tids.append(int(tid))
    return Pending(tids, waiting)


def _save(
    conn: sqlite3.Connection, tid: int, file: Path | None, reason: str | None, now: str
) -> None:
    with conn:
        conn.execute(
            """
            INSERT INTO acquisitions VALUES (?, ?, ?, 1, ?, ?)
            ON CONFLICT (deezer_track_id) DO UPDATE SET status = excluded.status,
                reason = excluded.reason, attempts = attempts + 1, file = excluded.file,
                attempted_at = excluded.attempted_at
            """,
            (tid, "ready" if file else "failed", reason, str(file) if file else None, now),
        )


def tags_for(deezer: DeezerClient, tid: int, artist: str, title: str, page: TrackPage) -> Tags:
    """Balises d'antenne : l'album, sa pochette et l'ISRC viennent de `GET /track` par l'id exact
    du titre. Une pochette refusée par Deezer laisse le fichier sans pochette."""
    album = page.album
    cover = None
    if album is not None and album.cover_url:
        try:
            cover = deezer.download(album.cover_url)
        except DeezerError as e:
            logger.warning("pochette de %d refusée par Deezer : %s", tid, e)
    return Tags(artist, title, tid, album.title if album else "", cover, page.isrc)


def _verify_and_prepare(
    file: Path,
    want: Wanted,
    deezer: DeezerClient,
    ready_dir: Path,
    rsgain: Path,
    cfg: AcquisitionConfig,
) -> tuple[Path | None, str | None, Tags | None]:
    p = probe(file)
    refusal = check(p, want.duration_s, cfg)
    if refusal is not None:
        return None, refusal, None
    # L'URL d'extrait est signée et expire : relue juste avant usage, avec l'album.
    page = deezer.track_page(want.deezer_track_id)
    if page is None or page.preview_url is None:
        return None, "extrait Deezer indisponible", None
    with tempfile.NamedTemporaryFile(suffix=".mp3") as preview:
        preview.write(deezer.download(page.preview_url))
        preview.flush()
        score = similarity(fingerprint(file), fingerprint(Path(preview.name)))
    if score < cfg.identity_threshold:
        return None, "identité", None
    dest = ready_dir / f"{want.deezer_track_id}.mp3"
    tags = tags_for(deezer, want.deezer_track_id, want.artist, want.title, page)
    prepare(file, dest, p.codec, tags, rsgain)
    return dest, None, tags


def acquire_pass(
    conn: sqlite3.Connection,
    deezer: DeezerClient,
    dirs: tuple[Path, Path, Path],
    binaries: tuple[Path, Path],
    credentials: tuple[str, str],
    cfg: AcquisitionConfig,
    now: str,
    run: Runner = run_command,
) -> AcquireReport:
    """`dirs` : dossier de travail de la passe (supprimé à la fin, quoi qu'il arrive), dossier
    des fichiers prêts, dossier de la config Sockseek (tmpfs, effacé par systemd)."""
    workdir, ready_dir, conf_dir = dirs
    sockseek, rsgain = binaries
    rep = AcquireReport()
    wanted: list[Wanted] = []
    keys: set[tuple[str, str, int]] = set()
    todo = pending(conn, cfg)
    rep.n_artist_waiting = todo.waiting
    for tid in todo.tids:
        got = deezer.track(tid)
        if got is None:
            rep.failures["disparu de Deezer"] += 1
            _save(conn, tid, None, "disparu de Deezer", now)
            continue
        t = got[0]
        key = (t.artist_name, t.title_short, t.duration_s)
        if key in keys:
            # L'index de Sockseek se lit par (artiste, titre, durée) : un second titre de même clé
            # n'aurait jamais d'issue.
            rep.failures["doublon d'artiste, titre et durée"] += 1
            _save(conn, tid, None, "doublon d'artiste, titre et durée", now)
            continue
        keys.add(key)
        wanted.append(Wanted(tid, t.artist_name, t.title_short, t.duration_s))
    rep.n_wanted = len(wanted)
    if not wanted:
        return rep
    ready_dir.mkdir(parents=True, exist_ok=True)
    workdir.mkdir(parents=True)
    by_id = {w.deezer_track_id: w for w in wanted}
    try:
        outcomes = download(wanted, workdir, conf_dir, sockseek, *credentials, cfg, run)
        rep.n_unindexed = len(wanted) - len(outcomes)
        for out in outcomes:
            file, reason = None, out.reason
            if out.file is not None:
                try:
                    file, reason, tags = _verify_and_prepare(
                        out.file, by_id[out.deezer_track_id], deezer, ready_dir, rsgain, cfg
                    )
                    if tags is not None and tags.cover is None:
                        rep.n_no_cover += 1
                except (ToolError, DeezerError) as e:
                    reason = f"{type(e).__name__} : {e}"
                finally:
                    out.file.unlink(missing_ok=True)
            _save(conn, out.deezer_track_id, file, reason, now)
            if file is not None:
                rep.n_ready += 1
            else:
                rep.failures[str(reason)] += 1
    finally:
        shutil.rmtree(workdir)
    return rep
