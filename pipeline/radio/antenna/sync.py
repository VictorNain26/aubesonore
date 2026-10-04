"""Bibliothèque d'antenne (docs/vision.md §7) : ce que le pipeline publie dans `antenne/`, et le
cycle de vie de chaque titre (docs/recherches/2026-10-02-cycle-de-vie.md §4).

AzuraCast fait autorité : un titre de la base absent d'AzuraCast est oublié et compté ; un
fichier d'`antenne/` ou de `repos/` inconnu du pipeline est compté, jamais supprimé. Une
découverte n'est publiée qu'une fois : sortie de l'antenne, elle n'y revient pas. Un titre voté
« non » en sort.

Un titre sort par âge, jamais par score : le score choisit seulement qui est promu au fond. Le
titre en cours et la file de l'AutoDJ ne bougent jamais : ils attendent la passe suivante.
"""

import math
import sqlite3
import tempfile
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path, PurePosixPath
from typing import Protocol

import numpy as np

from radio.acquire.audio import (
    ToolError,
    cue_of,
    cue_points,
    isrc_of,
    prepare,
    probe,
    with_cue,
    with_isrc,
)
from radio.acquire.run import tags_for
from radio.core.config import AntenneConfig, GrilleConfig
from radio.library.weights import play_weight
from radio.sources.azuracast import AzuracastError, Media
from radio.sources.deezer import DeezerClient, DeezerError

FOLDER = "antenne"
REST = "repos"
CATEGORIE_OF_SOURCE = {
    "voisin": "decouvertes",
    "hypem": "nouveautes",
    "deezer_editorial": "nouveautes",
}


class Station(Protocol):
    def files(self) -> list[Media]: ...

    def upload(self, path: str, data: bytes) -> Media: ...

    def download(self, media_id: int) -> bytes: ...

    def delete(self, paths: list[str]) -> list[str]: ...

    def move(self, paths: list[str], directory: str) -> list[str]: ...

    def busy_song_ids(self) -> set[str]: ...


@dataclass
class AntenneReport:
    n_forgotten: int = 0
    n_unknown: int = 0
    n_voted_out: int = 0
    n_published: int = 0
    n_references: int = 0
    n_references_no_cover: int = 0
    n_promoted: int = 0
    n_ended: int = 0
    n_rested: int = 0
    n_returned: int = 0
    n_expired: int = 0
    n_references_out: int = 0
    n_references_artist_full: int = 0
    n_references_no_artist: int = 0
    n_total: int = 0
    skipped_references: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _insert(conn: sqlite3.Connection, tid: int, origin: str, m: Media, now: str) -> None:
    if origin == "repere":
        categorie = "reperes"
    else:
        source = conn.execute(
            "SELECT source FROM candidates WHERE deezer_track_id = ?", (tid,)
        ).fetchone()
        categorie = CATEGORIE_OF_SOURCE[str(source[0])] if source else "decouvertes"
    with conn:
        conn.execute(
            "INSERT INTO antenne VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (tid, origin, categorie, m.id, m.song_id, m.path, now, now),
        )
        if origin == "decouverte":
            conn.execute(
                "UPDATE acquisitions SET status = 'published', file = NULL "
                "WHERE deezer_track_id = ?",
                (tid,),
            )


def reconcile(conn: sqlite3.Connection, media: list[Media], rep: AntenneReport) -> None:
    ours = {m.path for m in media if m.path.startswith((f"{FOLDER}/", f"{REST}/"))}
    known = {str(r[0]) for r in conn.execute("SELECT path FROM antenne")}
    gone = known - ours
    with conn:
        conn.executemany("DELETE FROM antenne WHERE path = ?", [(p,) for p in gone])
    rep.n_forgotten = len(gone)
    rep.n_unknown = len(ours - known)


def _upload(
    conn: sqlite3.Connection,
    station: Station,
    tid: int,
    origin: str,
    file: Path,
    now: str,
    rep: AntenneReport,
) -> bool:
    try:
        m = station.upload(f"{FOLDER}/{tid}.mp3", file.read_bytes())
    except AzuracastError as e:
        rep.errors.append(f"dépôt {tid} : {e}")
        return False
    _insert(conn, tid, origin, m, now)
    return True


