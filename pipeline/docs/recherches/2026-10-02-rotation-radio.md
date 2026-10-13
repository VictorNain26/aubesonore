# Cycle de vie d'un titre en rotation : pratiques existantes — 2026-10-02

Recherche du 2026-10-02. Convention : **[S]** = sourcé (source citée), **[I]** = mon inférence.
Le code AzuraCast cité est celui du tag `0.23.8` (commit `62a30e53`, 2026-08-08), cloné et lu.

## 1. Radio classique : catégories, durée de vie, sortie

### 1.1 Catégories

- [S] Une catégorie = un groupe de titres qui tournent au même rythme. Découpage type : Current A/Power,
  Current B (« on the way down »), Current C (« on the way up »), Recurrent Power/Secondary, Gold
  Recent, Gold Classic. Les catégories croisent **âge** et **popularité** (power vs secondary).
  Ordre de grandeur : sur 400 titres testés, seuls ~10 % (score 80+/100) sont vraiment « chauds ».
  — Thomas Giger, Powergold, 2017-09-22, https://www.powergold.com/?p=1346
- [S] Le « turnover » d'une catégorie (temps pour jouer chaque titre une fois) dépend du nombre de
  titres et du nombre d'appels de la catégorie par heure ; recurrent et gold sont des catégories
  plus larges et plus lentes qui soutiennent des currents rapides. — Dave Tyler, MusicMaster,
  2023-02-16, https://musicmaster.com/?p=8560
- [S] BBC Radio 2 : A-list 15–20 passages/semaine, B-list 5–10, C-list jusqu'à 5 ; **recurrents =
  titres passés en A-list au cours des 18 derniers mois**. Réunion de playlist hebdomadaire.
  — Thomas Giger, 2011-11-20, https://radioiloveit.com/radio-music-research-music-scheduling-software/bbc-radio-2-music-playlist-more-variety-less-powerplay/
- [S] BBC Radio 1 : A-list 3–4 passages/jour, B 2/jour, C 1/jour ; les titres montent et descendent
  selon leur popularité, **durée de vie typique ~7 semaines** ; chaque mercredi on décide d'abord
  ce qui sort, puis ce qui entre. — David Renshaw, NME, 2013-02-06, https://www.nme.com/?p=1255018
- [S] Radio 2 (Jeff Smith, directeur musical) : « we're not waiting for records to burn », on sort
  les tubes avant l'usure ; 50 à 100 candidats par semaine, 5 entrent. — Powergold/Giger,
  2018-09-10, https://www.powergold.com/?p=1449
- [S] CHR US : moyenne de 119 passages/semaine en power (78 stations) ; « glacial turnover among
  powers and brutal churn among sub-powers » ; *Blinding Lights* est resté 9 mois en power.
  — Sean Ross, Powergold, 2020-09-30, https://powergold.com/what-is-the-sweet-spot-for-chr-power-rotation/
- [S] Le même auteur dénonce la dilution du recurrent : titres gardés six mois en power, ou qui
  reviennent après 18 mois ; dans les années 1980, power recurrent 34×/semaine, recurrent 11×.
  — Sean Ross, RadioInsight, 2022-02-24, https://radioinsight.com/blogs/220048/did-radio-destroy-the-recurrent/

### 1.2 Critères de passage current → recurrent → gold / sortie

- [S] **Âge + rang** (règle « recurrent » de Billboard, référence du secteur) : depuis le 2025-10-25,
  un titre sort du Hot 100 s'il est sous la 50e place après 20 semaines, sous la 25e après 26,
  sous la 10e après 52, sous la 5e après 78. Motif explicite : les radios gardent les tubes trop
  longtemps, les charts stagnent. — Gary Trust, Billboard, 2025-10-22,
  https://billboard.substack.com/p/older-hits-will-now-drop-off-the
