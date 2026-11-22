"""Rapprochement strict bibliothèque → Deezer : jamais deviné, toujours compté."""

import logging
import re
import sqlite3
import unicodedata
from collections import Counter
from dataclasses import dataclass, field

from radio.sources.deezer import DeezerClient, DeezerError, DeezerTrack

logger = logging.getLogger(__name__)

# Qualificatifs qui désignent le MÊME enregistrement (tout leur contenu doit correspondre) :
# années/remaster, explicit, version album/single/lp, original mix, bonus track, feat./ft.
# « with » est exclu : « (with Strings) »/« (with the LSO) » peuvent désigner une autre version.
# « original » seul ou « original version » aussi : ils s'opposent à un réenregistrement, seul
# « Original Mix » est inoffensif. Tout le reste (live, remix, mix, edit, instrumental, acoustic,
# demo, mono, version X, part N) est conservé : un faux rapprochement est pire qu'un titre manqué.
_HARMLESS = re.compile(
    r"(?:\d{4}\s+)?(?:digital(?:ly)?\s+)?remaster(?:ed)?(?:\s+(?:version|edition))?(?:\s+\d{4})?"
    r"|explicit(?:\s+version)?"
    r"|(?:album|single|lp)\s+version"
    r"|original\s+mix"
    r"|bonus\s+track"
    # feat. : s'arrête avant un tiret (simple, demi-cadratin, cadratin) précédé d'une espace,
    # « : » ou « / », pour ne pas avaler « (feat. X - Live) ».
    r"|(?:feat\.?|ft\.?|featuring)\s(?:(?!\s[-\u2013\u2014]|[:/]).)+"
)
_BRACKETS = re.compile(r"\(([^)]*)\)|\[([^\]]*)\]")
# Tiret, demi-cadratin ou cadratin : seul un suffixe inoffensif est retiré ensuite.
_DASH_SUFFIX = re.compile(r"\s[-\u2013\u2014]\s(.*)$")
# S'arrête au premier "(", "[", ":", "/", demi-cadratin, cadratin ou " -" qui suit, pour ne
# jamais avaler un qualificatif gardé (ex. "Song feat. X (Live)" -> seul "feat. X" est retiré,
# "(Live)" reste pour _debracket). Un tiret collé ("Jay-Z") ne coupe pas : il faut une espace
# devant.
_FEAT = re.compile(
    r"\s(?:feat\.|featuring)\s[^()\[\]:/\u2013\u2014]*?"
    r"(?=\s*(?:[(\[:/\u2013\u2014]|\s-\s?|$))"
)
_PUNCT = re.compile(r"[^\w\s]|_")
_SPACES = re.compile(r"\s+")
_CREDITS = re.compile(r"\s*[&,]\s*")
_LATIN_MAX = 0x250  # au-delà : pas un alphabet latin, on ne touche pas aux marques combinantes.


def _base(s: str) -> str:
    decomposed = unicodedata.normalize("NFKD", s)
    kept: list[str] = []
    latin_base = False
    for ch in decomposed:
        if unicodedata.combining(ch):
            if latin_base:
                continue  # accent retiré : la lettre de base est latine
            kept.append(ch)  # marque combinante conservée : base non latine
        else:
            kept.append(ch)
            latin_base = ord(ch) < _LATIN_MAX
    recomposed = unicodedata.normalize("NFC", "".join(kept))
    return recomposed.casefold().replace("&", " and ")


def _is_harmless(content: str) -> bool:
    return _HARMLESS.fullmatch(_base(content).strip()) is not None


def _finish(s: str) -> str:
    s = _SPACES.sub(" ", _PUNCT.sub(" ", s)).strip()
    return s[4:] if s.startswith("the ") else s


def _debracket(s: str) -> str:
    def repl(m: re.Match[str]) -> str:
        content = m.group(1) if m.group(1) is not None else m.group(2)
        if _is_harmless(content):
            return " "
        return " " + content.strip() + " "

    return _BRACKETS.sub(repl, s)


def _de_dash(s: str) -> str:
    m = _DASH_SUFFIX.search(s)
    if m and _is_harmless(m.group(1)):
        return s[: m.start()]
    return s


def normalize(s: str) -> str:
    base = _base(s)
    no_feat = _FEAT.sub(" ", base)
    no_brackets = _debracket(no_feat)
    no_dash = _de_dash(no_brackets)
    return _finish(no_dash)


