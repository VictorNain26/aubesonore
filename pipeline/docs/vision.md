# Pipeline d'antenne — conception

Seul document de conception et d'exploitation du pipeline. La vision produit et l'architecture
d'AubeSonore, au-dessus des quatre pièces, sont dans `docs/vision.md` à la racine du dépôt. Les preuves (mesures, sources datées)
sont dans `docs/recherches/`. Quand le système réel contredit ce document, le système a raison et
ce document se corrige.

État au 2026-10-01 : les étapes 1 à 7 tournent chaque semaine, la CI et Gatus surveillent, la
page de vote est en service. L'antenne ne diffuse plus que `antenne/` depuis la bascule (§7.2).

## 1. But

AubeSonore est une webradio de découverte dans la couleur de Victor : des titres qu'il ne connaît
pas, qu'il aurait pu choisir, enchaînés selon le moment de la journée.

**Critères de réussite**

- **Goût.** Taux de « oui » à l'aveugle sur les titres retenus, mesuré avec son intervalle de
  Wilson. L'horizon est 90 %, mais Victor ne se répète lui-même qu'à 85 % [64–95 %] : c'est le
  plafond (`recherches/2026-09-30-modele-audio-seul.md`).
- **Antenne.** Le flux ne s'arrête jamais et joue la bibliothèque d'antenne, pas le secours.
- **Renouvellement.** Chaque semaine, des découvertes entrent à l'antenne.

## 2. Principes

- **Plex est la seule vérité du goût, en lecture seule.** Section `Musique`, racine
  `/media/plex/Musique`. Jamais « Musique second wave ». Jamais le disque de Maël
  (`/media/musique`), pas même un `find`.
- **AzuraCast fait autorité sur l'antenne.** La base du pipeline s'y réaligne. Un média inconnu
  du pipeline est signalé, jamais supprimé.
- **Rien d'inventé.** Un outil existant, maintenu et vérifié le jour du choix, plutôt que du code
  maison. Le code du pipeline n'est que la colle entre ces outils.
- **Un repli silencieux est pire qu'une panne.** Tout ce qui est sauté est compté et nommé dans
  le rapport de passe.
- **Tout se mesure.** Un signal ou un mécanisme qui ne prouve pas son utilité est retiré.
- **Aucun secret** dans les journaux, les exceptions, les tests ou les commits : jeton Plex, clés
  Last.fm, CallMeBot et Soulseek, URL d'extraits Deezer signées.

## 3. La chaîne

```
Plex ─► 1 bibliothèque ─► 2 découverte ─► 3 empreinte ─► 4 goût ─► 5 acquisition
                                                           ▲             │
                                              votes ───────┘             ▼
                                                            6 préparation ─► 7 antenne ─► AzuraCast
```

Une passe hebdomadaire enchaîne les étapes. Chacune écrit ses compteurs dans le rapport de passe
(§8.1) et s'arrête proprement si une source tombe : le travail fait est gardé et la passe
suivante reprend.

