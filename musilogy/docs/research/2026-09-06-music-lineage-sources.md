# Découverte par filiation — état de l'art et cadrage

**Date :** 2026-09-06
**Statut :** dépassée. La filiation tirée de MusicBrainz a été abandonnée ; la conception en vigueur est `docs/conception.md` (2026-10-04) et la découverte suit `docs/vision.md` §2.
**Objet :** un outil de digg qui, à partir d'un artiste, propose des contemporains
similaires **et** des précurseurs, chaque lien étant adossé à une source vérifiable.

---

## 0. Point de départ réel

Ce n'est pas un projet greenfield. AubeSonore livre déjà, sur la branche
`feat/artist-discovery-page` (15 commits) :

- une page `/artist/:id` avec mini-player persistant et OG tags injectés côté serveur ;
- une cascade d'enrichissement `deezerService` + `lastfmService` + `musicbrainzService`,
  chacune avec `TtlCache`, circuit breaker et single-flight ;
- une table `artist` portant `id`, `normalizedName`, `displayName`, `slug`,
  **`deezerId`, `mbid`** ;
- `artistResolver` : résolution d'identité canonique persistée (nom AzuraCast brut → id stable).

Trois conséquences directes :

1. **Le MBID comme clé pivot existe déjà en base.** C'est exactement la clé qui permet de
   raccorder ListenBrainz, Last.fm et les jeux de données académiques. Rien à refaire.
2. **La similarité contemporaine est déjà branchée**, via Deezer `/artist/{id}/related`
   (keyless, images incluses).
3. La question n'est donc pas « que construire », mais **« quelle couche ajouter par-dessus »**.

---

## 1. Le constat central

| Besoin | État |
|---|---|
| Artistes contemporains similaires | **Résolu**, et déjà en production |
| Précurseurs / filiation / influences | **N'existe nulle part comme donnée libre** |

Toute la valeur du projet est dans la seconde ligne. L'influence est un jugement éditorial,
pas un champ de base de données — ce qui explique son absence des sources ouvertes.

---

## 2. Sources — verdict par brique

### 2.1 À garder — libre et exploitable

| Source | Apport | Licence | Branché ? |
|---|---|---|---|
| **MusicBrainz** | Identité, relations factuelles, œuvres | **CC0** (core) ; tags/ratings en CC BY-NC-SA | Oui (API) |
| **Discogs** | Membres, alias, crédits, labels → graphe de scène | **CC0** (dumps mensuels) | Non |
| **ListenBrainz Labs** | Similarité par co-écoute, indexée MBID | **CC0** | Non |
| **Deezer** `/artist/{id}/related` | Similaires + images | Keyless, ToS Deezer | Oui |
| **Wikipédia** | Prose + références | **CC BY-SA** | Non |
| **Wikimedia Enterprise Structured Contents** | Infoboxes parsées, sections, références en JSON | Tier gratuit | Non |

Deux points vérifiés qui comptent :

- **MusicBrainz n'a aucun type de relation « influenced by ».** Liste complète des relations
  artiste→artiste : membre de groupe, sous-groupe, renommage, directeur artistique, chef
  d'orchestre, fondateur, musicien de soutien, hommage, doubleur, collaboration, est une
  personne, professeur, artiste en résidence, plus les liens personnels. C'est un choix de
  projet, pas un oubli — inutile d'attendre que ça change.
- **L'infobox Wikipédia « musical artist » n'a aucun champ influences**, et `associated_acts`
  est déprécié. L'information n'existe que dans la prose, sections « Musical style and
  influences » — mais elle y arrive **avec ses références**. L'extraction est obligatoire ;
  la citation est offerte.

### 2.2 Écarté — définitivement