def _remove(
    conn: sqlite3.Connection, station: Station, paths: list[str], rep: AntenneReport
) -> int:
    """Supprime de l'antenne ; renvoie le nombre de retraits réussis."""
    if not paths:
        return 0
    errors = station.delete(paths)
    rep.errors += [f"retrait : {e}" for e in errors]
    done = [p for p in paths if not any(e.startswith(f"{p}:") for e in errors)]
    with conn:
        conn.executemany("DELETE FROM antenne WHERE path = ?", [(p,) for p in done])
    return len(done)


def withdraw_rejected(conn: sqlite3.Connection, station: Station, rep: AntenneReport) -> None:
    """Un titre voté « non » sort de l'antenne (repères compris), sauf s'il est en cours ou en
    file : il sortira à la passe suivante. Un fichier prêt voté « non » n'est jamais publié."""
    rows = conn.execute(
        """
        SELECT n.path, n.song_id FROM antenne n JOIN votes v USING (deezer_track_id)
        WHERE v.vote = 'non' ORDER BY n.deezer_track_id
        """
    ).fetchall()
    if rows:
        busy = station.busy_song_ids()
        rep.n_voted_out += _remove(conn, station, [str(p) for p, s in rows if s not in busy], rep)
    ready = conn.execute(
        """
        SELECT a.deezer_track_id, a.file FROM acquisitions a JOIN votes v USING (deezer_track_id)
        WHERE a.status = 'ready' AND v.vote = 'non'
        """
    ).fetchall()
    for tid, file in ready:
        with conn:
            conn.execute(
                "UPDATE acquisitions SET status = 'failed', reason = 'voté non', file = NULL "
                "WHERE deezer_track_id = ?",
                (tid,),
            )
        Path(file).unlink(missing_ok=True)
        rep.n_voted_out += 1


def publish_ready(conn: sqlite3.Connection, station: Station, now: str, rep: AntenneReport) -> None:
    rows = conn.execute(
        """
        SELECT a.deezer_track_id, a.file FROM acquisitions a
        LEFT JOIN antenne n USING (deezer_track_id)
        WHERE a.status = 'ready' AND n.deezer_track_id IS NULL ORDER BY a.deezer_track_id
        """
    ).fetchall()
    for tid, file in rows:
        path = Path(file)
        if not path.exists():
            rep.errors.append(f"fichier prêt introuvable : {tid}")
            continue
        if _upload(conn, station, int(tid), "decouverte", path, now, rep):
            path.unlink()
            rep.n_published += 1


def _under(root: PurePosixPath, file: str) -> bool:
    p = PurePosixPath(file)
    return p.is_absolute() and ".." not in p.parts and p.is_relative_to(root)


def _move(
    conn: sqlite3.Connection,
    station: Station,
    paths: list[str],
    directory: str,
    categorie: str,
    now: str,
    rep: AntenneReport,
) -> int:
    """Déplace dans `directory` et change de catégorie ; renvoie le nombre de déplacements
    réussis."""
    if not paths:
        return 0
    errors = station.move(paths, directory)
    rep.errors += [f"déplacement : {e}" for e in errors]
    done = [p for p in paths if not any(e.startswith(f"{p}:") for e in errors)]
    with conn:
        conn.executemany(
            "UPDATE antenne SET path = ?, categorie = ?, since = ? WHERE path = ?",
            [(f"{directory}/{PurePosixPath(p).name}", categorie, now, p) for p in done],
        )
    return len(done)


def _weeks_ago(now: datetime, weeks: int) -> str:
    return (now - timedelta(weeks=weeks)).isoformat()


def end_first_stay(
    conn: sqlite3.Connection,
    station: Station,
    cfg: AntenneConfig,
    busy: set[str],
    now: datetime,
    rep: AntenneReport,
) -> None:
    """Après `stay_weeks` semaines, la part `promotion_share` la meilleure d'une cohorte (un
    « oui » d'abord, puis la note du modèle) part au repos avant le fond ; le reste sort."""
    rows = [
        (str(r[0]), str(r[1]))
        for r in conn.execute(
            """
            SELECT n.path, n.song_id FROM antenne n
            LEFT JOIN scores s USING (deezer_track_id)
            LEFT JOIN votes v ON v.deezer_track_id = n.deezer_track_id AND v.vote = 'oui'
            WHERE n.categorie IN ('nouveautes', 'decouvertes') AND n.since <= ?
            ORDER BY v.deezer_track_id IS NULL, COALESCE(s.score, 0) DESC, n.deezer_track_id
            """,
            (_weeks_ago(now, cfg.stay_weeks),),
        )
    ]
    due = [p for p, song in rows if song not in busy]
    k = round(cfg.promotion_share * len(due))
    rep.n_promoted = _move(conn, station, due[:k], REST, "repos", now.isoformat(), rep)
    rep.n_ended = _remove(conn, station, due[k:], rep)