| Étape | Rôle | Outils | État |
|---|---|---|---|
| 1 Bibliothèque | Lire Plex, rapprocher chaque titre de Deezer (strict : artiste, titre, durée ±3 s ; un seul des artistes d'un crédit « A & B » ou « A, B » suffit, jamais sur « and ») | python-plexapi, API Deezer | fait |
| 2 Découverte | 15 graines par semaine, tirées selon l'écoute ; voisins confirmés par Deezer `related` ET Last.fm `getSimilar` (`recherches/2026-09-24-sources-decouverte.md`) ; 10 titres par voisin. Un voisin sans titre est sauté et nommé. Une source qui répond vide partout est indisponible, d'après les taux mesurés le 2026-10-04 : aucun artiste relié pour aucune graine (9,5 % des artistes de la bibliothèque n'en ont pas sur Deezer), aucun similaire pour aucune graine (2 % sur Last.fm), aucun titre pour aucun voisin (1 artiste relié sur 1 809) ; l'étape échoue alors et garde ses graines (le 2026-10-04, 126 voisins vides étaient passés pour une découverte sans résultat) | API Deezer, Last.fm | fait |
| 2b Nouveautés | Titres récents choisis par des humains, ajoutés à la fournée (§3.1) | API Hype Machine v2, API Deezer | en service |
| 2c Favoris | Les favoris Hype Machine de Victor : plus des découvertes, et mesure du goût (§3.2) | API Hype Machine v2, API Deezer | en service |
| 3 Empreinte | Empreinte Discogs-EffNet de l'extrait Deezer de 30 s | essentia-tensorflow, modèle MTG épinglé | fait |
| 4 Goût | Régression logistique sur l'empreinte ; chaque fournée est classée par famille (découvertes, nouveautés) et les mieux notés de chacune sont retenus | scikit-learn | fait |
| 5 Acquisition | Télécharger les retenus en MP3 et prouver l'identité de chaque fichier | Sockseek, ffprobe, fpcalc | en service |
| 6 Préparation | FLAC → V0, ReplayGain, balises | ffmpeg, rsgain | en service |
| 7 Antenne | Tenir la bibliothèque d'antenne et la publier sur AzuraCast | API AzuraCast | en service |
| 8 Enchaînement | Fil qui dérive selon une grille 7 × 24 h | Essentia (MusiCNN, DEAM, TempoCNN), AzuraCast | fait (§7.3) |

### 3.1 Sources et nouveautés

La qualité des sources fait celle de l'antenne : le modèle trie, il n'invente rien. Deux
familles de sources alimentent chaque fournée, et chaque candidat garde la sienne
(`candidates.source`, avec le blog ou le genre dans `detail`) :

- **Voisins** (découverte) : voisins confirmés de tes artistes, leurs titres les plus écoutés.
- **Nouveautés** : des titres récents choisis par des humains, pour un mélange de découverte et
  de nouveauté (décision de Victor, 2026-10-01).
  - **Hype Machine**, classement « lastweek » des blogs (`hypem_pages`), retrouvé sur Deezer
    par la règle stricte de la bibliothèque. L'API v2 n'a pas de documentation publique et
    `api.hypem.com/robots.txt` refuse les robots : usage choisi en connaissance de cause, à
    quelques requêtes par semaine, User-Agent identifié ; une réponse hors format est une
    source sautée et nommée, jamais une liste vide.
  - **Sélections éditoriales Deezer** (`/editorial/{genre}/selection`), genres
    `deezer_editorial` (depuis le 2026-10-02 : alternative, electro, dance, jazz, classique,
    rock, folk, blues et brésilienne, choisis sur les notes du modèle ; pop, rap, R&B,
    asiatique et soul & funk à l'essai, goûts de Victor ; `recherches/2026-10-02-cycle-de-vie.md`
    §9), les `tracks_per_album` titres les plus écoutés de chaque album. Le modèle trie titre
    par titre : la K-pop ou le rap grand public d'une sélection ne passent pas la coupure.
    Deezer exclut la musique générée par IA de ses playlists éditoriales (page « AI-generated
    music labelling », consultée le 2026-10-01).
  - Écartés : les « dernières sorties » Deezer d'un voisin (compilations d'archives, et place
    idéale d'un faux album IA, que l'API ne signale pas) ; `/editorial/{genre}/releases`
    (vide) ; les flux RSS de Hype Machine (réservés aux abonnés).
  - Un titre déjà dans la bibliothèque, même sous une autre version, n'est pas une nouveauté.

**Jugement des sources.** L'examen tire uniformément dans la fournée : il juge donc la source
elle-même, avant le modèle. `radio report` donne le taux de « oui » à l'examen par source et
par blog ou genre, avec son intervalle de Wilson. Une source qui reste nettement sous les
autres après une vingtaine de votes est retirée ; une autre peut être essayée à sa place.

### 3.2 Favoris Hype Machine

`radio favoris` relit chaque semaine les favoris publics de Victor sur Hype Machine
(`nouveautes.hypem_favorites_user`, même API v2 que les nouveautés), retrouvés sur Deezer par la
règle stricte de la bibliothèque. Ils prennent l'origine `favorite` ; la bibliothèque garde la
priorité.

- **Plus des découvertes.** Un titre déjà aimé n'entre plus dans une fournée ni dans les
  nouveautés ; un candidat qui devient favori en sort. Un favori retiré retourne à sa fournée,
  ou est oublié.
- **Mesure du goût.** `radio train` publie la part des favoris que le modèle en service
  retiendrait à la coupure des découvertes de la dernière fournée, et la part que le hasard en
  retiendrait (53 % contre 33 % au 2026-10-02) : la part des découvertes notées à la coupure ou
  au-dessus, et non la part retenue, que la règle d'un titre par artiste réduit. Elle ne décide
  jamais d'une promotion.
- **Pas à l'entraînement.** En exemples positifs, ils n'ont pas amélioré l'AUC d'examen (0,760
  sans, 0,749 à 0,753 avec ; `recherches/2026-10-02-favoris-hypem.md`).

## 4. Le goût (étapes 1 à 4)

- **Positifs.** Les titres de la bibliothèque, pondérés par l'écoute (`1 + log(1 + écoutes)`,
  plafonné à 4), et les « oui » de leçon.
- **Négatifs.** Les « non » de leçon, et les négatifs faibles de démarrage
  (`config/negatives.toml`, curation sourcée dans `recherches/2026-09-24-negatifs-curation.md`)
  au poids de 0,1.
- **Poids des classes.** Chacune pèse 1 au total. C = 0,1. Les réglages ont été fixés sur les
  159 votes du banc.
- **Signaux retirés.** Popularité, tags et proximité étaient au niveau du hasard (AUC 0,52 à 0,58).
  L'empreinte seule donne une AUC d'examen de 0,82, contre 0,76 pour l'ancien modèle empilé.
- **Rétention.** Dans chaque fournée, découvertes et nouveautés ont chacune leur coupure : les
  `keep_decouvertes` et `keep_nouveautes` mieux notées sont retenues (80 et 80). Ces effectifs
  découlent de la grille d'antenne : ~70 entrées par semaine et par famille, plus les échecs
  d'acquisition (`recherches/2026-10-02-cycle-de-vie.md` §3 à §5). Un candidat entré depuis dans
  la bibliothèque n'est plus noté : ce n'est plus une découverte.
- **Un titre par artiste.** Une fournée retient au plus un titre par artiste, toutes familles
  confondues : son mieux noté (règle de Spotify Release Radar, « one song per artist per week »).
  L'acquisition ne prend pas un retenu dont l'artiste a déjà un titre en nouveautés, en
  découvertes ou prêt à publier : il attend la fin du premier séjour du précédent, comme BBC
  6 Music enchaîne les singles d'un artiste au lieu de les empiler. Un artiste a au plus deux
  titres à l'antenne, repos compris (un titre au repos revient au fond), le second au fond ou en
  repère. Faute d'artistes libres, il entre moins de
  titres ; le rapport compte les retenus en attente (`recherches/2026-10-02-programmation.md` §1
  et §2 : FIP joue 2,8 titres par artiste et par an, Nova 1,6).
- **Pistes écartées après mesure** : ressemblance kNN sur l'empreinte (AUC 0,67), filtre
  « couleur » à négatifs par catégories, têtes de style Essentia, modèle Jev (texte seul). Leurs
  recherches sont dans l'historique git (`git show f7d7081:docs/recherches/`).

**Votes.** Chaque semaine, 10 titres d'examen et 10 de leçon, présentés à l'aveugle.

- **Examen.** Tirage uniforme dans chaque famille de la fournée, à parts égales (5 découvertes,
  5 nouveautés) : tiré sur toute la fournée, l'examen ne donnerait que ~3 votes par semaine aux
  nouveautés, et aucune source ne serait jugée avant des mois. Le verdict « retenu » au moment du
  tirage est gardé. Ces votes jugent le modèle et ne servent jamais à l'entraîner.
