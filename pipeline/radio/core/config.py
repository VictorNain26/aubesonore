"""Configuration : secrets et chemins depuis .env, réglages éditoriaux depuis un TOML validé."""

import tomllib
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # env_ignore_empty : les clés laissées vides de .env.example valent leur défaut, pas "".
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    plex_url: str = "http://127.0.0.1:32400"
    # repr=False : exclure du repr, pas seulement masquer la valeur — le nom du champ
    # « plex_token » contient lui-même la sous-chaîne du secret dans les tests.
    plex_token: SecretStr | None = Field(default=None, repr=False)
    plex_music_section: str | None = None
    # Seule racine dont on accepte les chemins de section renvoyés par Plex.
    plex_music_root: Path = Path("/media/plex/Musique")
    lastfm_api_key: SecretStr | None = Field(default=None, repr=False)
    data_dir: Path = Field(default=REPO_ROOT / "data", validation_alias="RADIO_DATA_DIR")
    # Copie quotidienne de la base, sur un autre disque physique que data_dir.
    backup_dir: Path | None = Field(default=None, validation_alias="RADIO_BACKUP_DIR")
    config_dir: Path = Field(default=REPO_ROOT / "config", validation_alias="RADIO_CONFIG_DIR")
    effnet_model: Path = Field(
        default=REPO_ROOT / "models" / "discogs-effnet-bs64-1.pb",
        validation_alias="RADIO_EFFNET_MODEL",
    )
    # Modèles MTG des mesures d'antenne (radio/signals/features.py), à côté de l'EffNet.
    models_dir: Path = Field(default=REPO_ROOT / "models", validation_alias="RADIO_MODELS_DIR")
    # Dossier média de la station AzuraCast, lu par `radio mesures`, jamais écrit.
    azuracast_media_dir: Path = Field(
        default=REPO_ROOT.parent / "azuracast" / "stations" / "aubesonore" / "media",
        validation_alias="AZURACAST_MEDIA_DIR",
    )
    votes_host: str = Field(default="127.0.0.1", validation_alias="RADIO_VOTES_HOST")
    votes_port: int = Field(default=8040, validation_alias="RADIO_VOTES_PORT")
    votes_url: str | None = Field(default=None, validation_alias="RADIO_VOTES_URL")
    cf_access_team_domain: str | None = Field(
        default=None, pattern=r"^[a-z0-9-]+\.cloudflareaccess\.com$"
    )
    cf_access_aud: str | None = None
    # Compte Soulseek propre à la radio : celui de slskd l'éjecterait, et les deux Lidarr avec.
    soulseek_user: str | None = None
    soulseek_password: SecretStr | None = Field(default=None, repr=False)
    # Config Sockseek (mot de passe) sur tmpfs : le `RuntimeDirectory=` de l'unité systemd,
    # supprimé à l'arrêt du service même tué ; à la main, le `$XDG_RUNTIME_DIR` de la session.
    runtime_dir: Path | None = Field(
        default=None, validation_alias=AliasChoices("RUNTIME_DIRECTORY", "XDG_RUNTIME_DIR")
    )
    azuracast_url: str = "http://127.0.0.1:8080"
    azuracast_api_key: SecretStr | None = Field(default=None, repr=False)
    azuracast_station_id: int = 1
    sockseek_bin: Path = Path("~/.local/bin/sockseek").expanduser()
    rsgain_bin: Path = Path("~/.local/bin/rsgain").expanduser()
    # Le numéro est une donnée personnelle : masqué comme un secret.
    whatsapp_phone: SecretStr | None = Field(default=None, repr=False)
    callmebot_apikey: SecretStr | None = Field(default=None, repr=False)


class LibraryConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    duration_tolerance_s: int = Field(default=3, ge=0, le=10)


class DiscoverConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seeds_per_run: int = Field(default=15, ge=1, le=200)
    seed_cooldown_days: int = Field(default=30, ge=0, le=365)
    tracks_per_neighbour: int = Field(default=10, ge=1, le=100)
    lastfm_similar_limit: int = Field(default=100, ge=1, le=250)


class FreshConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    hypem_pages: int = Field(default=3, ge=0, le=5)
    deezer_editorial: dict[str, int] = Field(
        default_factory=lambda: {"alternative": 85, "electro": 106}
    )
    tracks_per_album: int = Field(default=3, ge=1, le=20)
    hypem_favorites_user: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,64}$")


class ModelConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    c: float = Field(default=0.1, gt=0)
    weak_weight: float = Field(default=0.1, ge=0, le=1)
    keep_decouvertes: int = Field(default=80, ge=1)
    keep_nouveautes: int = Field(default=80, ge=1)
    exam_window: int = Field(default=60, ge=10, le=1000)

    @property
    def keep(self) -> dict[str, int]:
        return {"decouvertes": self.keep_decouvertes, "nouveautes": self.keep_nouveautes}


class AcquisitionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_per_pass: int = Field(default=160, ge=1, le=5000)
    max_attempts: int = Field(default=3, ge=1, le=20)
    min_mp3_kbps: int = Field(default=200, ge=96, le=320)
    identity_threshold: float = Field(default=0.70, gt=0.5, lt=1)
    searches_per_time: int = Field(default=10, ge=1, le=34)
    searches_renew_s: int = Field(default=220, ge=60)
    min_success_rate: float = Field(default=0.2, ge=0, le=1)
    min_attempts_for_rate: int = Field(default=20, ge=1)


class AntenneConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stay_weeks: int = Field(default=6, ge=1)
    rest_weeks: int = Field(default=12, ge=1)
    life_weeks: int = Field(default=78, ge=1)
    promotion_share: float = Field(default=0.12, ge=0, le=1)


Categorie = Literal["nouveautes", "decouvertes", "fond", "reperes"]


class Creneau(BaseModel):
    model_config = ConfigDict(extra="forbid")
    part: float = Field(gt=0, le=1)
    passages: float = Field(gt=0)


_GRILLE: dict[Categorie, Creneau] = {
    "nouveautes": Creneau(part=1 / 3, passages=2),
    "decouvertes": Creneau(part=1 / 3, passages=2),
    "fond": Creneau(part=1 / 6, passages=1),
    "reperes": Creneau(part=1 / 6, passages=1),
}


Bloc = Literal["matin", "apres_midi", "soir", "nuit", "fin_de_nuit", "fete"]


class Cible(BaseModel):
    """Cible d'un bloc horaire, en quantiles des titres à l'antenne (0 à 1)."""

    model_config = ConfigDict(extra="forbid")
    energie: float = Field(ge=0, le=1)
    dansabilite: float = Field(ge=0, le=1)
    tempo: float = Field(ge=0, le=1)


_CIBLES: dict[Bloc, Cible] = {
    "matin": Cible(energie=0.6, dansabilite=0.45, tempo=0.4),
    "apres_midi": Cible(energie=0.55, dansabilite=0.5, tempo=0.6),
    "soir": Cible(energie=0.6, dansabilite=0.65, tempo=0.7),
    "nuit": Cible(energie=0.25, dansabilite=0.3, tempo=0.25),
    "fin_de_nuit": Cible(energie=0.35, dansabilite=0.3, tempo=0.3),
    "fete": Cible(energie=0.75, dansabilite=0.85, tempo=0.75),
}


class GrilleConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    titres_par_heure: float = Field(default=14.6, gt=0)
    marge: float = Field(default=1.4, ge=1)
    retard: float = Field(default=0.5, ge=0)
    repos: float = Field(default=0.6, ge=0, lt=1)
    separation_h: float = Field(default=3, ge=0, le=24)
    avantage: float = Field(default=1.5, gt=1)
    force: float = Field(default=2.0, gt=1)
    style: float = Field(default=1.0, ge=0)

    @model_validator(mode="after")
    def _starvation_window(self) -> "GrilleConfig":
        if self.force <= self.avantage:
            raise ValueError("le passage forcé vient après l'avantage")
        return self

    cibles: dict[Bloc, Cible] = Field(default_factory=lambda: dict(_CIBLES))
    categories: dict[Categorie, Creneau] = Field(default_factory=lambda: dict(_GRILLE))

    @model_validator(mode="after")
    def _parts_cover_the_hour(self) -> "GrilleConfig":
        if set(self.categories) != {"nouveautes", "decouvertes", "fond", "reperes"}:
            raise ValueError("la grille nomme les quatre catégories")
        if abs(sum(c.part for c in self.categories.values()) - 1) > 0.01:
            raise ValueError("les parts de la grille font 1")
        return self

    def stock(self, categorie: Categorie) -> int:
        """Titres à l'antenne pour que chacun revienne `passages` fois par semaine."""
        c = self.categories[categorie]
        return round(c.part * self.titres_par_heure * 168 / c.passages)


class VotesConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    exam_per_selection: int = Field(default=10, ge=1, le=100)
    lesson_per_selection: int = Field(default=10, ge=0, le=100)
    quiet_days: int = Field(default=7, ge=1, le=60)


class BackupConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    keep_days: int = Field(default=14, ge=1)


class Editorial(BaseModel):
    model_config = ConfigDict(extra="forbid")
    library: LibraryConfig = LibraryConfig()
    discover: DiscoverConfig = DiscoverConfig()
    nouveautes: FreshConfig = FreshConfig()
    model: ModelConfig = ModelConfig()
    acquisition: AcquisitionConfig = AcquisitionConfig()
    antenne: AntenneConfig = AntenneConfig()
    grille: GrilleConfig = GrilleConfig()
    votes: VotesConfig = VotesConfig()
    backup: BackupConfig = BackupConfig()


def load_editorial(path: Path) -> Editorial:
    with path.open("rb") as f:
        return Editorial.model_validate(tomllib.load(f))
