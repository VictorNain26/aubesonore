import time

import pytest
import responses
import stamina
from responses import matchers

from radio.sources.hypem import (
    API,
    FAVORITES_PAGE,
    USER_AGENT,
    HypemClient,
    HypemError,
    HypemNotFound,
    HypemTrack,
    HypemUnavailable,
)

POPULAR = f"{API}/popular"
FAVORITES = f"{API}/users/victor/favorites"


def item(n: int = 0, **over: object) -> dict[str, object]:
    base: dict[str, object] = {
        "artist": f"Artiste {n}",
        "title": f"Titre {n}",
        "time": 200 + n,
        "sitename": "THE VINYL VILLAIN",
    }
    base.update(over)
    return base


@responses.activate
def test_popular_parses_tracks_and_names_us() -> None:
    # Une requête sans ce classement, cette page ou notre User-Agent n'a pas de réponse.
    responses.get(
        POPULAR,
        json=[item()],
        match=[
            matchers.query_param_matcher({"mode": "lastweek", "page": "2"}),
            matchers.header_matcher({"User-Agent": USER_AGENT}),
        ],
    )
    got = HypemClient().popular("lastweek", 2)
    assert got == [HypemTrack("Artiste 0", "Titre 0", 200, "THE VINYL VILLAIN")]


@responses.activate
def test_favorites_stop_on_a_short_page() -> None:
    responses.get(FAVORITES, json=[item(i) for i in range(FAVORITES_PAGE)])
    responses.get(FAVORITES, json=[item(99)])
    got = HypemClient().favorites("victor")
    assert len(got) == FAVORITES_PAGE + 1


@responses.activate
def test_favorites_stop_on_a_404_past_the_last_page() -> None:
    responses.get(FAVORITES, json=[item(i) for i in range(FAVORITES_PAGE)])
    responses.get(FAVORITES, status=404)
    assert len(HypemClient().favorites("victor")) == FAVORITES_PAGE


@responses.activate
def test_favorites_of_an_unknown_user_is_an_error() -> None:
    responses.get(FAVORITES, status=404)
    with pytest.raises(HypemNotFound):
        HypemClient().favorites("victor")


@responses.activate
@pytest.mark.parametrize(
    "body",
    [{"error": "changed"}, [{"artist": "A", "title": "T", "time": "?", "sitename": "S"}], [{}]],
)
def test_an_unexpected_shape_is_an_error_never_an_empty_list(body: object) -> None:
    responses.get(POPULAR, json=body)
    with pytest.raises(HypemError):
        HypemClient().popular("lastweek", 1)


@responses.activate
def test_a_server_error_is_tried_three_times_then_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Les vraies relances du client, pas celles du mode test de stamina (conftest), sans attendre.
    monkeypatch.setattr(time, "sleep", lambda _: None)
    stamina.set_testing(False)
    responses.get(POPULAR, status=503)
    with pytest.raises(HypemUnavailable):
        HypemClient().popular("lastweek", 1)
    assert len(responses.calls) == 3


@responses.activate
def test_a_refusal_is_not_retried() -> None:
    responses.get(POPULAR, status=403)
    with pytest.raises(HypemError):
        HypemClient().popular("lastweek", 1)
    assert len(responses.calls) == 1


@responses.activate
def test_html_instead_of_json_is_a_passing_outage() -> None:
    responses.get(POPULAR, body="<html>proxy</html>", status=200)
    with pytest.raises(HypemUnavailable):
        HypemClient().popular("lastweek", 1)