- **Leçon.** Les titres les plus proches de la coupure de leur famille, un par artiste, jamais d'un artiste déjà
  tiré à l'examen : le modèle candidat l'aurait vu et pas celui en service. Ces votes entraînent
  le modèle, avec un gain décroissant : AUC 0,76 sans vote, 0,79 avec 50, 0,82 avec 99. Une
  autre version d'un titre d'examen (même titre normalisé) n'entre pas non plus à
  l'entraînement.
- **Promotion.** Un nouveau modèle n'est mis en service que si son AUC d'examen égale au moins
  celle du modèle en service.

La page de vote (FastAPI derrière Cloudflare Access, rappel WhatsApp) est en service depuis le
2026-10-01 sur `votes.aubesonore.fr`. Chaque passe tire une nouvelle sélection après `train`.

## 5. Acquisition (étape 5)

Justification des choix : `recherches/2026-09-30-acquisition-publication-observabilite.md` §1 et
§2.

1. **Entrée.** Les titres retenus pas encore acquis, la dernière fournée d'abord (une nouveauté
   vieillit), puis par note, au plus `max_per_pass` (160 : les deux familles d'une fournée),
   écrits en CSV (Artist, Title, Length).
   Un titre voté « non » (examen ou leçon) n'est jamais acquis.
2. **Sockseek 3.0.5** (binaire figé dans `~/.local/bin`, extrait de l'archive de release
   `sockseek_3.0.5_linux-x64.tar.gz`, dont la sha256 `d0a1e909…1b66` a été vérifiée) sur un
   **compte Soulseek dédié à la radio** (`SOULSEEK_USER`, `SOULSEEK_PASSWORD`). Le compte de slskd est interdit : il éjecterait slskd et les deux Lidarr.
   - Options : `--format mp3,flac --pref-format mp3 --length-tol 3 --name-format {uri}`, avec
     l'id Deezer en colonne URI du CSV : chaque fichier porte l'id du titre demandé.
   - Le mot de passe passe par un fichier de config en 0600, jamais par la ligne de commande.
     Ce fichier est écrit sur tmpfs, dans le `RuntimeDirectory=` de `radio-weekly` (exporté en
     `$RUNTIME_DIRECTORY`, 0700), que systemd supprime à l'arrêt de l'unité, même tuée au délai
     (`systemd.exec(5)`, vérifié sur une unité transitoire). À la main, il va dans
     `$XDG_RUNTIME_DIR`, effacé en fin de commande.
   - Une recherche à la fois, au plus 10 recherches par 220 s.
   - Le pipeline lit `_index.csv` : les échecs sont comptés par raison et ne sont pas relancés
     avant la passe suivante.
   - **Panne de Sockseek.** Codes de sortie au tag v3.0.5 (`Sockseek.Cli/Program.cs`) : 0 tout
     réussi, 1 au moins un échec, 2 erreur d'usage, 130 annulé. L'index est réécrit à chaque titre
     terminé (`M3uEditor.Update`). Un code autre que 0 ou 1, ou l'absence d'index (connexion
     refusée, compte banni), fait échouer l'étape sans enregistrer aucune tentative. Un titre
     absent d'un index partiel (Sockseek interrompu) n'est pas une tentative : il est compté
     « non tenté » et l'étape échoue.
   - Le dossier de la passe (`data/acquisition/<date>/`) est supprimé à la fin, même sur
     exception ; pas si systemd tue le processus (délai de 12 h), car Python n'exécute alors pas
     son `finally`.
3. **Contrôle de chaque fichier.** Il est rejeté, compté et supprimé s'il échoue à l'un de ces
   points :
   - `ffprobe` : codec MP3 ou FLAC, durée à ±3 s de Deezer, et pour un MP3 un débit moyen
     ≥ 200 kbit/s (un V0 tourne autour de 220–260 ; à revoir sur les premiers fichiers réels).
     C'est le débit du flux audio (`stream=bit_rate`, que ffprobe donne aussi pour un VBR), pas
     celui du fichier, qu'une pochette intégrée gonfle : mesuré sur un MP3 à 128 kbit/s avec une
     image de 1000 × 1000, le débit du fichier dépassait le seuil ;
   - **Chromaprint** : `fpcalc -raw` sur le fichier et sur l'extrait Deezer. Le taux de bits
     identiques au meilleur décalage doit être ≥ 0,70. La mesure a donné 0 erreur sur 38 + 1 406
     paires ; la durée seule laissait passer un autre titre du même artiste pour 18 fichiers sur 38.
4. **Pas de YouTube.** Un titre introuvable reste un échec compté, et on retente à la passe
   suivante.
5. **Plancher.** Le taux de fichiers prêts n'est jugé qu'à partir de `min_attempts_for_rate`
   tentatives (`config/editorial.toml`, 20).
6. **Premier essai réel** (2026-09-30, 10 retenus, sans port ouvert sur la box) : 10 prêts, tous
   en MP3 320 kbit/s, identité Chromaprint de 0,925 à 0,982, durée à ±2 s. Le port d'écoute de
   Sockseek reste fermé tant qu'un taux d'échec ne justifie pas de l'ouvrir.

## 6. Préparation (étape 6)

- **Conversion.** Tout ce qui n'est pas du MP3 (FLAC, AAC, OGG…) passe en MP3 V0 :
  `ffmpeg -af aresample=resampler=soxr:osr=44100 -c:a libmp3lame -q:a 0`. Un MP3 n'est jamais
  réencodé.
- **ReplayGain.** `rsgain custom -s i -c p`, avec rsgain 3.8 en binaire figé, extrait de
  l'archive de release `rsgain-3.8-Linux.tar.xz`, dont la sha256 `4939de3b…65a0` a été
  vérifiée ; la CI installe la même. Sans ces balises,
  Liquidsoap recalcule le gain à chaque titre, ce qui coûte beaucoup de CPU (doc AzuraCast,
  « optimizing »).
- **Points de coupe.** Mesuré le 2026-10-04 : 15 titres sur 40 finissaient sur plus de 3 s de
  quasi-silence (jusqu'à 7 s), où le fondu de 3 s d'AzuraCast tombait, d'où des blancs entre
  les titres. Chaque fichier reçoit les balises `cue_in` et `cue_out`, qu'AzuraCast lit (ses
  balises inconnues vont dans `extra_metadata`), passe à Liquidsoap et retire de la durée du
  titre (`StationMedia::getCalculatedLength`, 0.23.8) : la file et la grille comptent la partie
  jouée. Le calcul est celui de l'AutoCue de Liquidsoap 2.4.5 (`autocue.liq`) : sonie
  momentanée EBU R128 par trame de 100 ms (filtre `ebur128` de ffmpeg), début avant la première
  trame à plus de la sonie intégrée − 34 dB, fin après la dernière à plus de − 42 dB. Comparé
  à Liquidsoap lancé dans le conteneur sur 12 titres de l'antenne : débuts identiques, fins
  identiques sauf quand Liquidsoap raccourcit une fin douce pour son fondu (`max_overlap`),
  qu'on garde ici. AutoCue reste coupé dans AzuraCast : il calcule ses points à la lecture et ne
  les donne pas à la file, qui prendrait de l'avance sur la grille. Avec des points de coupe,
  AzuraCast donne à Liquidsoap un fondu égal au réglage `crossfade`, 2 s, quand sa file compte
  `crossfade` × 1,5, 3 s (`Annotations.php`, `Queue::addDurationToTime`, 0.23.8) : la grille suit
  la file, qui choisit l'heure de chaque titre, et une heure joue ~14 s de plus que prévu, ce
  que ses titres de fin absorbent. Les titres publiés avant le 2026-10-04 se rattrapent par
  `radio antenne-cues`, puis `radio mesures`, qui remplace leurs mesures une à une.
- **Balises** (ffmpeg, qui remplace toutes les balises d'origine) : artiste et titre Deezer,
  commentaire `deezer:<id>`, ISRC, album et pochette (`album.cover_xl`, 1000 × 1000) lus sur
  `/track/<id>` : l'id exact donne le bon album, là où la recherche native d'AzuraCast
  (MusicBrainz par artiste et titre) prend le premier venu. La lecture de `/track/<id>` qui donne
  l'extrait frais du contrôle d'identité donne aussi l'album : une seule requête par fichier. La
  pochette est un flux image intégré en APIC (ffmpeg-formats, muxer mp3) ; `-map 0:a:0` seul la
  perdait. Une pochette refusée par Deezer ne rejette pas un fichier dont l'identité est
  prouvée : il est préparé sans pochette et compté « sans pochette ». Fichier prêt :
  `data/antenne/<id Deezer>.mp3`. Un échec de ffmpeg ou de rsgain ne laisse aucun fichier
  temporaire.
- **Repères.** Des titres de la bibliothèque Plex, copiés sans jamais y écrire, préparés de la
  même façon et étiquetés `repère` dans la base. Ils représentent au plus 20 % de l'antenne.
  Le chemin du fichier vient de Plex (`Media/Part`) ; un chemin hors de `/media/plex/Musique`
  n'est jamais lu. Un repère qui échoue (outil, Deezer) est sauté, compté et nommé, sans faire
  échouer l'étape : un autre sera tiré à la passe suivante.

## 7. Antenne (étape 7)

### 7.1 Bibliothèque d'antenne

Chaque titre suit un cycle de vie (`recherches/2026-10-02-cycle-de-vie.md` §3 et §4, pratiques
sourcées dans `recherches/2026-10-02-rotation-radio.md`). Il sort par âge, jamais par score : le
score choisit seulement qui est promu. La passe hebdomadaire applique ces règles dans l'ordre :

- **Entrées.** Tout ce qui a été acquis est publié, dans la catégorie de sa famille :
  `nouveautes` (Hype Machine, Deezer éditorial) ou `decouvertes` (voisins). Une découverte passe
  à « publiée » dans la transaction de son entrée : sortie ensuite, elle n'est jamais republiée.
- **Votes « non ».** Un titre voté « non » sort à la passe suivante, quelle que soit sa catégorie.
  Un fichier prêt voté « non » n'est jamais publié. Un repère voté « non » n'est jamais tiré.
- **Fin du premier séjour** (`stay_weeks`, 6 semaines, KEXP) : la part `promotion_share` (12 %)
  la meilleure de la cohorte, un « oui » d'abord puis la note du modèle, part au repos ; le reste
  sort.
- **Fond, par auto-platooning** (MusicMaster) : un recurrent présent au fond depuis 6 semaines
  part au repos ; les places libres du fond reviennent à ceux qui se reposent depuis le plus
  longtemps, au moins `rest_weeks` (12 semaines).
- **Péremption** (`life_weeks`, 78 semaines, BBC Radio 2) : un recurrent sort pour de bon 18 mois
  après sa première diffusion.
- **Repères** : chacun reste 6 semaines, puis cède sa place à un autre, tiré selon l'écoute parmi
  ceux qui ne sont pas passés depuis 12 semaines (`repere_sorties`). Au plus `stock / 6` entrées
  par passe : le stock se remplit au rythme où il se renouvelle. Un tirage qui donnerait un
  troisième titre à un artiste est écarté et compté.
- **Stocks.** Ceux du fond et des repères découlent de la grille (`[grille]` de
  `editorial.toml`) : part d'antenne × titres par heure × 168 / passages par semaine, ~409
  chacun. Les nouveautés et les découvertes entrent au rythme de la rétention (§4).
- **Toujours épargnés** : le titre en cours (`GET /nowplaying/{station}`, `now_playing.song.id`)
  et la file de l'AutoDJ (`GET /station/{id}/queue`) ne sortent ni ne bougent ; ils attendent la
  passe suivante.
- **Retrait manuel** : supprimer le fichier dans AzuraCast ; la passe suivante l'oublie et ne le
  republie jamais.

### 7.2 Publication sur AzuraCast

Justification : `recherches/…-observabilite.md` §3.

- **Dépôt.** `POST /station/1/files` dans le dossier `antenne/`. L'`id` et l'`unique_id`
  renvoyés sont gardés en base avec l'origine du titre.
- **Diffusion.** Le dossier `antenne/` est rattaché à une seule playlist « AubeSonore », non
  programmée, en `shuffle` avec `avoid_duplicates`. AzuraCast y range lui-même les fichiers.
- **Repos.** Un titre au repos est déplacé dans `repos/` par `PUT /station/1/files/batch` avec
  `do=move` (`BatchAction::doMove`, 0.23.8 : déplacement sans réécriture des balises ; Flysystem
  crée le dossier). `repos/` n'est rattaché à aucune playlist : la synchronisation des dossiers
  (`CheckFolderPlaylistsTask`, toutes les 5 min) retire de la playlist un fichier sorti de son
  dossier.
- **Retrait.** `PUT /station/1/files/batch` avec `do=delete`.
- **Interdit.** Jamais de `PUT /file/{id}` : il réécrit et supprime les balises.
- **ISRC.** L'ISRC de `/track/<id>`, quand Deezer en a un bien formé (ISO 3901), est écrit en
  trame ID3 `TSRC` (`-metadata TSRC=…` ; `-metadata ISRC=…` donnerait une trame libre `TXXX`).
  AzuraCast lit les balises avec getID3, qui range `TSRC` sous `isrc` (`PhpReader`,
  `MetadataTags::Isrc`, `StationMedia` : vérifié dans le conteneur le 2026-10-04) ; le titre en
  cours l'expose dans `song.isrc`, que le site lit pour identifier le titre et son artiste
  (`docs/vision.md` racine, §4.4). Les titres publiés avant se rattrapent par
  `radio antenne-isrc` : chaque fichier est relu par `GET /file/{id}/play`, reçoit sa trame
  (flux et autres balises copiés tels quels) et est redéposé sur son chemin ; le titre en cours
  et la file attendent une relance, un fichier déjà étiqueté n'est pas redéposé.
- **Réalignement à chaque passe.** On compare la base au contenu de `antenne/` et on rapporte les
  écarts.

- **Interdit aussi.** `POST /station/1/art/{id}` : il finit par la même réécriture
  (`StationMediaRepository::updateAlbumArt` → `writeToFile`). La pochette est intégrée au fichier
  à la préparation (§6) ; redéposer un fichier sur le même chemin remplace le média en place
  (`MediaProcessor::processAndUpload`, `findByPath`).

**Bascule, faite le 2026-10-01** par appels directs, sans attendre 400 titres puisque la radio
n'avait pas encore d'auditeurs : création de la playlist « AubeSonore » (id 10) rattachée à
`antenne/`, désactivation des 8 anciennes, suppression des 369 anciens titres. Pas de retour
arrière : les fichiers supprimés sont perdus et la sauvegarde JSON des anciennes playlists n'est
plus conservée.

### 7.3 Enchaînement et grille

Une grille horaire fixe la part d'antenne de chaque catégorie (`[grille]` de `editorial.toml` :
1/3 nouveautés, 1/3 découvertes, 1/6 fond, 1/6 repères), et le même planificateur ordonne
chaque heure (`recherches/2026-10-02-cycle-de-vie.md` §2 et §6). `radio grille` écrit chaque
soir à 23:00 la journée du lendemain ; la passe du dimanche réécrit les heures qui restent après
avoir fait entrer et sortir des titres (`--aujourdhui`, jamais l'heure en cours).

- **Une heure se remplit au temps, pas au nombre.** AzuraCast prend chaque titre dans la
  playlist programmée à l'heure prévue de son passage : la fin du précédent moins
  `crossfade` × 1,5, soit 3 s (`Queue::addDurationToTime`, `getCrossfadeDuration`, 0.23.8, lu
  par `start_next_s`). Un titre passe donc s'il commence avant la fin de l'heure, et l'heure
  suivante démarre après lui : mesuré le 2026-10-04, chaque heure a commencé 0 à 4 min après
  l'heure pile et a joué 13 à 16 titres. Une heure reçoit des titres, de la durée mesurée de
  leur fichier (`track_features.duration_s`), jusqu'à couvrir toute sa durée ; avec 16 titres
  fixes, une heure de titres courts s'épuisait (5 h le 2026-10-04 : 3 585 s) et le secours
  jouait. Les catégories se suivent par smooth weighted round-robin ; tant qu'une catégorie n'a
  pas son stock, sa part est réduite en proportion et rendue aux autres.
- **Les plus en retard partent à coup sûr.** L'heure démarre après la fin du dernier titre de la
  précédente, d'au plus sa durée : les titres qui partent avant la fin de l'heure dans
  n'importe quel ordre, les plus en retard choisis d'abord, forment le fil ; les moins pressés
  viennent après, où l'heure suivante peut les couper. Sans cela, le fil rangeait en fin d'heure
  les titres entrés d'office, loin de l'ambiance des autres : coupés, ils restaient en retard
  (32 titres la nuit du 2026-10-03).
- **Remplissage, créneau par créneau**, avec la mécanique des logiciels du métier
  (`recherches/2026-10-02-programmation.md` §3) : la catégorie est parcourue dans l'ordre de
  rotation (pile de MusicMaster : dernier passage dans l'historique d'AzuraCast, 14 jours), sur
  une fenêtre de `marge − 1` fois les passages du jour. Le retard d'un titre se compte en tours de
  sa catégorie (le temps de la jouer en entier) depuis son dernier passage, ou depuis son entrée
  s'il n'a jamais joué.
  - **Deux règles incassables.** Repos minimum : `repos` (60 %) d'un tour, le conseil de
    MusicMaster, soit ~2,2 jours en nouveautés et découvertes. Séparation d'artiste :
    `separation_h` (3 h), la fenêtre de la règle DMCA et celle de l'anti-doublon de la station.
  - **L'ambiance est un objectif, jamais une condition** (objectifs et règles de GSelector) :
    parmi les titres permis, le pris minimise l'écart à la cible de l'heure ; un titre en retard
    de plus de `avantage` tours (150 %) y gagne jusqu'à `retard`, et à `force` tours (200 %) il
    passe d'office, le plus en retard d'abord (règle anti-famine « Airplay Starvation » de
    GSelector). Chaque titre passe donc au moins une fois tous les deux tours.
  - **La grille publiée compte** (table `grille`) : à 23:00, l'heure de 23 h n'est pas encore
    dans l'historique d'AzuraCast. Un titre publié mais pas encore joué compte comme joué à la
    fin de son heure, le pire cas ; sans cela, les titres et les artistes de 23 h repassaient dès
    minuit. Un titre de fin d'heure coupé n'y perd qu'un jour de rotation. Les
    heures que la grille réécrit ne comptent pas : elles ne joueront pas ce qu'elles avaient. Le
    2026-10-04, la passe du dimanche les comptait encore ; elle a bloqué jusqu'au soir les titres
    et les artistes de la grille de la nuit, et de midi à 23 h chaque heure n'avait que 4 à 6
    titres sur 16 (121 créneaux vides).
  - **La file d'attente d'AzuraCast compte aussi** : environ 4 titres, 15 à 20 min d'avance
    (mesuré le 2026-10-04). Vider une playlist retire de la file ses titres pas encore remis à
    Liquidsoap, pas les autres (`emptyPlaylist` puis `clearForPlaylist`, 0.23.8) : un titre en
    file compte comme joué à l'heure prévue de son passage (`played_at`, ou `cued_at` tant
    qu'elle n'est pas estimée), le pire cas. Sans cela, une passe finie peu avant une heure
    replaçait dans la journée un titre déjà en file.
  - Un titre placé repart en fin de rotation. Le rapport donne le tour de chaque catégorie, les
    heures courtes, les créneaux cédés, les titres pas joués depuis plus de deux tours (doit être
    nul) et le plus grand nombre de titres d'un même artiste à l'antenne (doit rester à 2).
  - **Une catégorie sans titre permis cède son créneau** à la suivante : l'heure continue au
    lieu de laisser un trou, et le rapport compte les créneaux cédés.
  - **Une heure trop courte fait échouer la commande**, après la publication : ses titres ne la
    couvrent pas, elle s'épuise et le secours joue à la place de la grille (§1). La grille
    publiée est gardée, et Gatus alerte (§8.2).
  - **Vérifié par simulation** (14 jours sur l'antenne du 2026-10-04, 532 titres, durées
    réelles, lecture selon `Queue::addDurationToTime`) : 0 min de secours contre 33 avec 16
    titres par heure, titres en retard de plus de deux tours de 8-19 par jour à 0 dès le
    troisième, aucune heure courte, aucun créneau cédé ; le titre le moins joué passe 1,5 fois
    par semaine au lieu de 1.
- **Vérifié par simulation, avec 16 titres par heure, avant le remplissage au temps** (14 jours
  sur l'antenne du 2026-10-02, 273 découvertes et 68 repères, en ne jouant que les ~14,6 premiers
  titres de chaque heure) : aucun titre sans passage,
  aucun créneau vide, au moins 3 passages par semaine pour chaque découverte. Entre deux passages
  d'un même artiste, au moins 3 h, sans exception (0,1 h au plus court avec la règle « ni l'heure
  ni la précédente », qui ne passait pas minuit). L'artiste le plus joué passe de 74 à 41 passages
  par semaine ; il a encore 9 titres à l'antenne, entrés avant la règle d'un titre par artiste, qui
  sortiront à la fin de leur séjour. La séparation se compte depuis la fin de l'heure où l'artiste
  est placé : le fil qui dérive réordonne l'heure, et la compter depuis son créneau laissait
  15,6 % des retours sous 3 h.
