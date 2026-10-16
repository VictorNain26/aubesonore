"""Les votes : sélection de la semaine, page de vote, rappel et état du modèle."""

from datetime import UTC, datetime

import numpy as np
import typer
import uvicorn

from radio.cli import common
from radio.cli.common import (
    _batch_line,
    _db,
    _dec,
    _editorial,
    _fail,
    _n,
    _now,
    _rate,
    _record,
    _stage,
    app,
)
from radio.core.config import Editorial, Settings
from radio.notify.whatsapp import WhatsAppError, send_whatsapp
from radio.sources.deezer import DeezerClient
from radio.votes.access import AccessVerifier
from radio.votes.app import create_app, page_ok
from radio.votes.select import NoScoresError, NoServingModelError, PendingBallotsError, select_batch
from radio.votes.status import Status, load_status
from radio.votes.suivi import load_suivi


def _status(settings: Settings, editorial: Editorial) -> Status:
    with _db(settings) as conn:
        return load_status(
            conn,
            settings.trained_models_dir,
            editorial.model.exam_window,
            editorial.votes.quiet_days,
            datetime.now(UTC),
        )


def _status_lines(st: Status, quiet_days: int) -> list[str]:
    if st.model_id is None:
        lines = ["Aucun modèle en service"]
    else:
        lines = [f"Modèle n°{st.model_id} : AUC d'examen {_dec(st.exam_auc)} sur {_n(st.n_exam)}"]
    if st.yes is None:
        lines.append("Taux de oui des retenus : aucun vote d'examen sur la page")
    else:
        y = st.yes
        lines.append(
            f"Taux de oui des retenus : {_rate(y.rate)} [{_rate(y.low)} - {_rate(y.high)}] "
            f"sur {_n(y.n)} votes d'examen"
        )
    lines += [
        f"Dernier vote d'examen : {st.last_exam_vote or 'aucun'}",
        f"Votes des {quiet_days} derniers jours : {_n(st.recent_votes)}",
        f"Titres en attente de vote : {_n(st.pending)} "
        f"(dernière sélection : {st.last_selection or 'aucune'})",
    ]
    if st.pending == 0:
        if st.last_selection is None:
            lines.append("ALERTE : aucune sélection encore tirée (passe hebdomadaire en échec ?)")
        elif st.stale_selection_days is not None and st.stale_selection_days > quiet_days:
            lines.append(
                f"ALERTE : aucune sélection depuis {_n(st.stale_selection_days)} jours "
                "(passe hebdomadaire en échec ?)"
            )
    if st.batch is not None:
        lines.append(_batch_line(st.batch))
    return lines


@app.command("votes-select")
@_stage("votes-select")
def votes_select() -> None:
    """Tire la sélection de la semaine : examen à parts égales par famille, leçon par
    incertitude."""
    settings = common._settings()
    v = _editorial(settings).votes
    with _db(settings) as conn:
        try:
            sel = select_batch(
                conn,
                np.random.default_rng(),
                v.exam_per_selection,
                v.lesson_per_selection,
                _now(),
            )
        except PendingBallotsError as e:
            _record(conn, "votes-select", True, {"en attente de vote": e.n})
            typer.echo(f"{_n(e.n)} titres encore en attente de vote : pas de nouvelle sélection")
            return
        except NoServingModelError:
            _fail("Aucun modèle en service : lancer radio train", 1)
        except NoScoresError:
            _fail("Le modèle en service n'a noté aucun candidat : lancer radio train", 1)
        _record(
            conn,
            "votes-select",
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


@app.command("votes-serve")
def votes_serve() -> None:
    """Sert la page de vote en local ; le tunnel Cloudflare la publie derrière Access."""
    settings = common._settings()
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


@app.command("votes-remind")
@_stage("votes-remind")
def votes_remind() -> None:
    """Envoie le rappel WhatsApp : titres en attente, taux de oui, alertes."""
    settings = common._settings()
    editorial = _editorial(settings)
    if settings.whatsapp_phone is None or settings.callmebot_apikey is None:
        _fail("WHATSAPP_PHONE et CALLMEBOT_APIKEY doivent être définis dans .env", 2)
    if not settings.votes_url:
        _fail("RADIO_VOTES_URL doit être défini dans .env", 2)
    st = _status(settings, editorial)
    head = (
        f"AubeSonore : {_n(st.pending)} titres à écouter — {settings.votes_url}"
        if st.pending
        else "AubeSonore : aucun titre en attente de vote"
    )
    with _db(settings) as conn:
        to_adjust = load_suivi(conn, editorial.nouveautes).to_adjust
    suivi = f"Suivi : {settings.votes_url.rstrip('/')}/suivi" + (
        f" ({_n(len(to_adjust))} points à ajuster)" if to_adjust else ""
    )
    lines = [head, suivi] + (
        [] if page_ok(settings.votes_host, settings.votes_port) else ["Page de vote injoignable"]
    )
    text = "\n".join(lines + _status_lines(st, editorial.votes.quiet_days))
    typer.echo(text)
    try:
        send_whatsapp(
            settings.whatsapp_phone.get_secret_value(),
            settings.callmebot_apikey.get_secret_value(),
            text,
        )
    except WhatsAppError as e:
        _fail(f"Rappel WhatsApp non envoyé : {e}", 1)
    with _db(settings) as conn:
        _record(conn, "votes-remind", True, {"en attente": st.pending})
    typer.echo("Rappel WhatsApp envoyé")
