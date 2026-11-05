import io
import json
import time
import urllib.request
from types import SimpleNamespace
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from radio.votes.access import AccessVerifier

TEAM = "aube.cloudflareaccess.com"
ISS = f"https://{TEAM}"
AUD = "aud-tag-page-de-vote"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class Keys:
    def get_signing_key_from_jwt(self, token: str) -> Any:
        return SimpleNamespace(key=KEY.public_key())


def _token(key: Any = KEY, alg: str = "RS256", **claims: Any) -> str:
    body: dict[str, Any] = {
        "aud": [AUD],
        "iss": ISS,
        "exp": int(time.time()) + 600,
        "email": "v@example.org",
    }
    body.update(claims)
    return jwt.encode(body, key, algorithm=alg)


def test_valid_access_token_passes() -> None:
    AccessVerifier(TEAM, AUD, Keys())(_token())


@pytest.mark.parametrize(
    "token",
    [
        _token(aud=["autre-application"]),
        _token(iss="https://autre.cloudflareaccess.com"),
        _token(exp=int(time.time()) - 60),
        _token(key=OTHER),
        _token(key="s" * 64, alg="HS256"),
        "pas-un-jwt",
    ],
)
def test_invalid_tokens_are_refused(token: str) -> None:
    with pytest.raises(jwt.PyJWTError):
        AccessVerifier(TEAM, AUD, Keys())(token)


def test_default_keys_come_from_the_team_certs_url(monkeypatch: pytest.MonkeyPatch) -> None:
    # Le réseau est remplacé au niveau d'urllib, que PyJWKClient appelle : la page publiée par
    # Cloudflare sert la clé publique de KEY sous l'identifiant du jeton.
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(KEY.public_key()))
    jwks = json.dumps({"keys": [{**jwk, "kid": "k1", "alg": "RS256", "use": "sig"}]}).encode()
    asked: list[str] = []

    def serve(self: Any, request: urllib.request.Request, *args: Any, **kwargs: Any) -> Any:
        asked.append(request.full_url)
        return io.BytesIO(jwks)

    monkeypatch.setattr(urllib.request.OpenerDirector, "open", serve)
    token = jwt.encode(
        {"aud": [AUD], "iss": ISS, "exp": int(time.time()) + 600},
        KEY,
        algorithm="RS256",
        headers={"kid": "k1"},
    )
    AccessVerifier(TEAM, AUD)(token)
    assert asked == ["https://aube.cloudflareaccess.com/cdn-cgi/access/certs"]