- **Cibles** : énergie (arousal), dansabilité et tempo, en quantiles des titres mesurés à
  l'antenne. Six blocs : matin dès 6 h, après-midi dès 12 h, soir dès 20 h, nuit dès 23 h, fin de
  nuit dès 4 h (5 h le samedi et le dimanche), d'après Heggli, Stupacher et Vuust (*Royal
  Society Open Science*, 2021, PMC8580447) ; fête le vendredi et le samedi de 20 h à 3 h
  (décision du 2026-09-23). Un titre pas encore mesuré est neutre.
- **Ordre** : fil qui dérive, du dernier titre de l'heure précédente au plus proche, de la fin
  d'un titre au début du suivant, sur les titres qui partent à coup sûr, puis sur les autres.
- **AzuraCast** : 168 playlists « Grille {jour} {hh}h », séquentielles, programmées une heure par
  semaine avec `loop_once`, sans `avoid_duplicates`, créées au premier usage
  (`POST /station/1/playlists` avec `schedule_items` ; `start_date` et `end_date` à `null`
  obligatoires). Remplissage : `DELETE …/empty` puis `POST …/import` (M3U, ordre conservé,
  `ImportAction` 0.23.8). Les playlists programmées passent devant la playlist « AubeSonore »,
  qui reste le secours (`QueueBuilder`, 0.23.8).
