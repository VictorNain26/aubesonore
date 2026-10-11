"""Page de vote : une page pour le téléphone, un geste par titre.

- Chaque requête, sauf /sante, doit porter un jeton Cloudflare Access valide.
- L'extrait est servi par la page elle-même. Le serveur demande à Deezer une URL fraîche
  (signée, elle expire) et relaie l'audio : l'URL ne quitte jamais le serveur et n'est jamais
  journalisée.
- Le vote est enregistré tout de suite en SQLite ; la page passe au titre suivant.
- /semaine relit les votes de la dernière sélection et permet de les corriger jusqu'à la passe
  suivante (radio/votes/select.py).
- /suivi montre le parcours des sources et ce qui est à ajuster (radio/votes/suivi.py).
- Fonctions synchrones : FastAPI les exécute dans son pool de fils, une connexion SQLite par
  requête.
"""

import html
import logging
import os
import tempfile
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Literal, Protocol

import jwt
from fastapi import Depends, FastAPI, Form, Header, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from starlette.background import BackgroundTask

from radio.core.config import FreshConfig
from radio.core.db import connect
from radio.sources.deezer import DeezerError, DeezerTrack, DeezerUnavailable
from radio.votes.select import Ballot, CastVote, pending_ballots, record_vote, week_votes
from radio.votes.suivi import Suivi, load_suivi, pct

logger = logging.getLogger(__name__)

_STYLE = """
:root{color-scheme:light;--fond:#f4f2ec;--texte:#1d1b18;--doux:#696258;--oui:#2e7a4c;
--non:#a13a2b}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--fond:#151412;--texte:#eeeae3;
--doux:#a59e93;--oui:#3f9a63;--non:#c2513f}}
body{margin:0;background:var(--fond);color:var(--texte);font:17px/1.45 system-ui,sans-serif}
main{max-width:30rem;margin:0 auto;padding:1.5rem 1rem;display:flex;flex-direction:column;
gap:.8rem}
h1{font-size:1.6rem;line-height:1.2;margin:0;text-wrap:balance}
.reste,.artiste,.question{margin:0;color:var(--doux)}
.artiste{font-size:1.1rem}
audio{width:100%}
form{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}
button{font:inherit;font-weight:600;padding:1.1rem;border:0;border-radius:.6rem;color:#fff}
button:focus-visible{outline:3px solid var(--texte);outline-offset:2px}
.oui{background:var(--oui)}
.non{background:var(--non)}
.passer{grid-column:1/-1;background:transparent;color:var(--doux);border:1px solid var(--doux)}
h2{font-size:1.1rem;margin:1rem 0 0}
table{border-collapse:collapse;font-size:.9rem;font-variant-numeric:tabular-nums}
th,td{padding:.25rem .4rem;text-align:right}
th:first-child,td:first-child{text-align:left}
ul{margin:0;padding-left:1.2rem}
.semaine{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1.4rem}
.semaine li{display:flex;flex-direction:column;gap:.4rem}
.semaine .titre{margin:0;font-weight:600}
.corriger{grid-template-columns:repeat(3,1fr);gap:.5rem}
.corriger button{padding:.6rem}
.corriger .passer{grid-column:auto}
.corriger button[aria-pressed=false]{background:transparent;color:var(--texte);
border:1px solid var(--doux)}
.corriger .passer[aria-pressed=true]{background:var(--doux);color:var(--fond)}
"""

_CHOICES = (("oui", "Oui"), ("non", "Non"), ("passer", "Passer"))


class PreviewSource(Protocol):
    def track(self, track_id: int) -> tuple[DeezerTrack, str | None] | None: ...

    def download(self, url: str) -> bytes: ...


def _shell(body: str) -> str:
    return (
        '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>AubeSonore : à l'écoute</title><style>{_STYLE}</style></head>"
        f"<body><main>{body}</main></body></html>"
    )


