"""La grille horaire."""

from datetime import UTC, datetime

import typer

from radio.commandes import commun
from radio.commandes.commun import (
    _db,
    _echo,
    _editorial,
    _fail,
    _n,
    _record,
    _stage,
    app,
)
from radio.grille import plan as grille_mod
from radio.sources.azuracast import AzuracastClient, AzuracastUnavailable


@app.command("grille")
@_stage("grille")
def grille(
    aujourdhui: bool = typer.Option(
        False, "--aujourdhui", help="Les heures restantes d'aujourd'hui, au lieu de demain."
    ),
) -> None:
    """Écrit la grille d'une journée dans les playlists horaires d'AzuraCast : qui passe, à
    quelle heure, dans quel ordre."""
    settings = commun._settings()
    cfg = _editorial(settings).grille
    if settings.azuracast_api_key is None:
        _fail("AZURACAST_API_KEY doit être défini dans .env", 2)
    station = AzuracastClient(
        settings.azuracast_url,
        settings.azuracast_api_key.get_secret_value(),
        settings.azuracast_station_id,
    )
    with _db(settings) as conn:
        try:
            plan, errors = grille_mod.programmer_grille(
                conn, station, cfg, aujourdhui, datetime.now(UTC)
            )
        except AzuracastUnavailable as e:
            _fail(f"AzuraCast indisponible ({e})", 1)
        _record(
            conn,
            "grille",
            not errors and not plan.short_hours,
            {
                "jour": plan.day.isoformat(),
                "heures": len(plan.hours),
                "créneaux": plan.slots,
                "heures courtes": plan.short_hours,
                "créneaux cédés": plan.empty_slots,
                "titres non mesurés": plan.unmeasured,
                "titres en retard": plan.late,
                "tour en jours": {c: round(d, 2) for c, d in plan.turnover_days.items()},
                "titres par artiste au plus": plan.max_per_artist,
                "erreurs": len(errors),
            },
        )
    _echo(
        [
            f"Grille du {plan.day.isoformat()} : {_n(len(plan.hours))} heures, créneaux "
            + ", ".join(f"{c} {_n(n)}" for c, n in plan.slots.items()),
            f"  heures courtes : {_n(plan.short_hours)}, créneaux cédés à une autre catégorie : "
            f"{_n(plan.empty_slots)}, titres pas encore mesurés : "
            f"{_n(plan.unmeasured)}, titres pas joués depuis plus de deux tours : "
            f"{_n(plan.late)}",
            "  tour de chaque catégorie : "
            + ", ".join(f"{c} {d:.1f} j" for c, d in plan.turnover_days.items())
            + f" ; titres d'un même artiste à l'antenne : {_n(plan.max_per_artist)} au plus",
            *(f"  erreur : {e}" for e in errors),
        ]
    )
    # Une heure que ses titres ne couvrent pas s'épuise, et le secours joue à la place de la
    # grille (conception §1). La grille publiée est gardée, et la commande échoue.
    problems = [f"{_n(len(errors))} heures mal écrites"] if errors else []
    if plan.short_hours:
        problems.append(f"{_n(plan.short_hours)} heures trop courtes : le secours jouera")
    if problems:
        _fail(" ; ".join(problems), 1)