- **Heures murales** : AzuraCast programme chaque playlist horaire sur l'heure de la station
  (`Scheduler::shouldPlayInSchedulePeriod`, 0.23.8), et la grille date chaque heure de même
  (`hour_spans`), jamais `minuit + h × 3600`, qui se décale d'une heure les jours de changement
  d'heure, deux dimanches, jour de la passe. Le 2026-10-25, l'heure de 2 h se répète : son
  créneau dure deux heures et reçoit deux heures de titres ; AzuraCast enchaîne la playlist sur
  la seconde 2 h tant que sa file en garde un titre (le cas normal, file de 3), sinon il la
  reprend au début (`shouldPlaylistLoopNow`). Le 2027-03-28, 2 h n'existe pas : l'heure n'est
  pas planifiée, et sa playlist est vidée, car AzuraCast la jouerait quand même une fois à 3 h
  avec la grille d'une autre semaine (2 h et 3 h donnent toutes deux 03:00,
  `StationSchedule::getDateTime`).

**Mesures par titre** (`radio mesures`, depuis le 2026-10-02 ;
`recherches/2026-10-02-mesures-titres.md`). Chaque titre de la table `antenne`, au repos compris
(il reviendra au fond), est mesuré une fois sur son fichier du dossier média d'AzuraCast
(`AZURACAST_MEDIA_DIR`, lu, jamais écrit), dans la table `track_features`, sur la partie jouée,
entre ses points de coupe, dont la durée est celle que la grille compte :