def _week_link(n_voted: int) -> str:
    return (
        f'<p><a href="/semaine">Revoir les votes de la semaine ({n_voted})</a></p>'
        if n_voted
        else ""
    )


def _page(ballots: list[Ballot], n_voted: int) -> str:
    if not ballots:
        return _shell(
            "<h1>Rien à écouter</h1>"
            '<p class="reste">La prochaine sélection arrivera avec le rappel WhatsApp.</p>'
            + _week_link(n_voted)
        )
    b = ballots[0]
    buttons = "".join(
        f'<button name="choix" value="{v}" class="{v}">{label}</button>' for v, label in _CHOICES
    )
    return _shell(
        f'<p class="reste">{len(ballots)} à écouter</p>'
        f"<h1>{html.escape(b.title)}</h1>"
        f'<p class="artiste">{html.escape(b.artist)}</p>'
        f'<audio controls autoplay preload="auto" src="/extrait/{b.deezer_track_id}" '
        'onerror="this.nextElementSibling.hidden=false"></audio>'
        '<p class="indispo" hidden>Extrait indisponible : choisir « Passer ».</p>'
        '<p class="question">À sa place sur AubeSonore ?</p>'
        '<form method="post" action="/vote">'
        f'<input type="hidden" name="tid" value="{b.deezer_track_id}">{buttons}</form>'
        + _week_link(n_voted)
    )


def _week_page(votes: list[CastVote]) -> str:
    def item(c: CastVote) -> str:
        tid = c.ballot.deezer_track_id
        buttons = "".join(
            f'<button name="choix" value="{v}" class="{v}" '
            f'aria-pressed="{"true" if v == c.vote else "false"}">{label}</button>'
            for v, label in _CHOICES
        )
        return (
            f'<li><p class="titre">{html.escape(c.ballot.title)}</p>'
            f'<p class="artiste">{html.escape(c.ballot.artist)}</p>'
            f'<audio controls preload="none" src="/extrait/{tid}"></audio>'
            f'<form method="post" action="/vote" class="corriger" '
            f'aria-label="{html.escape(c.ballot.title)}">'
            f'<input type="hidden" name="tid" value="{tid}">'
            f'<input type="hidden" name="retour" value="/semaine">{buttons}</form></li>'
        )

    body = (
        '<p class="reste">Corrigeables jusqu\'à la passe du dimanche, qui les apprend.</p>'
        f'<ol class="semaine">{"".join(map(item, votes))}</ol>'
        if votes
        else '<p class="reste">Aucun vote cette semaine.</p>'
    )
    return _shell(f'<h1>Votes de la semaine</h1>{body}<p><a href="/">Retour au vote</a></p>')


def _suivi_page(s: Suivi) -> str:
    def row(cells: list[str]) -> str:
        return "<tr>" + "".join(f"<td>{html.escape(c)}</td>" for c in cells) + "</tr>"

    flows = "".join(
        row([f.key, str(f.candidates), str(f.retained), str(f.ready), str(f.failed), str(f.on_air)])
        for f in s.flows
    )
    rates = "".join(
        row([k, pct(r.rate), f"{pct(r.low)} - {pct(r.high)}", str(r.n)]) for k, r in s.by_source
    )
    adjust = "".join(f"<li>{html.escape(a)}</li>" for a in s.to_adjust) or "<li>rien</li>"
    run = f" (fournée n°{s.run_id})" if s.run_id else ""
    return _shell(
        "<h1>Suivi des sources</h1>"
        f"<h2>À ajuster</h2><ul>{adjust}</ul>"
        f"<h2>Parcours{run}</h2><table><tr><th>Source</th><th>Cand.</th><th>Retenus</th>"
        f"<th>Prêts</th><th>Échecs</th><th>Antenne</th></tr>{flows}</table>"
        "<h2>Oui à l'examen</h2><table><tr><th>Source</th><th>Oui</th><th>IC 95 %</th>"
        f"<th>Votes</th></tr>{rates}</table>"
        '<p><a href="/">Retour au vote</a></p>'
    )


