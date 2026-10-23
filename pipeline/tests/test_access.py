import time
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


def test_default_keys_come_from_the_team_certs_url() -> None:
    v = AccessVerifier(TEAM, AUD)
    assert v.issuer == ISS
    assert isinstance(v._keys, jwt.PyJWKClient)
    assert v._keys.uri == f"{ISS}/cdn-cgi/access/certs"
