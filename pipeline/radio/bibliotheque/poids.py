"""Poids tirés des écoutes Plex : 1 + log(1 + écoutes), plafonné à 4.

Tout artiste ou titre garde un poids d'au moins 1 : les coins peu écoutés comptent aussi.
"""

import math

WEIGHT_CAP = 4.0


def play_weight(plays: int) -> float:
    return min(1.0 + math.log1p(plays), WEIGHT_CAP)