def create_app(
    db_path: Path,
    deezer: PreviewSource,
    verify: Callable[[str], None],
    fresh: FreshConfig | None = None,
) -> FastAPI:
    def access(cf_access_jwt_assertion: Annotated[str | None, Header()] = None) -> None:
        if cf_access_jwt_assertion is None:
            raise HTTPException(403, "Accès réservé")
        try:
            verify(cf_access_jwt_assertion)
        except jwt.PyJWTError as e:
            logger.warning("access token refused (%s)", type(e).__name__)
            raise HTTPException(403, "Accès réservé") from None

    def waiting() -> list[Ballot]:
        conn = connect(db_path)
        try:
            return pending_ballots(conn)
        finally:
            conn.close()

    def week() -> list[CastVote]:
        conn = connect(db_path)
        try:
            return week_votes(conn)
        finally:
            conn.close()

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    # FileResponse ne lance pas sa tâche de nettoyage quand il répond 400 ou 416 à un Range
    # invalide : les extraits vivent dans un répertoire supprimé avec l'application.
    app.state.extraits = tempfile.TemporaryDirectory(prefix="radio-extraits-")
    guarded = [Depends(access)]

    @app.get("/sante")
    def sante() -> dict[str, str]:
        return {"etat": "ok"}

    @app.get("/", response_class=HTMLResponse, dependencies=guarded)
    def page() -> str:
        return _page(waiting(), len(week()))

    @app.get("/semaine", response_class=HTMLResponse, dependencies=guarded)
    def semaine() -> str:
        return _week_page(week())

    @app.get("/suivi", response_class=HTMLResponse, dependencies=guarded)
    def suivi() -> str:
        conn = connect(db_path)
        try:
            return _suivi_page(load_suivi(conn, fresh or FreshConfig()))
        finally:
            conn.close()

    @app.post("/vote", dependencies=guarded)
    def vote(
        tid: Annotated[int, Form()],
        choix: Annotated[Literal["oui", "non", "passer"], Form()],
        retour: Annotated[Literal["/", "/semaine"], Form()] = "/",
    ) -> Response:
        conn = connect(db_path)
        try:
            recorded = record_vote(conn, tid, choix, datetime.now(UTC).isoformat())
        finally:
            conn.close()
        if not recorded:
            return HTMLResponse(
                _shell(
                    "<p>Ce vote est figé : la passe du dimanche l'a déjà appris.</p>"
                    '<p><a href="/">Continuer</a></p>'
                ),
                status_code=409,
            )
        return RedirectResponse(retour, status_code=303)

    @app.get("/extrait/{tid}", dependencies=guarded)
    def extrait(tid: int) -> Response:
        if tid not in {b.deezer_track_id for b in waiting()} | {
            c.ballot.deezer_track_id for c in week()
        }:
            raise HTTPException(404, "Titre inconnu")
        try:
            found = deezer.track(tid)
            if found is None or found[1] is None:
                logger.warning("preview unavailable for %s (%s)", tid, "no preview")
                raise HTTPException(404, "Extrait indisponible")
            audio = deezer.download(found[1])
        except DeezerError as e:
            logger.warning("preview unavailable for %s (%s)", tid, type(e).__name__)
            raise HTTPException(404, "Extrait indisponible") from None
        except DeezerUnavailable as e:
            logger.warning("preview unavailable for %s (%s)", tid, type(e).__name__)
            raise HTTPException(503, "Deezer indisponible, réessayer plus tard") from None

        # FileResponse gère Range : iOS Safari sonde l'extrait (`bytes=0-1`) avant de le lire.
        with tempfile.NamedTemporaryFile(
            suffix=".mp3", dir=app.state.extraits.name, delete=False
        ) as f:
            f.write(audio)
        return FileResponse(
            f.name,
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-store"},
            background=BackgroundTask(os.unlink, f.name),
        )

    return app
