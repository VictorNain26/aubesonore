"""Hook de relance unique du processus (stamina), et le tri commun des réponses HTTP des clients
de `sources/` : une panne passagère est relancée, un refus ne l'est pas.

`set_on_retry_hooks` est global : un seul hook générique, qui ne journalise que le nom de la
fonction, le type d'exception et le numéro d'essai. Jamais les arguments ni le message : la
clé Last.fm voyage dans l'URL, et les URL d'extraits Deezer sont signées.
"""

import logging
from typing import Any

import requests
from stamina.instrumentation import RetryDetails, set_on_retry_hooks

logger = logging.getLogger(__name__)


def log_retry(details: RetryDetails) -> None:
    logger.warning(
        "%s failed (%s), retrying (attempt %d)",
        details.name,
        type(details.caused_by).__name__,
        details.retry_num,
    )


set_on_retry_hooks((log_retry,))


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