def expire(
    conn: sqlite3.Connection,
    station: Station,
    cfg: AntenneConfig,
    busy: set[str],
    now: datetime,
    rep: AntenneReport,
) -> None:
    """Un recurrent sort pour de bon `life_weeks` semaines après sa première diffusion."""
    rows = conn.execute(
        "SELECT path, song_id FROM antenne WHERE categorie IN ('fond', 'repos') "
        "AND published_at <= ? ORDER BY deezer_track_id",
        (_weeks_ago(now, cfg.life_weeks),),
    ).fetchall()
    rep.n_expired = _remove(conn, station, [str(p) for p, s in rows if s not in busy], rep)


def platoon(
    conn: sqlite3.Connection,
    station: Station,
    cfg: AntenneConfig,
    stock: int,
    busy: set[str],
    now: datetime,
    rep: AntenneReport,
) -> None:
    """Auto-platooning (MusicMaster) : un recurrent présent au fond depuis `stay_weeks` semaines
    part au repos ; les places libres reviennent à ceux qui se reposent depuis le plus
    longtemps, au moins `rest_weeks` semaines."""
    stamp = now.isoformat()
    tired = conn.execute(
        "SELECT path, song_id FROM antenne WHERE categorie = 'fond' AND since <= ? "
        "ORDER BY since, deezer_track_id",
        (_weeks_ago(now, cfg.stay_weeks),),
    ).fetchall()
    rep.n_rested = _move(
        conn, station, [str(p) for p, s in tired if s not in busy], REST, "repos", stamp, rep
    )
    on_air = conn.execute("SELECT COUNT(*) FROM antenne WHERE categorie = 'fond'").fetchone()[0]
    rested = conn.execute(
        "SELECT path FROM antenne WHERE categorie = 'repos' AND since <= ? "
        "ORDER BY since, deezer_track_id LIMIT ?",
        (_weeks_ago(now, cfg.rest_weeks), max(0, stock - on_air)),
    ).fetchall()
    rep.n_returned = _move(conn, station, [str(r[0]) for r in rested], FOLDER, "fond", stamp, rep)


