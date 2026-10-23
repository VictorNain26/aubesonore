# Acquisition, publication et observabilité — recherches du 2026-09-30

Quatre études en lecture seule (code et documentation des versions installées, API GitHub pour
la maintenance), et une mesure. Toutes les sources ont été consultées le 2026-09-30. Ces études
fondent les choix de `docs/conception.md` §5 à §8.

## 1. Acquisition Soulseek

**Outils existants** (maintenance vérifiée avec `gh api`) :

| Outil | État | Verdict |
|---|---|---|
| sldl / slsk-batchdl, renommé **Sockseek** en v3 ([fiso64/slsk-batchdl](https://github.com/fiso64/slsk-batchdl)) | 1 104 ★, v3.0.5 du 2026-08-10, commit du 2026-09-29, issues traitées | **Retenu** |
| Soularr (mrusse/soularr) | v1.2.2 du 2026-04-28 | Travaille par album, à partir de la liste « wanted » de Lidarr |
| SoulSync (Nezreka/SoulSync) | 3.4.8 du 2026-09-29 | Plateforme complète (musique, films, YouTube) : usine à gaz |
| soulbeet (terry90/soulbeet) | v0.6.1 du 2026-07-21 | Application web plus beets, disproportionnée |
| slskd-api (bigoulours/slskd-python-api) | 43 ★ | Pas d'endpoint `batches` : impossible de choisir le dossier de destination |

Ce que fait Sockseek (README du dépôt) :

- En entrée, un CSV Artist, Title, Length.
- `--format mp3,flac --pref-format mp3` ; tolérance de durée de ±3 s par défaut.
- Limiteur de recherches (`--searches-per-time`, `--searches-renew-time`) : le serveur Soulseek
  bannit 30 min en cas de rafale.
- En sortie, `_index.csv` (`state`, `failure-reason`), sans retenter ce qui a déjà réussi.
- Hook `on-complete`.

**Limites de Sockseek :**

- Sockseek ouvre **sa propre session Soulseek** et ne passe pas par slskd. Avec le compte de
  slskd, il l'éjecterait. Or slskd ne relance pas sa reconnexion après « another client logged
  in » (`src/slskd/Application.cs:985-988` @0.26.0), ce qui couperait les deux Lidarr. **Il faut
  donc un second compte Soulseek.**
- Un fichier au débit inconnu passe les filtres. Le contrôle après téléchargement est donc
  obligatoire.

**Cohabitation avec slskd 0.26.0.** Le plugin Slskd de Lidarr ignore les lots qu'il n'a pas créés
(`SlskdProxy.cs:126-131`). En revanche, partager slskd ferait aussi partager le verrou 429 des
recherches, le bug [#1819](https://github.com/slskd/slskd/issues/1819) (toujours ouvert) et la
purge à 7 jours. Un second compte isole la radio.

**yt-dlp en secours : écarté.** La source est déjà compressée avec perte, et le premier résultat
de `ytsearch:` n'est pas fiable (clips, versions live).

## 2. Vérifier l'identité d'un fichier (mesure)

Échantillon : 60 MP3 de l'ancienne antenne, dont 38 retrouvés strictement sur Deezer. Scripts et
résultats : scratchpad `mesure-identite/`.

| Méthode | Même morceau (min / p5) | Autre titre du même artiste (max) | Erreurs au meilleur seuil |
|---|---|---|---|
| EffNet, fichier entier contre extrait | 0,671 / 0,785 | 0,886 | 5,3 % refusés à tort, 7,5 % acceptés à tort |
| EffNet, meilleure fenêtre de 30 s | 0,721 / 0,827 | 0,900 | 5,3 % refusés à tort, 3,7 % acceptés à tort |
| **Chromaprint local** (`fpcalc -raw`, fichier contre extrait) | **0,819 / 0,904** | 0,604 (1) | **0 / 38 et 0 / 1 406 au seuil 0,70** |

(1) Hors la version courte d'un même enregistrement, que le contrôle de durée écarte déjà.

- **La durée seule ne suffit pas.** Pour 18 fichiers sur 38, un autre titre du même artiste
  tombe dans ±3 s.
- **Coût CPU.** Chromaprint prend environ 0,6 s par fichier, contre 9,8 s pour EffNet sur le
  fichier entier.
- **Méthode.** Taux de bits identiques au meilleur décalage. On retire 16 trames à chaque bout
  de l'extrait, à cause des fondus.
- **AcoustID n'est pas nécessaire.** Il demande une clé et un quota de 3 requêtes/s, sa
  couverture de l'indie de niche est incertaine, et il répond en identifiants MusicBrainz qu'il
  faudrait ensuite relier à Deezer. L'extrait Deezer est déjà la référence.

**Limites de la mesure :**

- 38 positifs seulement, et pas de vrais fichiers Soulseek.
- Remasters et versions mono non couverts.

## 3. Publication sur AzuraCast 0.23.8 (Liquidsoap 2.4.5)

Sources :

- code au commit `62a30e5` : [AzuraCast/AzuraCast](https://github.com/AzuraCast/AzuraCast) ;
- spécification locale `http://localhost:8080/api/openapi.yml` ;
- fichier `stations/aubesonore/config/liquidsoap.liq`.

**Dépôt.** `POST /station/1/files` prend du JSON `{path, file}` avec le fichier en base64.

- La réponse porte `id` et `unique_id` sans attendre le scan (`FilesController.php:288-328`).
- Limite : 50 Mo par requête, soit environ 37 Mo de MP3 une fois encodé en base64.

**Dossier rattaché à une playlist.** La tâche `CheckFolderPlaylists` ajoute et retire les médias
du dossier toutes les 5 min (`CheckFolderPlaylistsTask.php`).

- Ces liens de dossier survivent aux opérations de playlist en lot
  (`StationPlaylistMediaRepository.php:61`).
- Doc : « they must be added to at least one playlist »
  (azuracast.com/docs/user-guide/media-management).

**Retrait.** `PUT /station/1/files/batch` avec `do=delete`. Il faut exclure la file de l'AutoDJ
(`GET /station/1/queue`) et le titre en cours : Liquidsoap prépare d'avance jusqu'à 3 requêtes
(`autodj_queue_length`).

**Ne jamais faire `PUT /file/{id}`.** Cet appel réécrit les tags du fichier avec
`remove_other_tags` (`FilesController.php:373`, issue #8586).

**Pas de ReplayGain dans les fichiers.** Liquidsoap le recalcule à chaque titre
(`replaygain.liq:56-113`, visible dans le journal). La doc juge ce calcul « very CPU-intensive »
et recommande de pré-taguer (azuracast.com/docs/help/optimizing).

- rsgain v3.8 du 2026-09-02 est maintenu ; loudgain n'a plus bougé depuis 2024.
- À noter : si AutoCue est activé, ReplayGain est coupé (`StationBackendConfiguration.php:181`).

**Métadonnées et origine :**

- Les champs personnalisés sont publics : ils apparaissent dans `/api/nowplaying`.
- L'origine d'un titre (découverte ou repère, id Deezer) reste donc dans la base du pipeline,
  indexée par `unique_id`.

**Priorités de diffusion.** Les playlists programmées passent devant les autres ; au sein d'une
même catégorie, le tirage est pondéré par `weight` (`QueueBuilder.php:105-151`). Une playlist de
base non programmée joue donc le secours de la future grille horaire.

**Pièges :**

- `avoid_duplicates` casse l'ordre d'une playlist séquentielle (`QueueBuilder.php:426-436`).
- Un import M3U ajoute à la fin de la playlist au lieu de la remplacer (`ImportAction.php`).
- Les Playlist Groups n'existent pas en 0.23.8.

## 4. Observabilité

| Outil | État | Sondes | Alertes | Configuration |
|---|---|---|---|---|
| **Gatus** ([TwiN/gatus](https://github.com/TwiN/gatus)) | 12,2 k ★, v5.37.0 du 2026-09-24 | HTTP avec conditions JSONPath, endpoints externes avec `heartbeat.interval` | `alerting.custom` (gabarits dans l'URL, sans encodage), seuils d'échec, rappel, notification de retour | **YAML versionné** |
| Uptime Kuma | 92 k ★, 2.5.5 | HTTP, JSON, push, Docker | CallMeBot natif | **Interface seulement** (issue #1354 ouverte) |
| Healthchecks | v4.4 | Push seulement | — | — |
| Webhooks AzuraCast | 0.23.8 | Hors ligne ou en ligne, seulement tant qu'AzuraCast tourne | — | — |

- **stack-notify.py** (~/mediaserver, 835 lignes) est du code maison dédié à la chaîne vidéo. Il
  n'expose aucun point HTTP pour recevoir un battement de cœur : on n'y branche pas la radio.
- **Échec d'une passe systemd.** `ExecStopPost=` s'exécute même si le service échoue et reçoit
  `$SERVICE_RESULT` (systemd 255, `systemd.service(5)`, `systemd.exec(5)`). Une ligne `curl` vers
  l'endpoint externe de Gatus suffit, et `heartbeat.interval` signale une passe qui n'a pas
  tourné du tout.
- **Métriques.** Pour une passe hebdomadaire, Prometheus et Grafana seraient disproportionnés.
  Un rapport de passe en SQLite, comparé à des seuils et poussé vers Gatus, suffit.
- **CI.** Le dépôt public a GitHub Actions gratuit.
  - `astral-sh/setup-uv` v10.2.0, avec cache sur `uv.lock` ; doc :
    docs.astral.sh/uv/guides/integration/github.
  - essentia-tensorflow publie une roue `cp312-manylinux_2_17_x86_64` (291 Mo), installable sur
    ubuntu-latest (24.04).
- **Dépendances.** Dependabot gère nativement `uv.lock` (`package-ecosystem: uv`,
  docs.astral.sh/uv/guides/integration/dependabot) et les actions GitHub.
- **Quota CallMeBot.** Environ 16 messages par 4 h, partagés avec stack-notify : il faut au
  moins 3 échecs avant d'alerter, et un rappel toutes les 24 h au plus.
