import logging
import os
import stat
import subprocess
from collections.abc import Sequence
from pathlib import Path

import pytest

from radio.acquire.sockseek import SockseekError, Wanted, download, read_index, time_limit
from radio.core.config import AcquisitionConfig

WANTED = [
    Wanted(111, "A Certain Ratio", "Crystal", 173),
    Wanted(222, "Adrianne Lenker", "anything", 201),
    Wanted(333, "Nobody Here", "Missing Song", 200),
]


def _index(workdir: Path, rows: list[str]) -> None:
    # Format réel de Sockseek 3.0.5, relevé sur une exécution en --mock-files-dir.
    (workdir / "retenus").mkdir()
    (workdir / "retenus" / "_index.csv").write_text(
        "filepath,artist,album,title,length,tracktype,state,failurereason\n"
        + "".join(r + "\n" for r in rows)
    )


def test_download_passes_the_list_and_reads_the_index(tmp_path: Path) -> None:
    seen: dict[str, object] = {}

    def fake(args: Sequence[str], timeout: float) -> int:
        seen["args"] = list(args)
        conf = Path(args[args.index("--config") + 1])
        seen["conf_path"] = str(conf)
        seen["conf_mode"] = stat.S_IMODE(os.stat(conf).st_mode)
        seen["conf"] = conf.read_text()
        seen["csv"] = (tmp_path / "retenus.csv").read_text()
        (tmp_path / "111.mp3").write_bytes(b"x")
        _index(
            tmp_path,
            [
                f"{tmp_path}/111.mp3,A Certain Ratio,,Crystal,173,0,1,0",
                ",Adrianne Lenker,,anything,201,0,2,10",
            ],
        )
        return 1  # Sockseek sort en 1 dès qu'un titre échoue

    secrets = tmp_path / "run"
    secrets.mkdir()
    out = download(
        WANTED,
        tmp_path,
        secrets,
        Path("/bin/sockseek"),
        "radio",
        "s3cret",
        AcquisitionConfig(),
        fake,
    )

    # 333 n'a pas été tenté (Sockseek interrompu) : pas d'issue, donc aucune tentative comptée.
    assert [(o.deezer_track_id, o.file, o.reason) for o in out] == [
        (111, tmp_path / "111.mp3", None),
        (222, None, "aucun fichier conforme"),
    ]
    assert Path(str(seen["conf_path"])).parent == secrets
    assert seen["csv"] == (
        "Artist,Title,Length,URI\nA Certain Ratio,Crystal,173,111\n"
        "Adrianne Lenker,anything,201,222\nNobody Here,Missing Song,200,333\n"
    )
    assert seen["conf"] == "username = radio\npassword = s3cret\n"
    assert seen["conf_mode"] == 0o600
    assert not (secrets / "sockseek.conf").exists()
    args = seen["args"]
    assert isinstance(args, list) and "s3cret" not in " ".join(args)
    assert args[args.index("--name-format") + 1] == "{uri}"


def test_config_is_removed_even_if_sockseek_crashes(tmp_path: Path) -> None:
    def boom(args: Sequence[str], timeout: float) -> int:
        raise OSError("exec")

    with pytest.raises(OSError):
        download(WANTED, tmp_path, tmp_path, Path("/x"), "u", "p", AcquisitionConfig(), boom)
    assert not (tmp_path / "sockseek.conf").exists()


def test_no_index_is_a_sockseek_failure(tmp_path: Path) -> None:
    # Connexion refusée ou compte banni : Sockseek sort en 1 sans avoir écrit d'index.
    with pytest.raises(SockseekError, match="aucun index"):
        download(
            WANTED, tmp_path, tmp_path, Path("/x"), "u", "p", AcquisitionConfig(), lambda a, t: 1
        )


@pytest.mark.parametrize("code", [2, 130, -15])
def test_fatal_exit_code_is_a_sockseek_failure(tmp_path: Path, code: int) -> None:
    def run(args: Sequence[str], timeout: float) -> int:
        _index(tmp_path, [",A Certain Ratio,,Crystal,173,0,2,7"])
        return code

    with pytest.raises(SockseekError, match=f"code de sortie {code}"):
        download(WANTED, tmp_path, tmp_path, Path("/x"), "u", "p", AcquisitionConfig(), run)


def test_a_stuck_sockseek_is_stopped_and_its_finished_tracks_kept(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    seen: dict[str, float] = {}

    def stuck(args: Sequence[str], timeout: float) -> int:
        seen["timeout"] = timeout
        (tmp_path / "111.mp3").write_bytes(b"x")
        _index(tmp_path, [f"{tmp_path}/111.mp3,A Certain Ratio,,Crystal,173,0,1,0"])
        raise subprocess.TimeoutExpired(list(args), timeout)

    cfg = AcquisitionConfig()
    with caplog.at_level(logging.WARNING):
        out = download(WANTED, tmp_path, tmp_path, Path("/x"), "u", "p", cfg, stuck)

    assert seen["timeout"] == time_limit(len(WANTED), cfg)
    assert [o.deezer_track_id for o in out] == [111]
    assert "délai" in caplog.text
    assert not (tmp_path / "sockseek.conf").exists()


def test_time_limit_follows_the_search_pace() -> None:
    cfg = AcquisitionConfig(searches_per_time=10, searches_renew_s=220)
    # 160 titres : 16 fenêtres de 220 s, doublées, plus une demi-heure.
    assert time_limit(160, cfg) == 2 * 16 * 220 + 1800


def test_unknown_failure_code_is_named(tmp_path: Path) -> None:
    _index(tmp_path, [",A Certain Ratio,,Crystal,173,0,2,42"])
    out = read_index(tmp_path / "retenus" / "_index.csv", WANTED[:1])
    assert out[0].reason == "état 2"
