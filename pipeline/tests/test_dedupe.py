import pytest

from radio.library.dedupe import dedupe_key


@pytest.mark.parametrize(
    "title",
    [
        "Song",
        "Song (Remastered 2011)",
        "Song - Remastered 2011",
        "Song [Radio Edit]",
        "Song - Radio Edit",
        "Song - 2011 Version",
        "Song (Live)",
    ],
)
def test_versions_collapse(title: str) -> None:
    assert dedupe_key("The Band", title) == dedupe_key("Band", "Song")


def test_other_suffixes_stay_distinct() -> None:
    assert dedupe_key("Band", "Song - Live at Leeds") != dedupe_key("Band", "Song")
    assert dedupe_key("Band", "Editions") == "band|editions"


def test_title_made_only_of_brackets_keeps_its_words() -> None:
    assert dedupe_key("A", "(Interlude)") != dedupe_key("A", "(Outro)")