- [S] **Burn** (lassitude mesurée en callout) : « Traditionally, once a song hit 20% Burn, it was
  deemed time to rest it » ; aujourd'hui on tolère plus ; après repos, on re-teste. Vérifier que le
  burn vient du cœur d'audience et pas des auditeurs infidèles. — Stephen Ryan, radioiloveit,
  2018-05-01, https://radioiloveit.com/?p=28996
- [S] Les tests en auditorium (AMT) servent à trier le gold ; un titre écarté pour burn « will have
  had a period of rest, and may prove to be contenders for rotation again ».
  — radioiloveit (Stephen Ryan), https://radioiloveit.com/?p=20216 (date non relevée)

### 1.3 Le mécanisme qui répond exactement au problème : l'Auto-Platooning

C'est la pratique standard des logiciels de programmation pour faire tourner une bibliothèque plus
grande que ce qui est à l'antenne, **sans jamais garder un titre en permanence**.

- [S] Définition : « Platooning is a feature that moves songs automatically between two categories.
  The songs that have been in the category the longest move out and are rested (move date is used
  to calculate this), replaced with songs that have been out of rotation. » Il faut créer une
  catégorie « hold » par catégorie active ; mouvements planifiables au jour, à la semaine, au mois.
  — Marianne Burkett, MusicMaster, 2012-04-16, https://musicmaster.com/?p=1009
- [S] Deux critères de sortie : **Move Date** (le plus ancien dans la catégorie) ou **Category Plays**
  (le plus joué) ; depuis la v7, critère différent pour l'entrée et la sortie ; quantité = nombre
  fixe ou pourcentage de la catégorie ; filtres possibles. — MusicMaster, 2013-01-14,
  https://musicmaster.com/?p=1758