- dansabilité (`danceability-msd-musicnn-1`), arousal et valence DEAM sur [1, 9]
  (`deam-msd-musicnn-2`), sur un seul réseau d'embedding, MSD-MusiCNN ; l'arousal tient lieu
  d'énergie ;
- tempo par TempoCNN (`deeptemp-k16-3`), vote majoritaire ; au début et à la fin, les erreurs
  d'octave (facteur 2 ou 3 à 4 % près) sont ramenées au tempo du titre ;
- chaque valeur sur le titre entier, sur ses 30 premières et sur ses 30 dernières secondes : la
  transition se joue entre la fin d'un titre et le début du suivant ;
- ~17 s par titre sur un fil. Un fichier absent du dossier média est nommé, l'étape échoue, et
  il est retenté à la passe suivante ; un audio illisible est noté `audio_failed`.
- Modèles dans `models/`, à côté d'EffNet, épinglés par SHA-256 (MTG, CC BY-NC-SA 4.0 ;
  TempoCNN, AGPL v3).

## 8. Observabilité

Justification : `recherches/…-observabilite.md` §4.

### 8.1 Rapport de passe

Chaque étape écrit une ligne en base (`stage_reports`) avec ses compteurs, rattachée à la passe
par `$INVOCATION_ID` de systemd, y compris quand elle échoue : la ligne porte alors l'erreur (le
message de la commande, ou seulement le type d'une exception imprévue, dont le texte peut
contenir une URL signée). `radio report` affiche le dernier rapport de chaque étape.