| Source | Raison |
|---|---|
| **Spotify** `related-artists`, `recommendations`, `audio-features` | Coupé aux nouvelles apps depuis le **2024-11-27**. Déjà écarté par le spec artist-discovery. |
| **Wikidata P737 « influenced by »** | **2 426 entités musicales au total** (requête SPARQL exécutée). Trop creux pour servir de source primaire. |
| **WhoSampled** | Pas d'API publique. **Racheté par Spotify en novembre 2025.** |
| **RateYourMusic** | Scraping explicitement interdit, et depuis toujours. Seule porte légitime : le formulaire « register interest for Sonemic API / data feed ». |
| **Kùzu** (base graphe embarquée) | **Racheté par Apple en octobre 2025, dépôt archivé.** Ne pas construire dessus. |

### 2.3 Sous condition — le point de bascule du projet

Les trois amorces qui feraient gagner des mois sont toutes grevées :

| Amorce | Contenu | Licence |
|---|---|---|
| **Crawl AllMusic** — `github.com/flaviovdf/allmusic-disruption`, `data/artists.json.gz` | **32 568 artistes, 119 961 arêtes d'influence éditoriale**, 1940-2019 | **Aucune licence déclarée** |
| **WASABI RDF KG** — Zenodo 4312641, 402 Mo | 2 M titres, 200 K albums, **77 K artistes**, en RDF | **CC BY-NC 4.0** — non commercial |
| **Troi** — `metabrainz/troi-recommendation-playground` | Moteur de reco par pipelines, similarité artistes, actif (871 commits) | **GPL-2.0** — contaminant |

Et deux sources éditoriales de haute qualité, fermées :

- **Rock's Backpages** : 56 000+ articles de presse musicale depuis les années 50.
  Abonnement individuel ou institutionnel, aucune API documentée.
- **SecondHandSongs** : API REST des reprises, gratuite en usage privé, **autorisation écrite
  requise** au-delà.

---

## 3. Outillage — ce qu'on ne réécrit pas

| Besoin | Solution existante |
|---|---|
| Import des dumps MusicBrainz | `metabrainz/musicbrainz-docker`, ou `mbdata` pour la base seule (PostgreSQL 18+) |
| Import des dumps Discogs | `philipmat/discogs-xml2db` |
| Extraction Wikipédia | Wikimedia Enterprise Structured Contents (JSON, tier gratuit) ; repli `mwparserfromhell` (wikitext) ou `mwparserfromhtml` (HTML des dumps) |
| Modèle de données | **Music Meta** (Polifonia), aligné sur Music Ontology, DOREMUS et Wikidata |
| Stockage du graphe | **Postgres + CTE récursives suffit** à cette échelle (~32 K nœuds / 120 K arêtes). Apache AGE en repli sans changer de base. La stack est déjà Postgres + Drizzle. |
| Rendu | **Sigma.js + graphology** (WebGL, gros graphes) ; **Cytoscape.js** si le graphe devient un objet d'analyse |

### Couche LLM — une contrainte d'architecture

L'**API Citations** de Claude est le mécanisme adapté : `citations: {enabled: true}` sur les
blocs `document`, réponse découpée en blocs portant `cited_text` et la position exacte dans la
source (`char_location` / `page_location`). Pas de header beta.

**Contrainte vérifiée : Citations est incompatible avec les sorties structurées**
(`output_config.format`) — la combinaison renvoie une **400**. Or le pipeline veut des triplets
structurés *et* cités. Il faut donc **deux passes** (extraction citée, puis structuration), ou
un format textuel parsé côté client. À intégrer dès la conception, pas après.

---

## 4. Concurrence — la niche est libre

