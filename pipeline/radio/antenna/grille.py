"""Grille d'antenne et enchaînement (docs/recherches/2026-10-02-cycle-de-vie.md §6,
docs/recherches/2026-10-02-programmation.md §3).

La grille se remplit créneau par créneau, avec la mécanique des logiciels de programmation radio
(pile de MusicMaster, règles et objectifs de GSelector) :

1. Chaque heure reçoit des titres jusqu'à couvrir sa durée, les catégories se suivant selon
   leurs parts ; une catégorie sans titre permis cède son créneau.
2. Pour un créneau, on parcourt la catégorie dans l'ordre de rotation (joué il y a le plus
   longtemps d'abord, d'après l'historique d'AzuraCast), sur une fenêtre de recherche. Deux
   règles incassables : un titre se repose au moins `repos` tour de sa catégorie, un artiste ne
   repasse pas avant `separation_h` heures. Parmi les titres permis, la ressemblance à la cible de
   l'heure est un objectif, jamais une condition : un titre en retard de `avantage` tours y gagne,
   et à `force` tours il passe d'office (règle anti-famine de GSelector). La ressemblance de style
   au titre placé juste avant (empreinte Discogs-EffNet) s'y ajoute, pesée par `style` : sans
   elle, les titres d'une heure étaient aussi disparates qu'au hasard. Un titre placé repart en
   fin de rotation.
3. Chaque heure est ensuite ordonnée en fil qui dérive : elle part du dernier titre de la
   précédente et va chaque fois au plus proche, de la fin d'un titre au début du suivant, en
   mesures et en style. Les titres qui partent à coup sûr avant la fin de l'heure, les plus en
   retard, viennent d'abord ; les moins pressés finissent l'heure, que la suivante peut couper.
"""

import math
import sqlite3
import statistics
from collections import Counter
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta, tzinfo
from typing import Protocol
from zoneinfo import ZoneInfo

import numpy as np
import numpy.typing as npt

from radio.core.config import Bloc, Categorie, GrilleConfig
from radio.signals.audio import MODEL_TAG, from_blob

Vector = npt.NDArray[np.float64]

CATEGORIES: tuple[Categorie, ...] = ("nouveautes", "decouvertes", "fond", "reperes")
JOURS = ("lun", "mar", "mer", "jeu", "ven", "sam", "dim")
NEUTRE = np.full(3, 0.5)
# Distance de style de deux titres pris au hasard à l'antenne (1 - cosinus médian, mesuré le
# 2026-10-11) : celle d'un titre sans empreinte, ni favorisé ni écarté.
STYLE_NEUTRE = 0.6


def bloc(day: int, hour: int) -> Bloc:
    """Bloc de la journée ; `day` en ISO (1 lundi, 7 dimanche). La nuit du vendredi et celle du
    samedi sont en fête jusqu'à 3 h ; le week-end, la fin de nuit commence à 5 h (Heggli 2021)."""
    if (day in (5, 6) and hour >= 20) or (day in (6, 7) and hour < 3):
        return "fete"
    if hour >= 23 or hour < (5 if day in (6, 7) else 4):
        return "nuit"
    if hour < 6:
        return "fin_de_nuit"
    if hour < 12:
        return "matin"
    return "apres_midi" if hour < 20 else "soir"


def playlist_name(day: int, hour: int) -> str:
    return f"Grille {JOURS[day - 1]} {hour:02d}h"


@dataclass(frozen=True)
class Titre:
    tid: int
    artist: int
    categorie: Categorie
    path: str
    song_id: str
    q: Vector
    q_start: Vector
    q_end: Vector
    measured: bool
    # Entrée dans sa catégorie (horodatage UNIX) : le retard d'un titre jamais joué en part.
    since: float
    # Durée du fichier (`radio mesures`) ; None tant qu'il n'est pas mesuré.
    duration_s: float | None
    # Empreinte Discogs-EffNet de l'extrait Deezer, normée ; None sans empreinte.
    style: Vector | None = None


Span = tuple[float, float]


@dataclass
class Plan:
    day: date
    hours: dict[int, list[Titre]]
    spans: dict[int, Span] = field(default_factory=dict)
    slots: dict[str, int] = field(default_factory=dict)
    empty_slots: int = 0
    short_hours: int = 0
    unmeasured: int = 0
    late: int = 0
    turnover_days: dict[str, float] = field(default_factory=dict)
    max_per_artist: int = 0