**Suivi des sources** (`radio/votes/suivi.py`), dans `radio report`, sur la page `/suivi` de la
page de vote et en lien dans le rappel du dimanche :

- le parcours de chaque source, et de chaque genre Deezer, dans la dernière fournée : candidats,
  retenus, prêts, échecs d'acquisition, à l'antenne ;
- le taux de « oui » à l'examen par source, genre et blog, avec son intervalle de Wilson ;
- les points à ajuster, chacun avec sa règle : une source dont l'intervalle reste sous le taux
  du reste après 20 votes d'examen (§3.1), un genre ou une source qui n'a rien apporté de neuf
  à la dernière fournée, une source dont la moitié des retenus reste introuvable sur Soulseek
  (dès 10 tentatives). `radio nouveautes` compte aussi les titres « déjà vus » par source : une
  sélection qui ne se renouvelle pas.

Seuils, par étape : taux d'acquisition au-dessus de `min_success_rate` dès
`min_attempts_for_rate` tentatives (`editorial.toml`) ; aucune erreur à l'antenne.

`acquire` est préfixée de `-` dans l'unité : son échec n'empêche pas `antenne` de publier ce qui
est prêt. La dernière étape, `radio check`, juge la passe entière : une étape en échec, ou aucune
découverte publiée, ou une étape sans ligne de rapport (processus tué), la fait échouer, et Gatus
alerte (§8.2).

### 8.2 Gatus

Gatus 5.37.0 est un conteneur dont la configuration YAML est versionnée dans
`deploy/gatus/config/`. Le dossier est monté, pas le fichier : Gatus recharge alors seul chaque
version que le déploiement amène. Il est le seul outil de surveillance. Tableau de bord sur `127.0.0.1:8050` (tunnel SSH). Chaîne
d'alerte testée de bout en bout le 2026-09-30. Il alerte après 3 échecs, avec un rappel au plus
toutes les 24 h et un message de retour à la normale, sur deux canaux :

- WhatsApp (CallMeBot) ;
- ntfy.sh, sujet aléatoire `NTFY_TOPIC` (le nom du sujet fait office de secret), abonné dans
  l'application ntfy du téléphone. CallMeBot répond 210 quand son quota est épuisé, et Gatus ne
  compte comme échec d'envoi qu'un statut supérieur à 399 (`custom.go:94`, v5.37.0) : sans ce
  second canal, une alerte pouvait se perdre en silence.

| Sonde | Condition |
|---|---|
| `antenne` : `nowplaying` AzuraCast, chaque minute | HTTP 200 et `is_online == true` (en place) |
| `flux-public` : `radio.aubesonore.fr/listen/aubesonore/radio.mp3`, toutes les 5 min | HTTP 200 : vérifie aussi le tunnel Cloudflare (en place) |
| `passe-hebdo` (endpoint externe) | Poussée par `ExecStopPost=` avec `$SERVICE_RESULT` ; alerte au premier échec ou après 8 jours de silence (en place) |
| `sauvegarde` (endpoint externe) | Même mécanisme pour `radio-backup` ; alerte au premier échec ou après 2 jours de silence |
| `grille-a-l-antenne` : `nowplaying`, toutes les 10 min | la playlist en cours s'appelle « Grille … » ; alerte après 7 échecs (plus d'une heure de secours). Une heure à moitié vide ne la fait pas alerter : ses sondes alternent ; c'est l'échec de `radio grille` sur une heure trop courte qui la signale |
| `grille` (endpoint externe) | `radio-grille` ; alerte au premier échec (heure mal écrite, heure trop courte) ou après 2 jours de silence. Dans la passe du dimanche, `radio check` fait échouer la passe |
| `page-de-vote` : `127.0.0.1:8040`, toutes les 5 min | HTTP 403 sans jeton Access : la page tourne (en place) |
| `page-de-vote-publique` : `votes.aubesonore.fr`, toutes les 5 min, redirection non suivie | HTTP 302 vers la connexion Access : la règle Access et la route du tunnel tiennent |