- [S] Cas réel complet (station « MusicMaster Oldies », Joe Knapp, fondateur, 2023-08-21,
  https://musicmaster.com/?p=8715) :
  - 591 titres actifs ; A-Power 173 titres (turnover 17 h), B 274 (1 j 15 h), C 134 (5 j 14 h) ;
    catégories de repos AX 237, BX 1 324, CX 1 689 titres.
  - Dans A, **94 titres « core » ne se reposent jamais**, les 83 autres oui.
  - Chaque jour, les 3 titres non-core les plus joués de A sont remplacés par les 3 de AX qui
    se reposent depuis le plus longtemps ; **repos d'environ trois mois**.
  - B et C : 10 échanges par jour ; **cycle complet d'environ six mois**.
- [S, non vérifié directement] RCS GSelector a la même fonction « Platoon » (catégorie active ↔
  catégorie hold, hebdo ou mensuelle, nombre ou pourcentage). Les pages rcsworks.com renvoient 403 ;
  seul l'extrait du moteur de recherche a été lu (https://www.rcsworks.com/blog/rcs-live-advanced-gselector-scheduling-techniques/).

### 1.4 Séparation

- [S] Séparation d'artiste « 1 hour and 10 minutes (kind of the industry standard) », réglable par
  artiste (ex. 3 h 15 pour les Rolling Stones). — Dave Tyler, MusicMaster, 2024-04-30,
  https://musicmaster.com/?p=11068
- [S] Exemple de réglage « auto » à 1 h 45, avec des exceptions par artiste. — Brian Wheeler,
  MusicMaster, 2020-11-30, https://musicmaster.com/?p=7959

## 2. Radios de découverte / non commerciales

- [S] **KEXP** : le directeur musical fixe la rotation (heavy/medium/light), les animateurs y
  choisissent librement et la rotation ne fait que ~50 % de l'émission ; **durée de vie d'une
  sortie en rotation : 6 à 8 semaines**. — KEXP « Getting Airplay », mis à jour 2025-02,
  https://www.kexp.org/about/getting-airplay
- [S] KEXP : « a couple hundred new albums in rotation », bibliothèque d'environ 40 000 CD.
  — Seattle Times, 2005-10-15, https://archive.seattletimes.com/archive/20051015/webradio15/tiny-seattle-station-emerges-as-leading-force-in-indie-radio
- [S] **BBC 6 Music** : structure A/B/C comme Radio 1 ; depuis novembre 2024, chaque mardi la réunion
  examine toutes les sorties pertinentes de la semaine (fin des « focus dates ») ; le vendredi, un
  titre de la playlist est remplacé par une nouveauté et chaque animateur ajoute une nouveauté de son
  choix. Le nombre de passages par liste et la durée de séjour ne sont pas publiés dans la source.
  — Ben Homewood, Music Week, 2024-11-04, https://musicweek.com/media/read/bbc-6-music-reveals-2024-artists-of-the-year-and-new-playlist-strategy/090776
- [S] **Radio universitaire** : Heavy/Medium/Light ; le « Light » sert à introduire les nouveautés
  pour qu'elles deviennent familières avant de monter ; catégories New → Active → Power → Down →
  Recurrent → Oldies. — Wikipédia « Rotation (music) », https://en.wikipedia.org/wiki/Rotation_(music)
  (source secondaire).
- **FIP, NTS, Radio Nova (Paris)** : je n'ai trouvé **aucune source publique** sur leurs règles de
  renouvellement (FIP : programmation manuelle par une équipe de programmateurs, sans détail sur la
  rotation). Je ne leur attribue donc rien.

[I] Constante commune : une nouveauté a une **durée de vie bornée et courte** (KEXP 6–8 sem.,
Radio 1 ~7 sem.), le passage en recurrent est réservé aux titres prouvés, et **le recurrent a lui
aussi une date de péremption** (Radio 2 : 18 mois ; Billboard : 20 à 78 semaines selon le rang).
Aucune radio citée ne garde un titre indéfiniment au motif qu'il est bien noté, sauf un noyau
explicitement désigné (« core » de MusicMaster Oldies, 94 titres sur 591).

## 3. Streaming et recommandation (sourcé uniquement)

- [S] Effet de simple exposition : l'intérêt monte avec les premières expositions, culmine, puis
  décroît (courbe en U inversé). — Sguerra, Tran, Hennequin (Deezer), « Ex2Vec », RecSys 2023,
  https://arxiv.org/abs/2311.10635
- [S] La consommation de titres familiers est pilotée par l'ennui : l'utilisateur quitte un titre
  quand il s'en lasse et y revient quand l'intérêt est restauré (états « sensibilisation » /
  « ennui »). — Kapoor, Subbian, Srivastava, Schrater, WSDM 2015, p. 233-242,
  https://ir.webis.de/anthology/2015.wsdm_conference-2015.29/
- [S] L'exploration ne s'arrête jamais ; elle se fait par bouffées et cycles saisonniers.
  — Mok, Way, Maystre, Anderson (Spotify Research), ICWSM 2022, 16(1) 663–674,
  https://ojs.aaai.org/index.php/ICWSM/article/view/19324
- [S] La familiarité porte l'engagement à court terme, la découverte façonne la consommation ; il
  faut les équilibrer explicitement. — Mehrotra (Spotify), CIKM 2021, DOI 10.1145/3459637.3481893,
  https://ir.webis.de/anthology/2021.cikm_conference-2021.481/
- [S] Les modèles de mémoire (ACT-R : récence + fréquence des écoutes) prédisent bien la réécoute.
  — Tran et al. (Deezer), arXiv 2025-07, https://arxiv.org/abs/2507.17356
- Pandora : aucune publication de recherche datée trouvée sur la fatigue de répétition ; seulement
  des articles d'opinion. Je ne m'en sers pas.

[I] Ces travaux confirment la logique radio « repos puis retour » (Kapoor) et la nécessité d'une
dose d'exposition minimale pour qu'une découverte devienne familière (Ex2Vec), mais ils ne donnent
**aucun paramètre** transposable à une webradio : je n'en tire pas de chiffres.

## 4. Ce que fait AzuraCast 0.23.8 nativement (lu dans le code et la doc)

Doc : https://www.azuracast.com/docs/user-guide/playlists/ (types de playlists, priorités, plages
horaires et plages de dates). Le reste vient du code `0.23.8`.