def load_titres(conn: sqlite3.Connection) -> list[Titre]:
    """Titres à l'antenne, chaque mesure (énergie = arousal, dansabilité, tempo) ramenée à son
    quantile parmi les titres mesurés : les cibles suivent la couleur de l'antenne. Un titre pas
    encore mesuré est neutre (0,5). L'empreinte de style est celle de `signals`."""
    rows = conn.execute(
        """
        SELECT n.deezer_track_id, COALESCE(t.deezer_artist_id, -n.deezer_track_id), n.categorie,
               n.path, n.song_id, f.status = 'ok',
               f.arousal, f.danceability, f.bpm,
               f.arousal_start, f.danceability_start, f.bpm_start,
               f.arousal_end, f.danceability_end, f.bpm_end, n.since, f.duration_s, m.embedding
        FROM antenne n
        LEFT JOIN tracks t USING (deezer_track_id)
        LEFT JOIN track_features f USING (deezer_track_id)
        LEFT JOIN track_measures m
               ON m.deezer_track_id = n.deezer_track_id AND m.status = 'ok' AND m.model = ?
        WHERE n.categorie != 'repos'
        ORDER BY n.deezer_track_id
        """,
        (MODEL_TAG,),
    ).fetchall()
    ok = [r for r in rows if r[5]]
    ref = [np.sort(np.array([float(r[6 + k]) for r in ok])) for k in range(3)]

    def quantiles(values: Iterable[float]) -> Vector:
        return np.array(
            [np.searchsorted(ref[k], v, side="right") / len(ref[k]) for k, v in enumerate(values)]
        )

    out = []
    for r in rows:
        measured = bool(r[5])
        out.append(
            Titre(
                int(r[0]),
                int(r[1]),
                r[2],
                str(r[3]),
                str(r[4]),
                quantiles(map(float, r[6:9])) if measured else NEUTRE,
                quantiles(map(float, r[9:12])) if measured else NEUTRE,
                quantiles(map(float, r[12:15])) if measured else NEUTRE,
                measured,
                datetime.fromisoformat(str(r[15])).timestamp(),
                float(r[16]) if measured else None,
                None if r[17] is None else _unit(from_blob(r[17])),
            )
        )
    return out


def shares(titres: list[Titre], grille: GrilleConfig) -> dict[Categorie, float]:
    """Parts d'antenne effectives : tant qu'une catégorie n'a pas son stock, sa part est réduite
    en proportion et rendue aux autres (montée en charge)."""
    n = {c: sum(t.categorie == c for t in titres) for c in CATEGORIES}
    w = {c: grille.categories[c].part * min(1.0, n[c] / grille.stock(c)) for c in CATEGORIES}
    total = sum(w.values())
    return {c: (w[c] / total if total else 0.0) for c in CATEGORIES}


def round_robin(weights: dict[Categorie, float]) -> Iterator[Categorie]:
    """Créneaux répartis au prorata des poids, régulièrement (smooth weighted round-robin,
    l'algorithme de répartition de nginx)."""
    current = dict.fromkeys(weights, 0.0)
    total = sum(weights.values())
    while True:
        for c, w in weights.items():
            current[c] += w
        best = max(current, key=lambda c: current[c])
        current[best] -= total
        yield best


def hour_spans(day: date, hours: Iterable[int], tz: tzinfo) -> dict[int, Span]:
    """Début et fin (horodatages UNIX) de chaque heure murale du jour, dans le fuseau de la
    station. `minuit + h * 3600` se décale d'une heure les jours de changement d'heure, deux
    dimanches, jour de la passe. AzuraCast programme une playlist horaire sur l'heure murale
    (`Scheduler::shouldPlayInSchedulePeriod`, 0.23.8) : celle qui se répète (2 h, au passage à
    l'heure d'hiver) dure deux heures ; une heure qui n'existe pas (2 h, au passage à l'heure
    d'été) est omise, et `publish` vide sa playlist."""

    def start(d: date, h: int) -> datetime | None:
        t = datetime.combine(d, time(h), tzinfo=tz)
        return t if t.astimezone(UTC).astimezone(tz).hour == h else None

    out: dict[int, Span] = {}
    for h in hours:
        begin = start(day, h)
        if begin is None:
            continue
        later = (t for t in (start(day, k) for k in range(h + 1, 24)) if t is not None)
        end = next(later, datetime.combine(day + timedelta(days=1), time(0), tzinfo=tz))
        out[h] = (begin.timestamp(), end.timestamp())
    return out