def search_query(artist: str, title: str) -> str:
    """Requête Deezer SIMPLE (pas de syntaxe avancée `artist:"..." track:"..."`) : le filtre
    `artist:` est cassé côté Deezer, constaté le 2026-09-25 (`q=artist:"Aloe Blacc"` renvoie un
    résultat d'un autre artiste, `q=artist:"daft punk"` n'en renvoie aucun). pick_match reste seul
    juge : cette requête ne fait que ramener des candidats.
    """

    def clean(s: str) -> str:
        return _SPACES.sub(" ", s.replace('"', "")).strip()

    def debracket_search(s: str) -> str:
        def repl(m: re.Match[str]) -> str:
            content = m.group(1) if m.group(1) is not None else m.group(2)
            return "" if _is_harmless(content) else m.group(0)

        return _BRACKETS.sub(repl, s)

    # Même ordre que normalize() : feat. d'abord, puis crochets, puis suffixe tiret, pour que
    # "Song feat. X (Live)" donne "Song (Live)" (le qualificatif non inoffensif est conservé).
    # _FEAT travaille ici sur le texte brut (pas de _base au préalable) : il ne dépend pas des
    # accents, seulement de la ponctuation autour de "feat."/"featuring".
    t = clean(_de_dash(debracket_search(_FEAT.sub(" ", title))))
    if not t:
        t = clean(title)  # repli sur le titre brut : la requête n'a jamais un titre vide.

    a = clean(_FEAT.sub(" ", artist))
    if not a:
        a = clean(artist)  # repli sur l'artiste brut : la requête n'a jamais un artiste vide.

    return f"{a} {t}"


def _credited(artist: str) -> set[str]:
    """Le nom complet et chaque artiste d'un crédit « A & B » ou « A, B » : Deezer ne garde
    souvent que l'artiste principal (« Aidan Moffat & Bill Wells » y est « Bill Wells »). Jamais
    découpé sur « and », que portent trop de noms (Florence and the Machine)."""
    names = {normalize(artist)} | {normalize(part) for part in _CREDITS.split(artist)}
    names.discard("")
    return names


def pick_match(
    artist: str, title: str, duration_ms: int, results: list[DeezerTrack], tolerance_s: int
) -> DeezerTrack | None:
    na, nt = normalize(artist), normalize(title)
    if not na or not nt:
        return None
    names = _credited(artist)
    ok = [
        r
        for r in results
        if normalize(r.artist_name) in names
        and normalize(r.title) == nt
        and abs(r.duration_s * 1000 - duration_ms) <= tolerance_s * 1000
    ]
    if not ok:
        return None
    return min(
        ok,
        key=lambda r: (
            normalize(r.artist_name) != na,  # le crédit complet d'abord
            not r.has_preview,
            abs(r.duration_s * 1000 - duration_ms),
            -r.rank,
        ),
    )


@dataclass(frozen=True)
class MatchReport:
    n_todo: int
    n_matched: int
    unmatched: dict[str, int] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)


def match_library(
    conn: sqlite3.Connection, deezer: DeezerClient, tolerance_s: int, now: str, batch: int = 50
) -> MatchReport:
    todo = conn.execute(
        """
        SELECT t.plex_key, t.artist, t.title, t.duration_ms
        FROM library_tracks t LEFT JOIN deezer_matches m USING (plex_key)
        WHERE m.plex_key IS NULL ORDER BY t.plex_key
        """
    ).fetchall()
    matched = 0
    unmatched: Counter[str] = Counter()
    errors: list[str] = []
    rows: list[tuple[object, ...]] = []

    def flush() -> None:
        with conn:
            conn.executemany("INSERT INTO deezer_matches VALUES (?, ?, ?, ?, ?, ?)", rows)
        rows.clear()

    try:
        for i, r in enumerate(todo, 1):
            key, artist, title, dur = r["plex_key"], r["artist"], r["title"], r["duration_ms"]
            if dur is None:
                rows.append((key, "unmatched", "no_duration", None, None, now))
                unmatched["no_duration"] += 1
            else:
                try:
                    results = deezer.search_tracks(search_query(artist, title))
                except DeezerError as e:
                    errors.append(f"{artist} — {title} ({type(e).__name__})")
                    continue
                best = pick_match(artist, title, dur, results, tolerance_s)
                if best is not None:
                    rows.append((key, "matched", None, best.id, best.artist_id, now))
                    matched += 1
                else:
                    reason = "no_exact_match" if results else "no_result"
                    rows.append((key, "unmatched", reason, None, None, now))
                    unmatched[reason] += 1
            if len(rows) >= batch:
                flush()
            if i % 100 == 0:
                logger.info("match: %d/%d tracks processed", i, len(todo))
    finally:
        flush()
    return MatchReport(len(todo), matched, dict(unmatched), errors)


def coverage(conn: sqlite3.Connection) -> tuple[int, int]:
    matched = conn.execute(
        "SELECT COUNT(*) FROM deezer_matches WHERE status = 'matched'"
    ).fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM library_tracks").fetchone()[0]
    return int(matched), int(total)
