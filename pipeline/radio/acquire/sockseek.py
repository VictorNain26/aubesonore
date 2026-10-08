"""Téléchargement Soulseek par Sockseek 3.0.5 (docs/vision.md §5).

Sockseek fait la recherche, le classement, le téléchargement et la limite de rythme ; ici, on ne
fait que lui passer la liste et lire son index. Les fichiers sont nommés par l'id Deezer
(`--name-format {uri}`, colonne URI du CSV). Codes d'état et d'échec de l'index :
`Sockseek.Core/Common/Enums.cs` (JobStateOld, JobFailureReason) au tag v3.0.5. Codes de sortie
(`Sockseek.Cli/Program.cs`, CliExitCode) : 0 tout réussi, 1 au moins un échec, 2 erreur d'usage,
130 annulé. L'index est réécrit à chaque titre terminé (`M3uEditor.Update`) : sans index, aucun
titre n'a été tenté (connexion refusée, compte banni).
"""

import csv
import logging
import math
import os
import subprocess
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from radio.core.config import AcquisitionConfig

logger = logging.getLogger(__name__)

_DONE, _ALREADY = 1, 3
_RAN = (0, 1)
_REASONS = {
    1: "recherche invalide",
    2: "essais de téléchargement épuisés",
    4: "téléchargements échoués",
    5: "autre",
    6: "extraction échouée",
    7: "annulé",
    9: "aucun résultat",
    10: "aucun fichier conforme",
}


class SockseekError(Exception):
    """Sockseek n'a rien tenté de fiable : aucune issue n'est enregistrée."""


@dataclass(frozen=True)
class Wanted:
    deezer_track_id: int
    artist: str
    title: str
    duration_s: int


@dataclass(frozen=True)
class Outcome:
    deezer_track_id: int
    file: Path | None
    reason: str | None  # None si `file` est présent


Runner = Callable[[Sequence[str], float, Path], int]


def run_command(args: Sequence[str], timeout: float, log: Path) -> int:
    # Sa sortie détaille chaque tentative (779 des 822 lignes du journal de la passe du
    # 2026-10-04) ; l'issue de chaque titre est déjà en base et résumée dans le rapport.
    with log.open("w", encoding="utf-8") as out:
        return subprocess.run(
            args, stdout=out, stderr=subprocess.STDOUT, check=False, timeout=timeout
        ).returncode


def time_limit(n_wanted: int, cfg: AcquisitionConfig) -> float:
    """Deux fois le temps que le rythme de recherche impose à la liste, plus une demi-heure pour
    les derniers téléchargements : au-delà, Sockseek est bloqué, et sans limite il gèlerait la
    passe jusqu'à son délai de 12 h."""
    windows = math.ceil(n_wanted / cfg.searches_per_time)
    return 2.0 * windows * cfg.searches_renew_s + 1800.0


def _write_config(path: Path, user: str, password: str) -> None:
    # Le mot de passe n'apparaît jamais dans la ligne de commande (visible par `ps`).
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(f"username = {user}\npassword = {password}\n")


def download(
    wanted: list[Wanted],
    workdir: Path,
    conf_dir: Path,
    binary: Path,
    user: str,
    password: str,
    cfg: AcquisitionConfig,
    run: Runner = run_command,
) -> list[Outcome]:
    listing = workdir / "retenus.csv"
    with listing.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Artist", "Title", "Length", "URI"])
        w.writerows([t.artist, t.title, t.duration_s, t.deezer_track_id] for t in wanted)
    conf = conf_dir / "sockseek.conf"
    _write_config(conf, user, password)
    limit = time_limit(len(wanted), cfg)
    # À côté du dossier de la passe, qui est supprimé : la sortie de la dernière passe reste.
    log = workdir.parent / "sockseek.log"
    code: int | None
    try:
        code = run(
            [
                str(binary),
                str(listing),
                "--config",
                str(conf),
                "--output-dir",
                str(workdir),
                "--name-format",
                "{uri}",
                "--format",
                "mp3,flac",
                "--pref-format",
                "mp3",
                "--length-tol",
                "3",
                "--concurrent-searches",
                "1",
                "--searches-per-time",
                str(cfg.searches_per_time),
                "--searches-renew-time",
                str(cfg.searches_renew_s),
            ],
            limit,
            log,
        )
    except subprocess.TimeoutExpired:
        # subprocess.run l'a tué : l'index, réécrit à chaque titre terminé, dit ce qui est fait ;
        # les titres absents de l'index ne sont pas tentés et reviennent à la passe suivante.
        logger.warning("Sockseek arrêté au délai de %.0f s, les titres terminés sont gardés", limit)
        code = None
    finally:
        conf.unlink()
    logger.info("sortie de Sockseek : %s", log)
    if code is not None and code not in _RAN:
        raise SockseekError(f"code de sortie {code}")
    index = workdir / "retenus" / "_index.csv"
    if not index.exists():
        raise SockseekError("aucun index écrit, aucun titre tenté (connexion ou compte refusé ?)")
    return read_index(index, wanted)


def read_index(index: Path, wanted: list[Wanted]) -> list[Outcome]:
    """Les issues des titres terminés, dans l'ordre de l'index. Un titre absent de l'index n'a
    pas été tenté (Sockseek interrompu) : il n'a pas d'issue."""
    by_key = {(t.artist, t.title, t.duration_s): t.deezer_track_id for t in wanted}
    found: dict[int, Outcome] = {}
    with index.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            tid = by_key.get((row["artist"], row["title"], int(row["length"])))
            if tid is None:
                continue
            state = int(row["state"])
            if state in (_DONE, _ALREADY) and row["filepath"]:
                found[tid] = Outcome(tid, Path(row["filepath"]), None)
            else:
                reason = _REASONS.get(int(row["failurereason"]), f"état {state}")
                found[tid] = Outcome(tid, None, reason)
    return list(found.values())