def plan_day(
    titres: list[Titre],
    last_played: dict[str, float],
    grille: GrilleConfig,
    day: date,
    spans: dict[int, Span],
    midnight: float,
    start_next_s: float,
    previous: Titre | None = None,
) -> Plan:
    """`spans` : début et fin de chaque heure à planifier (`hour_spans`) ; `midnight` : minuit du
    jour ; `last_played` : dernier passage de chaque titre (song_id). Tous en horodatages UNIX.
    `start_next_s` : avance du titre suivant sur la fin du précédent (`start_next_s` d'AzuraCast).

    Chaque heure se remplit au temps, pas au nombre : AzuraCast prend chaque titre dans la
    playlist programmée à l'heure prévue de son passage, la fin du précédent moins
    `start_next_s` (`Queue::addDurationToTime`, 0.23.8). L'heure reçoit des titres jusqu'à couvrir
    toute sa durée : sans cela, une heure de titres courts s'épuise et le secours joue. Elle
    démarre après la fin du dernier titre de la précédente, d'au plus sa durée : les titres qui
    partent à coup sûr avant la fin de l'heure sont les plus en retard ; les autres, les moins
    pressés, viennent en fin d'heure, où l'heure suivante peut les couper."""
    plan = Plan(
        day, {h: [] for h in spans}, spans=spans, unmeasured=sum(not t.measured for t in titres)
    )
    weights = {c: w for c, w in shares(titres, grille).items() if w > 0}
    if not weights or not spans:
        return plan
    known = [t.duration_s for t in titres if t.duration_s is not None]
    typical = statistics.median(known) if known else 3600 / grille.titres_par_heure

    def on_air(t: Titre) -> float:
        return max(1.0, (typical if t.duration_s is None else t.duration_s) - start_next_s)

    iso = day.isoweekday()
    # Rotation : dernier passage connu, puis chaque titre placé prend l'heure de son passage.
    clock: dict[int, float | None] = {t.tid: last_played.get(t.song_id) for t in titres}
    by_cat = {c: [t for t in titres if t.categorie == c] for c in weights}
    per_hour = 3600 / statistics.fmean(on_air(t) for t in titres)
    per_day = {c: weights[c] * per_hour * 24 for c in weights}
    window = {c: max(1, math.ceil(per_day[c] * (grille.marge - 1))) for c in weights}
    # Tour d'une catégorie : le temps qu'il faut pour la jouer en entier. Le retard d'un titre se
    # compte en tours depuis son dernier passage, ou depuis son entrée s'il n'a jamais joué.
    turn = {c: len(by_cat[c]) / per_day[c] * 86400 for c in weights}
    plan.turnover_days = {c: turn[c] / 86400 for c in weights}
    artists = Counter(t.artist for t in titres)
    plan.max_per_artist = max(artists.values(), default=0)
    artist_clock: dict[int, float] = {}
    for t in titres:
        played = clock[t.tid]
        if played is not None:
            artist_clock[t.artist] = max(artist_clock.get(t.artist, played), played)
    separation = grille.separation_h * 3600

    def overdue(t: Titre, now: float) -> float:
        last = clock[t.tid]
        return (now - (t.since if last is None else last)) / turn[t.categorie]

    def allowed(t: Titre, now: float, hour_start: float) -> bool:
        last = clock[t.tid]
        rested = last is None or now - last >= grille.repos * turn[t.categorie]
        return rested and hour_start - artist_clock.get(t.artist, -math.inf) >= separation

    def score(t: Titre, now: float, target: Vector) -> float:
        lead = (overdue(t, now) - grille.avantage) / (grille.force - grille.avantage)
        return float(np.linalg.norm(t.q - target)) - grille.retard * min(1.0, max(0.0, lead))

    # Un titre pas joué depuis plus de `force` tours : la rotation ne tient pas, à surveiller.
    plan.late = sum(overdue(t, midnight) > grille.force for c in weights for t in by_cat[c])

    urgency: dict[int, float] = {}
    # Retard d'une heure sur son début : au plus le plus long titre de l'heure précédente, ou de
    # toute l'antenne quand on ne la connaît pas.
    carry = on_air(previous) if previous is not None else max(on_air(t) for t in titres)
    last = previous
    for h, (hour_start, hour_end) in spans.items():
        target = _target(grille, iso, h)
        length = hour_end - hour_start
        filled = 0.0
        stuck: set[Categorie] = set()
        slots = round_robin(weights)
        while filled < length and stuck != set(weights):
            c = next(slots)
            now = hour_start + filled
            rotation = sorted(by_cat[c], key=lambda t: (clock[t.tid] or -math.inf, t.tid))
            eligible = [t for t in rotation if allowed(t, now, hour_start)][: window[c]]
            if not eligible:
                # Le créneau, cédé, revient à la catégorie suivante : compté une fois.
                if not stuck:
                    plan.empty_slots += 1
                stuck.add(c)
                continue
            stuck.clear()
            starved = [t for t in eligible if overdue(t, now) >= grille.force]
            before = plan.hours[h][-1] if plan.hours[h] else last
            t = (
                max(starved, key=lambda t: overdue(t, now))
                if starved
                else min(
                    eligible,
                    key=lambda t: score(t, now, target) + grille.style * _style(before, t),
                )
            )
            urgency[t.tid] = overdue(t, now)
            clock[t.tid] = now
            # Le fil qui dérive réordonne l'heure : l'artiste peut y passer jusqu'à sa fin, et la
            # séparation se compte de là jusqu'au début de l'heure suivante qui le reprend.
            artist_clock[t.artist] = hour_end
            plan.hours[h].append(t)
            plan.slots[c] = plan.slots.get(c, 0) + 1
            filled += on_air(t)
        if filled < length:
            plan.short_hours += 1
        sure = _sure(plan.hours[h], length - carry, urgency, on_air)
        spare = [t for t in plan.hours[h] if t not in sure]
        ordered = _drift(sure, last, target, grille.style)
        ordered += _drift(spare, ordered[-1] if ordered else last, target, grille.style)
        plan.hours[h] = ordered
        if ordered:
            last = ordered[-1]
            carry = max(on_air(t) for t in ordered)
        else:
            carry = max(on_air(t) for t in titres)
    return plan


