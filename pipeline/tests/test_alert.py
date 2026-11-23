import smtplib
from email.message import EmailMessage
from pathlib import Path

import pytest
from typer.testing import CliRunner

import radio.commandes as commandes
from radio.socle.config import Settings

runner = CliRunner()
PASSWORD = "mot-de-passe-du-relais"


class FakeRelay:
    """Le relais SMTP vu de l'autre côté de la connexion : ce qu'il reçoit, dans l'ordre."""

    def __init__(self, fail: bool = False) -> None:
        self.events: list[str] = []
        self.sent: list[EmailMessage] = []
        self.fail = fail

    def client(self, implicit_tls: bool) -> type:
        relay = self

        class Client:
            def __init__(self, host: str, port: int, **_: object) -> None:
                relay.events.append(f"{'tls' if implicit_tls else 'clair'} {host}:{port}")

            def __enter__(self) -> "Client":
                return self

            def __exit__(self, *_: object) -> None:
                relay.events.append("quit")

            def starttls(self, **_: object) -> None:
                relay.events.append("starttls")

            def login(self, user: str, password: str) -> None:
                if relay.fail:
                    raise smtplib.SMTPAuthenticationError(535, b"5.7.8 Authentication failed")
                relay.events.append(f"login {user}")

            def send_message(self, msg: EmailMessage) -> None:
                relay.events.append("send")
                relay.sent.append(msg)

        return Client


@pytest.fixture
def relay(monkeypatch: pytest.MonkeyPatch) -> FakeRelay:
    r = FakeRelay()
    monkeypatch.setattr(smtplib, "SMTP", r.client(implicit_tls=False))
    monkeypatch.setattr(smtplib, "SMTP_SSL", r.client(implicit_tls=True))
    return r


LEAK = "api_key=cle-secrete-du-journal"


@pytest.fixture(autouse=True)
def journal(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # Un faux journalctl en tête du PATH, dont la ligne porte un secret, comme une erreur qui
    # écrirait l'URL qu'elle appelait : le courriel ne doit rien en montrer.
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake = bin_dir / "journalctl"
    fake.write_text(f'#!/bin/sh\necho "discover : GET https://ws.example.test/?{LEAK} 503"\n')
    fake.chmod(0o755)
    monkeypatch.setenv("PATH", f"{bin_dir}:/usr/bin:/bin")


def _settings(monkeypatch: pytest.MonkeyPatch, **smtp: object) -> None:
    settings = Settings(_env_file=None, **smtp)
    monkeypatch.setattr(commandes.commun, "_settings", lambda: settings)


SMTP = {
    "smtp_host": "smtp.example.test",
    "smtp_user": "relais",
    "smtp_password": PASSWORD,
    "smtp_from": "Radio <radio@example.test>",
    "alert_email_to": "proprietaire@example.test",
}


@pytest.mark.parametrize(
    ("port", "connection"),
    [
        # STARTTLS avant le login : le mot de passe ne passe jamais en clair.
        (587, ["clair smtp.example.test:587", "starttls"]),
        (465, ["tls smtp.example.test:465"]),
    ],
)
def test_alert_mails_the_failed_unit_and_nothing_of_its_journal(
    relay: FakeRelay, monkeypatch: pytest.MonkeyPatch, port: int, connection: list[str]
) -> None:
    _settings(monkeypatch, **SMTP, smtp_port=port)

    result = runner.invoke(commandes.app, ["alerte", "radio-passe.service"])

    assert result.exit_code == 0, result.output
    assert relay.events == [*connection, "login relais", "send", "quit"]
    [msg] = relay.sent
    assert msg["To"] == "proprietaire@example.test"
    assert msg["From"] == "Radio <radio@example.test>"
    assert "radio-passe.service" in msg["Subject"]
    assert "journalctl --user -u radio-passe.service" in msg.get_content()
    for secret in (PASSWORD, LEAK):
        assert secret not in msg.as_string() and secret not in result.output


def test_an_unconfigured_alert_fails_and_names_what_is_missing(
    relay: FakeRelay, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Une alerte qui ne part pas sans le dire est la panne silencieuse qu'elle doit éviter :
    # l'unité d'alerte échoue à son tour, visible dans `systemctl --user list-units --failed`.
    _settings(monkeypatch, smtp_host="smtp.example.test")

    result = runner.invoke(commandes.app, ["alerte", "radio-passe.service"])

    assert result.exit_code == 2
    assert "SMTP_FROM" in result.output and "ALERT_EMAIL_TO" in result.output
    assert "SMTP_HOST" not in result.output
    assert relay.events == []


def test_a_refused_alert_fails_without_leaking_the_password(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    refusing = FakeRelay(fail=True)
    monkeypatch.setattr(smtplib, "SMTP", refusing.client(implicit_tls=False))
    _settings(monkeypatch, **SMTP)

    result = runner.invoke(commandes.app, ["alerte", "radio-passe.service"])

    assert result.exit_code == 1
    assert "radio-passe.service" in result.output and "535" in result.output
    assert PASSWORD not in result.output
    assert refusing.sent == []
