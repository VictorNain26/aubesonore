"""Le téléchargement des retenus."""

from radio.commandes import commun
from radio.commandes.commun import (
    _db,
    _echo,
    _editorial,
    _fail,
    _n,
    _now,
    _pct,
    _rate,
    _record,
    _stage,
    _unavailable,
    app,
)
from radio.sources.deezer import DeezerClient, DeezerUnavailable
from radio.telechargement.sockseek import SockseekError
from radio.telechargement.telecharger import acquire_pass


@app.command("telechargement")
@_stage("telechargement")
def telechargement() -> None:
    """Télécharge les titres retenus sur Soulseek, prouve leur identité et les prépare."""
    settings = commun._settings()
    cfg = _editorial(settings).telechargement
    if not settings.soulseek_user or settings.soulseek_password is None:
        _fail("SOULSEEK_USER et SOULSEEK_PASSWORD doivent être définis dans .env", 2)
    if settings.runtime_dir is None:
        _fail("ni RUNTIME_DIRECTORY ni XDG_RUNTIME_DIR : pas de tmpfs pour la config Sockseek", 2)
    now = _now()
    with _db(settings) as conn:
        try:
            rep = acquire_pass(
                conn,
                DeezerClient(),
                (
                    settings.data_dir / "acquisition" / now[:19].replace(":", ""),
                    settings.data_dir / "antenne",
                    settings.runtime_dir,
                ),
                (settings.sockseek_bin, settings.rsgain_bin),
                (settings.soulseek_user, settings.soulseek_password.get_secret_value()),
                cfg,
                now,
            )
        except DeezerUnavailable as e:
            _fail(_unavailable(e), 1)
        except SockseekError as e:
            _fail(f"Sockseek en échec ({e}) : aucune tentative comptée, relancer plus tard", 1)
        rate = rep.n_ready / rep.n_attempted if rep.n_attempted else 1.0
        rate_ok = rep.n_attempted < cfg.tentatives_min_pour_taux or rate >= cfg.taux_reussite_min
        _record(
            conn,
            "telechargement",
            rate_ok and not rep.n_unindexed,
            {
                "demandés": rep.n_wanted,
                "prêts": rep.n_ready,
                "sans pochette": rep.n_no_cover,
                "non tentés": rep.n_unindexed,
                "artiste déjà à l'antenne": rep.n_artist_waiting,
                "échecs": dict(rep.failures),
            },
        )
    _echo(
        [
            f"Acquisition : {_n(rep.n_wanted)} demandés → {_n(rep.n_ready)} prêts "
            f"({_pct(rep.n_ready, rep.n_attempted)} des tentés), "
            f"{_n(sum(rep.failures.values()))} en échec",
            f"  prêts sans pochette : {_n(rep.n_no_cover)}",
            f"  retenus en attente, leur artiste ayant déjà un titre à l'antenne : "
            f"{_n(rep.n_artist_waiting)}",
            *(f"  {reason} : {_n(n)}" for reason, n in rep.failures.most_common()),
        ]
    )
    if rep.n_unindexed:
        _fail(
            f"Sockseek s'est arrêté avant {_n(rep.n_unindexed)} titres, non comptés comme "
            "tentatives : voir data/acquisition/sockseek.log",
            1,
        )
    if not rate_ok:
        _fail(f"Taux d'acquisition sous {_rate(cfg.taux_reussite_min)} : à examiner", 1)