def rotate_references(
    conn: sqlite3.Connection,
    station: Station,
    deezer: DeezerClient,
    cfg: AntenneConfig,
    stock: int,
    root: PurePosixPath,
    rsgain: Path,
    rng: np.random.Generator,
    busy: set[str],
    now: datetime,
    rep: AntenneReport,
) -> None:
    """Les repères tournent aussi : chacun reste `stay_weeks` semaines, puis cède sa place à un
    autre, tiré selon l'écoute parmi ceux qui ne sont pas passés depuis `rest_weeks` semaines.
    Au plus `stock / stay_weeks` entrées par passe : le stock se remplit au rythme où il se
    renouvelle. Un artiste a au plus deux titres à l'antenne, repos compris puisqu'un titre au
    repos revient au fond (docs/recherches/2026-10-02-programmation.md §1) : un tirage qui lui
    en donnerait un troisième, ou dont l'artiste est inconnu, est écarté et compté. Le fichier
    Plex n'est que lu ; la copie préparée est déposée puis effacée."""
    stamp = now.isoformat()
    tired = conn.execute(
        "SELECT deezer_track_id, path, song_id FROM antenne WHERE categorie = 'reperes' "
        "AND since <= ? ORDER BY deezer_track_id",
        (_weeks_ago(now, cfg.stay_weeks),),
    ).fetchall()
    out = [(int(t), str(p)) for t, p, s in tired if s not in busy]
    removed = _remove(conn, station, [p for _, p in out], rep)
    still = {int(r[0]) for r in conn.execute("SELECT deezer_track_id FROM antenne")}
    with conn:
        conn.executemany(
            "INSERT INTO repere_sorties VALUES (?, ?) "
            "ON CONFLICT (deezer_track_id) DO UPDATE SET left_at = excluded.left_at",
            [(t, stamp) for t, _ in out if t not in still],
        )
    rep.n_references_out = removed
    on_air = conn.execute("SELECT COUNT(*) FROM antenne WHERE categorie = 'reperes'").fetchone()[0]
    need = min(stock - on_air, math.ceil(stock / cfg.stay_weeks))
    if need <= 0:
        return
    pool = [
        r
        for r in conn.execute(
            """
            SELECT m.deezer_track_id, t.artist, t.title, t.file, SUM(t.plays),
                   tr.deezer_artist_id
            FROM deezer_matches m JOIN library_tracks t USING (plex_key)
            LEFT JOIN tracks tr ON tr.deezer_track_id = m.deezer_track_id
            LEFT JOIN antenne n ON n.deezer_track_id = m.deezer_track_id
            LEFT JOIN repere_sorties o ON o.deezer_track_id = m.deezer_track_id
            WHERE m.status = 'matched' AND t.file IS NOT NULL AND n.deezer_track_id IS NULL
              AND (o.left_at IS NULL OR o.left_at <= ?)
              AND m.deezer_track_id NOT IN (SELECT deezer_track_id FROM votes WHERE vote = 'non')
            GROUP BY m.deezer_track_id ORDER BY m.deezer_track_id
            """,
            (_weeks_ago(now, cfg.rest_weeks),),
        )
        if _under(root, str(r[3]))
    ]
    if not pool:
        return
    w = np.array([play_weight(int(r[4])) for r in pool])
    picked = rng.choice(len(pool), size=min(need, len(pool)), replace=False, p=w / w.sum())
    on_air = Counter(
        int(r[0])
        for r in conn.execute(
            "SELECT t.deezer_artist_id FROM antenne n JOIN tracks t USING (deezer_track_id)"
        )
    )
    with tempfile.TemporaryDirectory() as tmp:
        for i in picked:
            tid, artist, title, file = int(pool[i][0]), str(pool[i][1]), str(pool[i][2]), pool[i][3]
            artist_id = pool[i][5]
            if artist_id is None:
                # Sans artiste connu, le plafond ne se vérifie pas : écarté, compté.
                rep.n_references_no_artist += 1
                continue
            if on_air[int(artist_id)] >= 2:
                rep.n_references_artist_full += 1
                continue
            on_air[int(artist_id)] += 1
            dest = Path(tmp) / f"{tid}.mp3"
            try:
                page = deezer.track_page(tid)
                if page is None:
                    rep.skipped_references.append(f"repère {tid} : disparu de Deezer")
                    continue
                p = probe(Path(file))
                tags = tags_for(deezer, tid, artist, title, page)
                prepare(Path(file), dest, p.codec, tags, rsgain)
            except (ToolError, DeezerError) as e:
                rep.skipped_references.append(f"repère {tid} : {e}")
                continue
            if _upload(conn, station, tid, "repere", dest, stamp, rep):
                rep.n_references += 1
                if tags.cover is None:
                    rep.n_references_no_cover += 1


def antenne_pass(
    conn: sqlite3.Connection,
    station: Station,
    deezer: DeezerClient,
    cfg: AntenneConfig,
    grille: GrilleConfig,
    root: PurePosixPath,
    rsgain: Path,
    rng: np.random.Generator,
    now: datetime,
) -> AntenneReport:
    rep = AntenneReport()
    stamp = now.isoformat()
    reconcile(conn, station.files(), rep)
    withdraw_rejected(conn, station, rep)
    publish_ready(conn, station, stamp, rep)
    busy = station.busy_song_ids()
    end_first_stay(conn, station, cfg, busy, now, rep)
    expire(conn, station, cfg, busy, now, rep)
    platoon(conn, station, cfg, grille.stock("fond"), busy, now, rep)
    rotate_references(
        conn, station, deezer, cfg, grille.stock("reperes"), root, rsgain, rng, busy, now, rep
    )
    rep.n_total = conn.execute(
        "SELECT COUNT(*) FROM antenne WHERE categorie != 'repos'"
    ).fetchone()[0]
    return rep


