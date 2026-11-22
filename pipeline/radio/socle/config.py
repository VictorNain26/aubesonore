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
    # Poids MTG téléchargés (scripts/dev-setup.sh) : l'EffNet et les modèles des mesures
    # d'antenne (radio/mesures/musicnn.py). Les modèles entraînés sont dans trained_models_dir.
    models_dir: Path = Field(default=REPO_ROOT / "models", validation_alias="RADIO_MODELS_DIR")
    # Dossier média de la station AzuraCast, lu par `radio mesures`, jamais écrit.
    azuracast_media_dir: Path = Field(
        default=REPO_ROOT.parent / "azuracast" / "stations" / "aubesonore" / "media",
        validation_alias="AZURACAST_MEDIA_DIR",
    )
    votes_host: str = Field(default="127.0.0.1", validation_alias="RADIO_VOTES_HOST")
    votes_port: int = Field(default=8040, validation_alias="RADIO_VOTES_PORT")
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
    # Courriel d'alerte d'une unité en échec (`radio alerte`), par le relais SMTP du site.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: SecretStr | None = Field(default=None, repr=False)
    smtp_from: str | None = None
    alert_email_to: str | None = None

    @property
    def db_path(self) -> Path:
        return self.data_dir / "radio.db"

    @property
    def trained_models_dir(self) -> Path:
        """Les modèles que `gout` entraîne, à part des poids MTG de models_dir."""
        return self.data_dir / "models"

    @property
    def effnet_model(self) -> Path:
        return self.models_dir / "discogs-effnet-bs64-1.pb"


class BibliothequeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ecart_duree_s: int = Field(default=3, ge=0, le=10)


class DecouverteConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    graines_par_fournee: int = Field(default=15, ge=1, le=200)
    repos_graine_jours: int = Field(default=30, ge=0, le=365)
    titres_par_voisin: int = Field(default=10, ge=1, le=100)
    similaires_lastfm: int = Field(default=100, ge=1, le=250)


class NouveautesConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pages_hypem: int = Field(default=3, ge=0, le=5)
    deezer_editorial: dict[str, int] = Field(
        default_factory=lambda: {"alternative": 85, "electro": 106}
    )
    titres_par_album: int = Field(default=3, ge=1, le=20)
    compte_favoris_hypem: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,64}$")


class GoutConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    c: float = Field(default=0.1, gt=0)
    poids_negatifs_faibles: float = Field(default=0.1, ge=0, le=1)
    retenus_decouvertes: int = Field(default=80, ge=1)
    retenus_nouveautes: int = Field(default=80, ge=1)
    plancher_nouveautes: float = Field(default=0.0, ge=0, le=1)
    fenetre_examen: int = Field(default=60, ge=10, le=1000)

    @property
    def retenus(self) -> dict[str, int]:
        return {"decouvertes": self.retenus_decouvertes, "nouveautes": self.retenus_nouveautes}

    @property
    def planchers(self) -> dict[str, float]:
        return {"decouvertes": 0.0, "nouveautes": self.plancher_nouveautes}


class TelechargementConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_par_passe: int = Field(default=160, ge=1, le=5000)
    tentatives_max: int = Field(default=3, ge=1, le=20)
    debit_mp3_min_kbps: int = Field(default=200, ge=96, le=320)
    seuil_identite: float = Field(default=0.70, gt=0.5, lt=1)
    recherches_par_fenetre: int = Field(default=10, ge=1, le=34)
    fenetre_recherches_s: int = Field(default=220, ge=60)
    taux_reussite_min: float = Field(default=0.2, ge=0, le=1)
    tentatives_min_pour_taux: int = Field(default=20, ge=1)


class AntenneConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sejour_semaines: int = Field(default=6, ge=1)
    repos_semaines: int = Field(default=12, ge=1)
    vie_semaines: int = Field(default=78, ge=1)
    part_promue: float = Field(default=0.12, ge=0, le=1)


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
    ecart_min: float = Field(default=0.6, ge=0, lt=1)
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
    examen_par_tirage: int = Field(default=10, ge=1, le=100)
    lecon_par_tirage: int = Field(default=10, ge=0, le=100)
    jours_silence: int = Field(default=7, ge=1, le=60)


class SauvegardeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    jours_gardes: int = Field(default=14, ge=1)


class Editorial(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bibliotheque: BibliothequeConfig = BibliothequeConfig()
    decouverte: DecouverteConfig = DecouverteConfig()
    nouveautes: NouveautesConfig = NouveautesConfig()
    gout: GoutConfig = GoutConfig()
    telechargement: TelechargementConfig = TelechargementConfig()
    antenne: AntenneConfig = AntenneConfig()
    grille: GrilleConfig = GrilleConfig()
    votes: VotesConfig = VotesConfig()
    sauvegarde: SauvegardeConfig = SauvegardeConfig()


def load_editorial(path: Path) -> Editorial:
    with path.open("rb") as f:
        return Editorial.model_validate(tomllib.load(f))