def _sure(
    titres: list[Titre],
    capacity: float,
    urgency: dict[int, float],
    on_air: Callable[[Titre], float],
) -> list[Titre]:
    """Les titres qui partent avant la fin de l'heure dans n'importe quel ordre, les plus en
    retard d'abord : le dernier part après tous les autres, au pire après les plus longs."""
    out: list[Titre] = []
    total, shortest = 0.0, math.inf
    for t in sorted(titres, key=lambda t: -urgency[t.tid]):
        d = on_air(t)
        if total + d - min(shortest, d) < capacity:
            out.append(t)
            total += d
            shortest = min(shortest, d)
    return out


def _target(grille: GrilleConfig, day: int, hour: int) -> Vector:
    c = grille.cibles[bloc(day, hour)]
    return np.array([c.energie, c.dansabilite, c.tempo])


def _unit(v: npt.NDArray[np.float32]) -> Vector:
    return np.asarray(v / np.linalg.norm(v), dtype=np.float64)


def _style(a: Titre | None, b: Titre) -> float:
    """Distance de style (1 - cosinus des empreintes) ; nulle sans titre avant."""
    if a is None:
        return 0.0
    if a.style is None or b.style is None:
        return STYLE_NEUTRE
    return 1.0 - float(a.style @ b.style)


def _drift(
    titres: list[Titre], previous: Titre | None, target: Vector, style: float
) -> list[Titre]:
    """Fil qui dérive : chaque titre est le plus proche du précédent, de sa fin au début du
    suivant pour les mesures, et en style."""
    left = list(titres)
    out: list[Titre] = []
    prev, end = previous, previous.q_end if previous is not None else target
    while left:
        nxt = min(
            left,
            key=lambda t: (
                float(np.linalg.norm(t.q_start - end)) + style * _style(prev, t),
                t.tid,
            ),
        )
        left.remove(nxt)
        out.append(nxt)
        prev, end = nxt, nxt.q_end
    return out


def record(conn: sqlite3.Connection, plan: Plan) -> None:
    """Garde la grille publiée heure par heure ; oublie ce qui a plus d'un jour."""
    if not plan.spans:
        return
    starts = {h: begin for h, (begin, _) in plan.spans.items()}
    with conn:
        conn.executemany("DELETE FROM grille WHERE hour_start = ?", [(b,) for b in starts.values()])
        conn.executemany(
            "INSERT INTO grille VALUES (?, ?)",
            [(starts[h], t.song_id) for h, ts in plan.hours.items() for t in ts],
        )
        conn.execute("DELETE FROM grille WHERE hour_start < ?", (min(starts.values()) - 86400,))