@dataclass
class IsrcReport:
    n_tagged: int = 0
    n_already: int = 0
    n_no_isrc: int = 0
    n_gone: int = 0
    n_busy: int = 0
    errors: list[str] = field(default_factory=list)


def isrc_backfill(
    conn: sqlite3.Connection, station: Station, deezer: DeezerClient, rep: IsrcReport
) -> None:
    """Rattrapage des titres publiés avant l'ISRC : chaque fichier est relu dans AzuraCast,
    reçoit sa trame TSRC et est redéposé sur son chemin, ce qui remplace le média en place
    (§7.2). Le titre en cours et la file attendent un nouveau passage ; un titre déjà
    étiqueté n'est pas redéposé, la commande se relance sans effet."""
    busy = station.busy_song_ids()
    rows = conn.execute(
        "SELECT deezer_track_id, media_id, song_id, path FROM antenne ORDER BY deezer_track_id"
    ).fetchall()
    with tempfile.TemporaryDirectory() as tmp:
        src, dest = Path(tmp) / "src.mp3", Path(tmp) / "dest.mp3"
        for tid, media_id, song_id, path in rows:
            if song_id in busy:
                rep.n_busy += 1
                continue
            try:
                page = deezer.track_page(tid)
            except DeezerError as e:
                rep.errors.append(f"{tid} : Deezer {e}")
                continue
            if page is None:
                rep.n_gone += 1
                continue
            if page.isrc is None:
                rep.n_no_isrc += 1
                continue
            try:
                src.write_bytes(station.download(media_id))
                if isrc_of(src) == page.isrc:
                    rep.n_already += 1
                    continue
                with_isrc(src, dest, page.isrc)
                m = station.upload(path, dest.read_bytes())
            except (AzuracastError, ToolError) as e:
                rep.errors.append(f"{tid} : {e}")
                continue
            with conn:
                conn.execute(
                    "UPDATE antenne SET media_id = ?, song_id = ? WHERE deezer_track_id = ?",
                    (m.id, m.song_id, tid),
                )
            rep.n_tagged += 1


@dataclass
class CueReport:
    n_tagged: int = 0
    n_already: int = 0
    n_silent: int = 0
    n_busy: int = 0
    errors: list[str] = field(default_factory=list)


def cue_backfill(conn: sqlite3.Connection, station: Station, rep: CueReport) -> None:
    """Rattrapage des titres publiés avant les points de coupe : chaque fichier est relu dans
    AzuraCast, reçoit ses balises `cue_in` et `cue_out` et est redéposé sur son chemin, ce qui
    remplace le média en place, playlists comprises (`MediaProcessor::processAndUpload`, 0.23.8).
    Sa mesure est marquée à refaire : `radio mesures` la remplace par celle de la partie jouée, et
    la grille garde l'ancienne d'ici là. Le fichier est réécrit sur place : le titre en cours et
    la file, relus juste avant chaque envoi, attendent un nouveau passage. Un titre déjà coupé
    n'est pas redéposé, la commande se relance sans effet."""
    rows = conn.execute(
        "SELECT deezer_track_id, media_id, song_id, path FROM antenne ORDER BY deezer_track_id"
    ).fetchall()
    with tempfile.TemporaryDirectory() as tmp:
        src, dest = Path(tmp) / "src.mp3", Path(tmp) / "dest.mp3"
        for tid, media_id, song_id, path in rows:
            try:
                src.write_bytes(station.download(media_id))
                if cue_of(src) is not None:
                    rep.n_already += 1
                    continue
                cue = cue_points(src)
                if cue is None:
                    rep.n_silent += 1
                    rep.errors.append(f"{tid} : aucun son au-dessus des seuils")
                    continue
                with_cue(src, dest, cue)
                if song_id in station.busy_song_ids():
                    rep.n_busy += 1
                    continue
                m = station.upload(path, dest.read_bytes())
            except (AzuracastError, ToolError) as e:
                rep.errors.append(f"{tid} : {e}")
                continue
            with conn:
                conn.execute(
                    "UPDATE antenne SET media_id = ?, song_id = ? WHERE deezer_track_id = ?",
                    (m.id, m.song_id, tid),
                )
                conn.execute(
                    "UPDATE track_features SET model = '' WHERE deezer_track_id = ?", (tid,)
                )
            rep.n_tagged += 1