| Fonction | Détail vérifié | Fichier |
|---|---|---|
| Types | `default` (General Rotation), `once_per_x_songs`, `once_per_x_minutes`, `once_per_hour`, `custom` | `backend/src/Entity/Enums/PlaylistTypes.php` |
| Ordre | `shuffle` (toute la playlist mélangée puis jouée jusqu'au bout), `random` (tirage indépendant), `sequential` | `Enums/PlaylistOrders.php`, `frontend/.../Playlists/Form/BasicInfo.vue` |
| Poids | `weight` 1 à 25, défaut 3 ; « Larger numbers play more often » | `Entity/StationPlaylist.php`, `BasicInfo.vue` |
| Choix entre playlists | par type et par priorité, puis tirage pondéré (`weightedShuffle`, clé `u^(1/w)`) | `Radio/AutoDJ/QueueBuilder.php` |
| Anti-doublon | `avoid_duplicates` par playlist ; fenêtre station `duplicate_prevention_time_range` en minutes (défaut 120 ; **180 chez AubeSonore**, réglage de la station) ; compare artiste **et** titre ; sinon prend le moins récemment joué | `Radio/AutoDJ/DuplicatePrevention.php`, `StationBackendConfiguration.php` |
| Programmation | plages horaires, `start_date`/`end_date`, `loop_once` | `Entity/StationSchedule.php` |
| Playlist ↔ dossier | rattachement **récursif** (`path LIKE 'dossier/%'`), resynchronisé toutes les 5 min | `Sync/Task/CheckFolderPlaylistsTask.php`, `StationPlaylistFolderRepository.php` |
| Déplacement | `PUT /files/batch` `do=move` : déplacement de fichier, pas de réécriture des balises | `Controller/Api/Stations/Files/BatchAction.php` |

**Absent** : aucune notion de durée de vie d'un titre, de catégorie de repos, de platooning ni
d'expiration par titre (aucun champ de ce genre dans `StationMedia`, `StationPlaylist`,
`StationPlaylistMedia`). Le cycle de vie reste donc côté pipeline ; AzuraCast ne fournit que les
catégories (playlists/dossiers), leurs poids et l'anti-doublon.

[I] Avec `weightedShuffle`, la probabilité qu'une playlist passe en premier vaut `w / Σw`
(échantillonnage pondéré d'Efraimidis-Spirakis à k = 1). Le poids fixe donc la **part d'antenne de la
catégorie**, quelle que soit sa taille, comme les créneaux d'une horloge radio.

## 5. Diagnostic de la règle actuelle

- [I] **Loi de Little** (L = λ·W) : à l'équilibre, le nombre de découvertes à l'antenne (L ≈ 1 600,
  soit 80 % de 2 000) = débit d'entrée (λ) × durée moyenne de séjour (W). Avec λ ≈ 210 à 260 / semaine,
  W ≈ 6 à 7,5 semaines **en moyenne**. Chaque titre gardé indéfiniment retire une place de façon
  permanente : sortir toujours le plus mal noté transforme le haut du classement en stock immobile et
  raccourcit le séjour de toutes les nouveautés. La stagnation n'est pas un réglage mal choisi : elle
  découle mathématiquement de la règle.
- [I] La règle actuelle n'a pas d'équivalent dans les pratiques trouvées : la radio sort par **âge**
  (Move Date, 18 mois, 20 semaines) et met au **repos**, elle ne garde pas par score.
- [I, constat dans le code] `remove_excess` retire au plus `max_removals_per_pass = 50` titres par passe,
  et la passe est hebdomadaire (`deploy/systemd/radio-weekly.timer`, dimanche 03:00) pour ~260 entrées
  par semaine : une fois les premiers titres à 60 jours, le plafond de 2 000 dérivera de ~200 titres
  par semaine. À vérifier sur une vraie passe (`radio/antenna/sync.py`, `config/editorial.toml`).

