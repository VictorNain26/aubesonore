import pytest
import stamina


@pytest.fixture(autouse=True)
def _stamina_testing() -> None:
    # Relances sans attente dans les tests.
    stamina.set_testing(True, attempts=3)


@pytest.fixture(autouse=True)
def _never_the_real_data(
    tmp_path_factory: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Les tests tournent aussi depuis le checkout de production (~/aubesonore/pipeline) : sans cette
    # garde, un test qui construit ses Settings sans dossier de données écrirait dans la vraie
    # base (2026-10-01 : une fausse ligne de rapport « library-sync » en échec).
    monkeypatch.setenv("RADIO_DATA_DIR", str(tmp_path_factory.mktemp("data")))
