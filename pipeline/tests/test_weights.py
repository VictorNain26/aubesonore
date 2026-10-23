import math

import pytest

from radio.library.weights import WEIGHT_CAP, play_weight


def test_play_weight() -> None:
    assert play_weight(0) == 1.0
    assert play_weight(1) == pytest.approx(1 + math.log(2))
    assert play_weight(19) == pytest.approx(1 + math.log(20))
    assert play_weight(10_000) == WEIGHT_CAP == 4.0
