"""Vérification du jeton Cloudflare Access à l'origine (doc Cloudflare « Validate JWTs »).

La page n'écoute qu'en local et n'est publiée que par le tunnel. Le jeton prouve en plus que la
requête est passée par l'application Access : une route de tunnel sans règle Access serait
ouverte à tous. En-tête `Cf-Access-Jwt-Assertion`, RS256, audience = étiquette AUD de
l'application, émetteur = https://<équipe>.cloudflareaccess.com. Les clés publiques sont lues
sur <émetteur>/cdn-cgi/access/certs, et PyJWKClient les met en cache.
"""

from typing import Any, Protocol

import jwt

HEADER = "Cf-Access-Jwt-Assertion"


class SigningKeys(Protocol):
    def get_signing_key_from_jwt(self, token: str) -> Any: ...


class AccessVerifier:
    def __init__(self, team_domain: str, aud: str, keys: SigningKeys | None = None) -> None:
        self.issuer = f"https://{team_domain}"
        self._aud = aud
        self._keys = (
            keys if keys is not None else jwt.PyJWKClient(f"{self.issuer}/cdn-cgi/access/certs")
        )

    def __call__(self, token: str) -> None:
        """Lève jwt.PyJWTError si le jeton n'est pas un jeton Access valide pour cette page."""
        key = self._keys.get_signing_key_from_jwt(token).key
        jwt.decode(token, key, algorithms=["RS256"], audience=self._aud, issuer=self.issuer)
