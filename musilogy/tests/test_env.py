from musilogy.paths import REPO_ROOT


def test_the_code_is_mit_and_the_data_rests_on_cc0_sources_only():
    # The code and the produced data are under different terms. MusicBrainz's
    # genres and tags (CC BY-NC-SA) are no longer read: no non-commercial or
    # share-alike clause binds the data any more.
    assert (REPO_ROOT / "LICENSE").read_text(encoding="utf-8").startswith("MIT License")
    data = (REPO_ROOT / "LICENSE-DATA").read_text(encoding="utf-8")
    assert "CC0" in data
    assert "BY-NC" not in data
    assert "NC-SA" not in data