def with_published(
    conn: sqlite3.Connection,
    played: dict[str, float],
    now: float,
    rewritten: Iterable[float],
) -> dict[str, float]:
    """Le dernier passage de chaque titre, en comptant ce que la grille publiée jouera encore :
    un titre publié, pas encore joué, compte comme joué à la fin de son heure. Sans cela, la grille
    écrite à 23:00 replace à minuit les titres et les artistes de 23 h. Les heures que le plan
    réécrit (`rewritten`, leurs débuts) ne joueront pas ce qu'elles avaient : les compter
    bloquerait jusqu'au soir chaque titre et chaque artiste qu'elles remplacent, quand la passe du
    dimanche réécrit le reste de la journée. Un titre de fin d'heure coupé n'y perd qu'un jour de
    rotation."""
    rewritten = set(rewritten)
    out = dict(played)
    for start, song in conn.execute(
        "SELECT hour_start, song_id FROM grille WHERE hour_start + 3600 > ?", (now,)
    ):
        if start in rewritten:
            continue
        out[str(song)] = max(out.get(str(song), -math.inf), float(start) + 3600)
    return out


def m3u(titres: list[Titre]) -> str:
    return "#EXTM3U\n" + "".join(f"{t.path}\n" for t in titres)


class Programmer(Protocol):
    def playlists(self) -> dict[str, int]: ...

    def create_hour_playlist(self, name: str, day: int, hour: int) -> int: ...

    def fill_playlist(self, playlist_id: int, m3u: str) -> int: ...

    def empty_playlist(self, playlist_id: int) -> None: ...


class Station(Programmer, Protocol):
    def timezone(self) -> str: ...

    def start_next_s(self) -> float: ...

    def last_played(self, start: str, end: str) -> dict[str, float]: ...

    def queued(self) -> dict[str, float]: ...


def grille_pass(
    conn: sqlite3.Connection, station: Station, cfg: GrilleConfig, today: bool, now: datetime
) -> tuple[Plan, list[str]]:
    """Planifie, publie et garde la grille de demain, ou des heures qui restent aujourd'hui ;
    renvoie le plan et les heures mal écrites."""
    tz = ZoneInfo(station.timezone())
    start_next = station.start_next_s()
    now = now.astimezone(tz)
    day = now.date() if today else now.date() + timedelta(days=1)
    hours = list(range(now.hour + 1, 24)) if today else list(range(24))
    history = station.last_played((now - timedelta(days=14)).isoformat(), now.isoformat())
    # Un titre en file passe même si son heure est réécrite, une fois remis à Liquidsoap : il
    # compte comme joué à son heure prévue.
    for song, at in station.queued().items():
        history[song] = max(history.get(song, at), at)
    spans = hour_spans(day, hours, tz)
    rewritten = [begin for begin, _ in spans.values()]
    played = with_published(conn, history, now.timestamp(), rewritten)
    midnight = datetime.combine(day, time(0), tzinfo=tz).timestamp()
    plan = plan_day(load_titres(conn), played, cfg, day, spans, midnight, start_next)
    errors = publish(plan, station, [h for h in hours if h not in spans])
    record(conn, plan)
    return plan, errors


def publish(plan: Plan, station: Programmer, missing: Iterable[int]) -> list[str]:
    """Écrit chaque heure du plan dans sa playlist, créée au premier usage ; renvoie les erreurs
    (titres que la station n'a pas retrouvés). Vide la playlist des heures `missing`, qui
    n'existent pas ce jour-là : AzuraCast la jouerait quand même, une fois, à l'heure qui suit
    (au passage à l'heure d'été, 2 h et 3 h donnent toutes deux 3 h ;
    `StationSchedule::getDateTime`, 0.23.8), avec la grille d'une autre semaine."""
    iso = plan.day.isoweekday()
    existing = station.playlists()
    for h in missing:
        pid = existing.get(playlist_name(iso, h))
        if pid is not None:
            station.empty_playlist(pid)
    errors = []
    for h, titres in plan.hours.items():
        name = playlist_name(iso, h)
        pid = existing.get(name)
        if pid is None:
            pid = station.create_hour_playlist(name, iso, h)
        found = station.fill_playlist(pid, m3u(titres))
        if found != len(titres):
            errors.append(f"{name} : {found} titres retrouvés sur {len(titres)}")
    return errors