### 8.3 Non-régression

- **CI GitHub Actions** (`.github/workflows/pipeline.yml` à la racine du dépôt AubeSonore, qui
  réunit depuis le 2026-10-01 le site, le pipeline et la config AzuraCast) : ruff, mypy strict
  et pytest à chaque push et à chaque PR, avec astral-sh/setup-uv. `master` est protégée : rien
  n'y entre sans CI verte, celle du site comprise.
- **Renovate** (configuration à la racine) pour `uv.lock`, les actions GitHub et l'image de
  Gatus. `essentia-tensorflow` en est exclu : ses versions récentes ne publient que des roues
  cp314, et le projet est en Python 3.12.
- **Déploiement** : merger sur `master` suffit. `aubesonore-deploy.timer` avance le checkout
  `~/aubesonore`, jamais pendant une passe hebdomadaire, et redémarre `radio-votes` quand `pipeline/`
  change : la page de vote garde sinon le code de son démarrage.
- Les tests tournent sans réseau (~12 s). Tout bug corrigé reçoit son test.

## 9. Ordre de réalisation

1. **Observabilité.** CI, Renovate, Gatus sur l'antenne actuelle et battement de cœur de la
   passe. On voit ce qui marche avant d'ajouter quoi que ce soit.
2. **Acquisition** (§5), une fois le compte Soulseek créé.
3. **Préparation et antenne** (§6, §7.1, §7.2) : fait, bascule le 2026-10-01.
4. **Page de vote** (§4) : en service le 2026-10-01.
5. **Enchaînement** (§7.3).

## 10. Exploitation

| Quand | Unité systemd utilisateur | Ce qui se passe |
|---|---|---|
| dimanche 03:00 | `radio-weekly` | `library-sync`, `discover`, `nouveautes`, `signals`, `train`, `votes-select`, `acquire`, `antenne`, `mesures`, `grille --aujourdhui`, `check` ; bornée à 12 h, battement de cœur Gatus |
| chaque jour 23:00 | `radio-grille` | grille du lendemain dans les 24 playlists horaires du jour ; battement de cœur Gatus |
| chaque jour 04:30 | `radio-backup` | copie de `data/radio.db` (API de sauvegarde SQLite, `integrity_check` vérifié) et de `data/models/` dans `RADIO_BACKUP_DIR` (`/media/plex/.backups/radio`, autre disque physique), 14 jours gardés ; battement de cœur Gatus |
| dimanche 10:00 | `radio-remind` | rappel WhatsApp de vote |
| en continu | `radio-votes` | page de vote, `127.0.0.1:8040`, publiée sur `votes.aubesonore.fr` |

- État : `.venv/bin/radio report`.
- Journaux : `journalctl --user -u radio-weekly`.
- Un gros rattrapage de `signals` (environ 3 s par titre) ou de `mesures` (environ 17 s par
  titre) se lance à la main, en `nice`, jamais pendant `radio-weekly`.

**Réglages.** Les secrets et les URL sont dans `.env` (modèle : `.env.example`, jamais commité),
y compris `GATUS_TOKEN` pour le battement de cœur. Le reste est dans `config/editorial.toml`.
Gatus : `cd deploy/gatus && docker compose up -d` (son `.env` est un lien vers celui du dépôt).

**Installer les unités.**

```bash
for u in deploy/systemd/*; do systemctl --user link "$PWD/$u"; done
systemctl --user daemon-reload
systemctl --user enable --now radio-weekly.timer radio-remind.timer radio-backup.timer radio-grille.timer radio-votes.service
loginctl enable-linger
```

Les liens pointent vers le dépôt : il faut les re-lier si le dépôt change de place. Le linger
est indispensable : il lance le gestionnaire systemd de l'utilisateur au démarrage et le garde
après la déconnexion, ce qui fait tourner les unités sans session ouverte (`man loginctl`,
`enable-linger`). Il est actif sur la machine (`loginctl show-user victormoi -p Linger`).

**Publier la page de vote** (tableau de bord Cloudflare Zero Trust, dans cet ordre) :

1. Access → Applications → Self-hosted : le sous-domaine, et une politique « Allow » limitée à
   l'adresse de Victor. L'« AUD tag » va dans `CF_ACCESS_AUD`, et
   `<équipe>.cloudflareaccess.com` dans `CF_ACCESS_TEAM_DOMAIN`.
2. Networks → Tunnels → tunnel existant → Public hostname : même sous-domaine, `localhost:8040`.
3. Contrôles : `curl -sI https://<page>` doit rediriger vers Access, et
   `curl -s 127.0.0.1:8040/` doit renvoyer 403.

**Actions de Victor**

- Plus tard, si les mesures le justifient : ouvrir sur la box le port d'écoute de Sockseek
  (49998/TCP), ce qui demande aussi une règle `ufw` sur l'hôte.
- Vérifier que la box ne redirige pas le port 5030 : l'interface de slskd est publiée sur
  toutes les interfaces de la machine, et Docker contourne `ufw`.

## 11. Hors périmètre

- Le site d'écoute, pièce `site/` du même dépôt (`docs/vision.md`).
- Les likes du site comme signal : cela couplerait le site et le pipeline.
- La sauvegarde des médias de l'antenne, qui n'est pas faite ici : depuis le 2026-10-03, une
  tâche de l'hôte les sauvegarde avec restic (`azuracast/RUNBOOK.md`), car ils ne se
  retéléchargent pas à l'identique. La base du pipeline est sauvegardée chaque jour (§10) : les
  votes ne se reconstituent pas.
