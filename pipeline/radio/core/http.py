"""Hook de relance unique du processus (stamina), et le tri commun des réponses HTTP des clients
de `sources/` : une panne passagère est relancée, un refus ne l'est pas.

`set_on_retry_hooks` est global : un seul hook générique, qui ne journalise que le nom de la
fonction, le type d'exception et le numéro d'essai. Jamais les arguments ni le message : la
clé Last.fm voyage dans l'URL, et les URL d'extraits Deezer sont signées.
"""

import logging
from collections.abc import Callable
from typing import Any, ParamSpec, TypeVar

import requests
import stamina
from stamina.instrumentation import RetryDetails, set_on_retry_hooks

P = ParamSpec("P")
T = TypeVar("T")

logger = logging.getLogger(__name__)


def log_retry(details: RetryDetails) -> None:
    logger.warning(
        "%s failed (%s), retrying (attempt %d)",
        details.name,
        type(details.caused_by).__name__,
        details.retry_num,
    )


set_on_retry_hooks((log_retry,))


def retried(
    unavailable: type[Exception], *, attempts: int = 5, wait_initial: float = 1.0
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    """Relance sur `unavailable`, `attempts` tentatives quelle que soit leur durée : les 45 s au
    total par défaut de stamina (`timeout`) arrêteraient les relances après une seule requête
    expirée."""
    return stamina.retry(
        on=unavailable,
        timeout=None,
        attempts=attempts,
        wait_initial=wait_initial,
        wait_max=30.0,
    )


def check_status(
    r: requests.Response, unavailable: type[Exception], refused: type[Exception]
) -> None:
    """429 et 5xx : panne passagère, relancée (RFC 6585 §4, RFC 9110 §15.6). Autre 4xx : refus."""
    if r.status_code == 429 or r.status_code >= 500:
        raise unavailable(f"HTTP {r.status_code}")
    if r.status_code >= 400:
        raise refused(f"HTTP {r.status_code}")


def json_or_none(r: requests.Response) -> Any:
    """Le corps JSON, ou None : une page HTML à sa place est celle d'un proxy ou d'une erreur
    passagère, que l'appelant traite en panne."""
    try:
        return r.json()
    except ValueError:
        return None