| Existant | Ce qu'il fait | Ce qui manque |
|---|---|---|
| **Every Noise at Once** | Cartographie de genres | **Figé depuis décembre 2023** (départ de son auteur de Spotify) |
| **Musicmap**, **Ishkur's Guide** | Généalogie avec texte explicatif | Niveau **genre**, pas artiste |
| **Music-Map**, **Last.fm similar** | Listes de similaires | Aucune justification |
| **AllMusic** | Relations « Influenced By / Followers » + bios éditoriales | Pas d'API publique |
| **RateYourMusic** | La meilleure écriture éditoriale | Ni graphe navigable ni API |
| Écosystème *arr — **sonobarr** (384★), **digarr** (283★), **mixarr** (154★) | Découverte IA pour remplir une bibliothèque | Répondent à « que télécharger », pas à « d'où vient ce son » |
| **fsahin/artist-explorer** | Arbre de relations entre artistes | Source de données **non vérifiée** — si c'est Spotify, mort depuis 2024-11-27 |

**Personne ne fait les trois ensemble : filiation au niveau artiste + explication sourcée + navigable.**

---

## 5. Décisions ouvertes

- **D1 — Périmètre.** Couche supplémentaire de la page artiste AubeSonore, ou produit séparé ?
- **D2 — Statut commercial.** Commande directement la table 2.3 : en non-commercial on prend
  WASABI, Troi et le crawl AllMusic ; en commercial il ne reste que le CC0 et Wikipédia.
- **D3 — Amorce du graphe d'influence.** Découle de D2.
- **D4 — Profondeur du corpus.** Toute la musique (bon sur le canon, creux dans la longue traîne)
  ou une scène dense d'abord ?

---

## 6. Acquis quelle que soit la décision

1. **Le MBID est la clé pivot**, et il est déjà en base (`artist.mbid`).
2. **L'agent cite, il n'affirme pas.** Aucune arête sans source ; « aucune source » est une
   réponse valide et devient elle-même une information.
3. **Postgres suffit** — pas de base graphe dédiée à cette échelle.
4. **Aucune ingestion à écrire** — les importeurs de dumps existent et sont maintenus.
5. **La qualité plafonne à celle du corpus.** Riche sur les artistes documentés, mince sur les
   obscurs — c'est-à-dire précisément là où l'on digge. C'est la tension centrale du projet.

---

## Sources

- MusicBrainz — relations artiste-artiste : https://musicbrainz.org/relationships/artist-artist
- MusicBrainz — base et licences : https://musicbrainz.org/doc/MusicBrainz_Database
- Wikidata P737 : https://www.wikidata.org/wiki/Property:P737
- Spotify — changes to the Web API (2024-11-27) : https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api
- Last.fm `artist.getSimilar` : https://www.last.fm/api/show/artist.getSimilar
- Discogs Data : https://data.discogs.com/
- Surprising Patterns in Musical Influence Networks : https://arxiv.org/html/2410.15996v1
- Crawl AllMusic : https://github.com/flaviovdf/allmusic-disruption
- ListenBrainz — artist similarity graph : https://blog.metabrainz.org/2023/08/28/gsoc-23-artist-similarity-graph/
- Troi : https://github.com/metabrainz/troi-recommendation-playground
- WASABI RDF KG : https://zenodo.org/records/4312641
- Polifonia — Music Meta : https://github.com/polifonia-project/music-meta-ontology
- SecondHandSongs API : https://secondhandsongs.com/page/API
- RYM — Sonemic API interest : https://rateyourmusic.com/data-access/register-interest/
- Rock's Backpages — licensing : https://www.rocksbackpages.com/Pages/Licensing
- Every Noise at Once : https://en.wikipedia.org/wiki/Every_Noise_at_Once
- Musicmap : https://musicmap.info/
- Template:Infobox musical artist : https://en.wikipedia.org/wiki/Template:Infobox_musical_artist
- Wikimedia Enterprise — Structured Contents : https://enterprise.wikimedia.com/api/structured-contents/
- musicbrainz-docker : https://github.com/metabrainz/musicbrainz-server/blob/master/INSTALL.md
- discogs-xml2db : https://github.com/philipmat/discogs-xml2db
- Kùzu — statut : https://gdotv.com/blog/kuzu-legacy-embedded-graph-database-landscape/
- GitHub topic `music-discovery` : https://github.com/topics/music-discovery
