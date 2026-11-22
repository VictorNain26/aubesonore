"""Les votes : le tirage de la semaine et la page de vote."""

import numpy as np
import typer
import uvicorn

from radio.commandes import commun
from radio.commandes.commun import (
    _db,
    _editorial,
    _fail,
    _n,
    _now,
    _record,
    _stage,
    app,
)
from radio.sources.deezer import DeezerClient
from radio.votes.acces import AccessVerifier
from radio.votes.page import create_app
from radio.votes.tirage import NoScoresError, NoServingModelError, PendingBallotsError, select_batch


@app.command("tirage")
@_stage("tirage")
def tirage() -> None:
    """Tire la sélection de la semaine : examen à parts égales par famille, leçon par
    incertitude."""
    settings = commun._settings()
    editorial = _editorial(settings)
    v = editorial.votes
    with _db(settings) as conn:
        try:
            sel = select_batch(
                conn,
                np.random.default_rng(),
                v.exam_per_selection,
                v.lesson_per_selection,
                _now(),
                floor=editorial.model.floor,
            )
        except PendingBallotsError as e:
            _record(conn, "tirage", True, {"en attente de vote": e.n})
            typer.echo(f"{_n(e.n)} titres encore en attente de vote : pas de nouvelle sélection")
            return
        except NoServingModelError:
            _fail("Aucun modèle en service : lancer radio gout", 1)
        except NoScoresError:
            _fail("Le modèle en service n'a noté aucun candidat : lancer radio gout", 1)
        _record(
            conn,
            "tirage",
            True,
            {"examen": len(sel.exam), "leçon": len(sel.lesson), "fournée": sel.n_batch},
        )
    if sel.selection_id is None:
        typer.echo("Rien à présenter : tous les candidats notés ont déjà été présentés")
        return
    typer.echo(
        f"Sélection n°{sel.selection_id} (modèle n°{sel.model_id}, fournée n°{sel.run_id}) : "
        f"{_n(len(sel.exam))} d'examen parmi {_n(sel.n_batch)} titres de la fournée, "
        f"{_n(len(sel.lesson))} de leçon"
    )


@app.command("page-votes")
def page_votes() -> None:
    """Sert la page de vote en local ; le tunnel Cloudflare la publie derrière Access."""
    settings = commun._settings()
    team, aud = settings.cf_access_team_domain, settings.cf_access_aud
    if not team or not aud:
        _fail("CF_ACCESS_TEAM_DOMAIN et CF_ACCESS_AUD doivent être définis dans .env", 2)
    web = create_app(
        settings.db_path,
        DeezerClient(),
        AccessVerifier(team, aud),
        _editorial(settings).nouveautes,
    )
    uvicorn.run(web, host=settings.votes_host, port=settings.votes_port)
