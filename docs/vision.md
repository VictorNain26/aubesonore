# AubeSonore — vision produit et architecture

Révisée le 2026-10-08 : Musilogy se recentre sur le son (§2). Ce document fixe une direction pour ce qui traverse les pièces : les
produits, qui possède quoi, comment les pièces se parlent. Chaque pièce garde sa conception propre
(`pipeline/docs/vision.md`, `site/CLAUDE.md`, `azuracast/RUNBOOK.md`, `musilogy/docs/conception.md`)
et ne doit pas le contredire. C'est une direction, pas un règlement : une règle se rediscute quand
l'usage ou une mesure la contredit, et quand le système réel contredit ce document, le système a
raison et le document se corrige.

## 1. Une radio, une page par artiste

**AubeSonore** est une webradio de découverte dans la couleur de Victor : des titres qu'on ne
connaît pas, qu'il aurait pu choisir. Son goût (Plex) et ses votes (page privée) décident de ce
qui passe ; les auditeurs écoutent, gardent, apprennent qui joue.

**La page artiste** existe pour tout artiste qui a un MBID. Elle répond à deux questions : *qui
est-ce ?* et *où aller ensuite ?* **Musilogy** est la partie « où aller ensuite » de cette page
(§2), et sa porte d'entrée par un nom, la recherche ; ce n'est pas un second type de page. La
radio et les pages se nourrissent : une page amène des auditeurs à l'antenne, l'antenne amène à
ses pages.

**L'objectif du moment est d'attirer des auditeurs.** Au 2026-10-04, la radio n'a pas
d'auditeur régulier : 3 comptes, un seul qui garde des titres. Tout fonctionne donc sans compte ;
le compte personnalise, il ne débloque rien. Les pages artiste, trouvées par un moteur de
recherche, sont le premier moyen d'être découvert.

### 1.1 Le parcours

| Geste | Question | Surface | Ce qui y répond |
|---|---|---|---|
| **Écouter** | « Qu'est-ce qui passe ? » | accueil | le direct, ce qui vient de passer, les plus gardés |
| **Garder** | « Je ne veux pas le perdre » | bibliothèque, compte | aimer, retrouver, être prévenu quand l'artiste repasse |
| **Savoir** | « Qui est-ce ? » | page artiste | portrait, quelques lignes sur lui, où l'écouter, ses albums et EP, vos titres gardés |
| **Découvrir** | « Où aller ensuite ? » | la même page ; la recherche pour y entrer par un nom | les artistes qui ont le même son, avec la raison de chacun ; ses groupes et ceux de ses membres |

Les gestes se bouclent : le titre en cours mène à sa page, et chaque artiste cité sur une page
mène à la sienne. Avoir été joué ajoute des sections à une page (vos titres gardés), pas une autre
page. Une section n'apparaît que si elle a quelque chose à montrer, et chaque page garde le lecteur
du direct.

### 1.2 Ce que les produits ne sont pas

- **Pas un service à la demande.** On écoute le direct ; pour un titre précis, le site mène à une
  plateforme par un lien réel, jamais par une recherche déguisée.
- **Pas une affirmation sans preuve.** Une proximité se dit avec sa raison, mesurée ; une absence
  reste une absence, et la page ne propose rien plutôt que du bruit.
- **Pas de mécanique à l'écran.** Les pages parlent à des auditeurs, avec leurs mots : pas de
  jargon, pas de nom d'outil ni de base de données, pas de licence. Les sources et leurs licences
  sont créditées dans les Mentions légales ; la provenance reste dans les données. Dire d'où vient
  une information en mots simples reste possible quand ça aide à lui faire confiance (« les
  auditeurs de X écoutent aussi »). Un extrait de Wikipédia renvoie à son article, comme sa licence
  l'exige.
- **Pas une boucle de goût.** Ce que les auditeurs gardent ne nourrit pas l'antenne : la radio est
  dans la couleur de Victor, pas dans celle de son audience.
- **Pas une page pour n'importe quel nom.** Une page existe pour un artiste qui a un MBID, ou que
  l'antenne a joué ; jamais pour un nom tapé dans une adresse ou une API.

## 2. Musilogy : où aller ensuite

### 2.1 La promesse

Partir d'un artiste qu'on aime, ou qu'on vient d'entendre, et trouver d'autres artistes **qui ont
le même goût et la même couleur de son** : la même esthétique, le même courant, la même façon de
sonner. Le son est le seul critère de proximité. Ce qui entoure la musique sans en dire le son —
qui cite qui comme influence, sur quel label on sort — n'en est pas un : une vraie parenté se
retrouve dans le son lui-même. Chaque proche dit pourquoi il est là, et chaque nom se suit : on
apprend en marchant d'un artiste à l'autre. La promesse vaut pour tous les artistes, anciens comme
récents, connus comme confidentiels ; là où aucune source fiable ne parle du son d'un artiste, la
page ne propose rien plutôt que du bruit.

### 2.2 Le même son

**Le critère.** Deux artistes sont proches quand ils ont le même goût et la même couleur de son.
Ce que des sources qui décrivent et classent la musique en disent (critiques, articles,
encyclopédies, classements de styles) fait foi pour le juger. À l'échelle de trois millions
d'artistes, aucune ne se lit pour chacun : la page s'appuie sur deux signaux calculables, et les
sources écrites servent à mesurer ces signaux, jamais à être recopiées.

| Signal | Ce qu'il mesure | Source | Seul, sur l'évaluation du 2026-10-07 |
|---|---|---|---|
| **Écoutés par le même public** | le goût : qui aime l'un aime l'autre | notre co-écoute, calculée sur les tops d'écoute de 95 872 auditeurs (export ListenBrainz du 2026-10-01, CC0), corrigée de la popularité (`musilogy/docs/conception.md`, `colisten`) | 64 % de bons, contre 54 % pour le service de ListenBrainz, qui favorise les artistes connus |
| **Du même courant** | la couleur : le genre, le sous-genre, l'époque | trois classements du son, réunis : les styles Discogs de ses disques (environ 600 sous-genres, dump CC0), par décennie ; les genres MusicBrainz, votés ; les genres Wikidata (P136), renseignés par les éditeurs, jamais par l'artiste | 48 % de bons (styles Discogs seuls), trois fois plus d'artistes moins connus ; seul signal pour l'underground : 64 % des artistes de 100 à 999 auditeurs, 32 % de ceux de 1 à 99 |

**Le courant se compare finement.** Deux artistes sont d'autant plus proches qu'ils partagent des
genres précis, à la même époque, dans une part importante de leur œuvre : un sous-genre rare pèse
plus qu'un genre large (« Krautrock » dit beaucoup, « Rock » presque rien) ; la « Synth-pop » de
1982 n'est pas celle de 2015 ; un disque dub sur trente ne fait pas un artiste dub. Les profils se
comparent en proportion, jamais en additionnant les genres communs, qu'un artiste prolifique
gagnerait d'office.

**La précision d'abord.** Une règle se choisit sur la part de bons parmi les proches qu'elle
montre, artiste de référence par artiste de référence, et sur la borne basse de son intervalle de
confiance, jamais sur une moyenne qui cacherait des erreurs. « Même son » se compte à part de la
simple parenté. Mieux vaut trois proches justes que dix dont un faux : la couverture vient
ensuite.

**Aucun signal ne suffit seul ; leur accord est sûr.** Un candidat que les deux trouvent est bon
86 fois sur 100. **« Même son »** est donc le seul classement montré : un proche y entre quand la
co-écoute et le courant s'accordent, et chaque lien garde sa raison en mots d'auditeur (« écoutés
par les mêmes, même courant dans les années 90 »). On ne montre que des proches confirmés, sans
jamais compléter une liste trop courte : leur nombre dépend de ce que les sources disent, et les
plus sûrs (environ huit) passent en tête. Sous le seuil d'auditeurs où la co-écoute cesse d'être
fiable, seul le courant parle, et seulement s'il est assez précis ; sinon la page ne montre aucun
proche. Ce seuil se mesure, il ne se choisit pas.
Un classement est un calcul nommé et documenté, jamais un jugement.

**Ce qui n'est pas une proximité de son, et ne l'est plus sur la page (2026-10-08).**

- **Les influences déclarées** (Wikidata, P737) : ce qu'un artiste dit de lui-même, pas ce qu'il
  sonne. Elles sont rares (9 517 paires) et un punk peut citer un chanteur folk. Une vraie
  parenté se retrouve par le son.
- **Le label** : un fait de scène. Mesuré, 26 % de bons seulement, quelle que soit la taille du
  label.

Le service des artistes similaires de ListenBrainz, remplacé par notre co-écoute, part aussi.

**Une règle n'entre en ligne que mesurée.** Le jeu d'évaluation compte une soixantaine
d'artistes de référence, surtout peu écoutés. Pour chacun, le son de l'artiste et de chaque
candidat est décrit à partir de sources citées (critiques, articles, encyclopédies, pages
Bandcamp, styles Discogs), puis le candidat est jugé : même son, parenté, lointain, étranger. Le
jeu se juge par artiste de référence, jamais par paire ; un écart se donne avec son intervalle de
confiance ; une règle qui gagne en moyenne mais perd sur les artistes peu écoutés est rejetée. Les
règles comparées : le courant seul (affiné comme ci-dessus), la co-écoute seule, leur accord, et
les candidats de la co-écoute reclassés par le courant. Un
échantillon passe à l'oreille de Victor, pour vérifier que le jugement documenté suit le sien. Les
clics des auditeurs départagent plus tard deux règles, sans jamais nourrir la similarité, ce qui
ferait boucle.

**Ce que la page montre d'autre**, des faits, jamais des proximités :

| Information | Question de l'auditeur | Source | État |
|---|---|---|---|
| **Genres** | « Qu'est-ce que c'est ? » | les styles Discogs par époque, sinon les genres MusicBrainz | à faire (§7) |
| **Groupes et projets** | « Où sont allés ses membres ? » | MusicBrainz : appartenances, pseudonymes, changements de nom ; 129 des 161 groupes joués ont au moins un projet de membre qui a un disque (2026-10-05) | en ligne |
| **Albums et EP** | « Qu'a-t-il sorti, par où commencer ? » | MusicBrainz | en ligne |
| **Écouter ailleurs** | « Où l'écouter en entier ? » | les liens que MusicBrainz déclare | en ligne |

**L'audio**, la couleur du son elle-même, n'est pas une source pour tous : les extraits Deezer
sont exclus par leurs conditions (§2.5), AcousticBrainz est mesuré trop faible (AUC 0,65). Les
fichiers de la bibliothèque Plex sont la seule source légale : une piste pour les artistes de la
bibliothèque, plus tard.

**La popularité ne s'affiche pas.** Le nombre d'auditeurs ListenBrainz sert à deux choses
techniques : classer la recherche (« The Beatles » de Liverpool avant le groupe doo-wop de
Philadelphie) et borner les relevés longs, que les limites des API (une requête par seconde)
rendent impossibles sur les 2,98 millions d'artistes. Il ne choisit pas ce qu'une page montre.

### 2.3 La carte et le texte

- **La carte, seule à l'écran** : le temps de gauche à droite, par décennie, l'artiste sur ses
  décennies d'activité, tous ses proches rangés à la décennie de leurs débuts, les plus proches en
  tête et en gras (2026-10-07 : quarante noms posés sur une frise ne se lisaient plus, cent en
  colonnes se lisent). Elle montre les proches « Même son » (§2.2), seulement ceux que les deux
  signaux confirment, les plus sûrs en gras, chacun avec sa raison. Les
  proches sans année de début ferment la section. Un clic mène à la page de l'artiste. Elle
  remplace les listes « avant, pendant, après » ; les influences et le label n'y figurent pas.
- **Lisible sans la voir** : chaque nom de la carte est un lien textuel, que lisent les lecteurs
  d'écran et les moteurs de recherche.
- **Indexée quand elle est riche** : une page est proposée aux moteurs de recherche au-delà d'un
  seuil de contenu ; en deçà, elle existe mais n'est pas listée. La page d'un artiste joué l'est
  toujours. Celle d'un artiste jamais joué l'est quand au moins 10 pages d'artistes joués y
  mènent, qu'elle a un élément Wikidata (le chemin vers son article Wikipédia) et au moins 3
  albums ou EP (`site/apps/backend/src/services/discoveredArtists.ts`). Mesuré le 2026-10-06 : les 398 pages jouées
  mènent à 8 126 artistes jamais joués, 522 depuis au moins 10 pages, environ 490 passent. La
  règle tient la page dans le graphe de la radio : Google traite comme abus les pages assemblées
  en masse depuis d'autres sites, et une masse de pages faibles pèse sur tout le site. Elles ont
  leur propre sitemap, `sitemap-artists-discovered.xml`, pour suivre leur sort dans la Search
  Console avant d'abaisser le seuil.

### 2.4 La page

Un ordre de départ, chaque section seulement quand elle a quelque chose à montrer :

1. **Qui** : le portrait, une ligne de faits au-dessus du nom, le nom, une ligne de genres dessous
   (les styles Discogs par époque, sinon les genres MusicBrainz), l'ouverture de Wikipédia ou, sans
   article, les faits dits en une phrase ; puis où l'écouter ailleurs (Deezer, Spotify, Bandcamp,
   site officiel…), un bouton par plateforme.
2. **Vos titres gardés**, pour un auditeur connecté qui en a gardé, chacun avec l'album d'où il
   vient : ce que la page a de plus personnel, juste sous le haut de page.
3. **Albums et EP**, avec pochette et année, du plus récent au plus ancien : ce que l'artiste a
   voulu sortir. Les albums (studio, bandes originales qu'il a composées, remix) et les EP ; pas
   les singles, compilations, lives, démos ni bootlegs, qui noient l'œuvre dans le catalogue. Une
   longue liste d'EP se replie. Ce qui définit précisément un disque gardé est une règle de
   musilogy (`musilogy/README.md`, `22_releases`), mesurée sur les artistes joués : elle s'ajuste
   quand un cas réel la contredit. Le 2026-10-05, Protomartyr, Bloc Party ou Can gardent leur
   discographie entière, les Beatles s'arrêtent en 1970.
4. **Où aller ensuite** : la carte (§2.3) des proches « Même son », chacun avec sa raison et sa
   place dans le temps ; puis les groupes et projets en trois rubriques plutôt que
   les douze types de relation de MusicBrainz :
   - **Membres** d'un groupe, ou **Groupes** d'une personne, avec leurs années ;
   - **Projets des membres** : leurs autres groupes et projets solo, seulement ceux qui ont un
     disque, pour que chaque lien mène à de la musique, du plus ancien au plus récent, repliés
     au-delà d'une dizaine ;
   - **Autres noms**, sur une ligne : pseudonymes et changements de nom.

   Les relations qui parlent de la vie plutôt que de la musique (famille, professeur, musicien de
   tournée, groupe hommage) restent hors de la page.

**Le portrait**, puisqu'aucune source ne couvre tous les artistes : la photo Deezer (lien déclaré
dans MusicBrainz pour 96 % des artistes joués, 45 % des artistes à 500 auditeurs ou plus, 8 % de
tous), sinon la pochette du premier album, ou du premier EP (Cover Art Archive : 321 des 336
artistes joués, 199 sur 300 artistes à 500 auditeurs ou plus tirés au hasard, 2026-10-05), sinon le
visuel « onde » que le site génère. Chaque page a une image, toutes ne sont pas des photos. La
photo et les pochettes Deezer posent une question de licence (§2.5). L'image Wikidata/Commons attend :
chaque image a sa licence et son auteur à créditer à côté d'elle. Les identifiants Deezer peuvent
aussi venir des ISRC des enregistrements du dump, vérifiés comme ceux de l'antenne (§4.4).

### 2.5 Les licences

Revue du 2026-10-06, textes lus ce jour-là ; ce n'est pas un avis juridique.

| Source | Pour nous | Ce qui le dit |
|---|---|---|
| dumps MusicBrainz, Discogs, Wikidata | libres (CC0) | data.discogs.com : « made available under the CC0 No Rights Reserved license » |
| export des statistiques ListenBrainz (notre co-écoute) | libre (CC0) | metabrainz.org/datasets/postgres-dumps : les données ListenBrainz sont publiées en CC0 ; il remplace le service des artistes similaires, dont la licence n'était pas affichée |
| API Discogs | pas pour ce qui est publié | ses conditions imposent fraîcheur et mention de Discogs : tout ce que la page montre vient des dumps |
| API Deezer | usage privé seulement | developers.deezer.com/termsofuse §IV : « The use of the Content is limited to a strictly private use within a family scope », pas de « data » générée, pas d'association à une marque. Les extraits ne servent donc pas au son publié ; le portrait et les pochettes que le site affiche sont à régulariser par un accord écrit (§IX) ou à remplacer par des images sous licence connue |
| Spotify, Apple, YouTube, SoundCloud | exclus | analyse ou copie du contenu interdites par leurs conditions |
| modèle Discogs-EffNet (pipeline) | non commercial | essentia.upf.edu : CC BY-NC-SA ou BY-NC-ND selon la page ; tient tant qu'AubeSonore n'a aucun revenu |

## 3. Principes communs

1. **Le flux d'abord.** Rien (tâche lourde, déploiement, sauvegarde) ne doit couper l'antenne ;
   AzuraCast est prioritaire sur le CPU, chaque conteneur a un plafond de mémoire.
2. **Rien n'est affirmé sans source.** Une valeur dérivée voyage avec sa provenance, une absence
   reste une absence (`null`, jamais zéro), et le texte du site ne promet rien que le système ne
   fasse.
3. **Identifier, ne pas deviner.** Un titre et un artiste se reconnaissent par un identifiant
   standard (ISRC, MBID, identifiant Deezer) ; le nom ne sert qu'en dernier recours, lié à un
   titre joué (§4.4).
4. **Une donnée, un propriétaire ; un fait, une source** (§4.1, §4.5).
5. **Ne pas réinventer.** Un outil existant, maintenu, vérifié le jour du choix ; le code maison est
   la colle.
6. **Chaque information sert la découverte.** Ce qu'une page montre répond à une question
   d'auditeur et mène à de la musique ; ce qui n'aide pas (rééditions, vie privée, fiches de base
   de données) reste dans les sources, rechargeable. Une fonction qui ne prouve pas son utilité est
   retirée.
7. **Les données déclarées d'abord, les heuristiques assumées.** Une règle sur un fait (une date,
   un type, une appartenance) s'appuie de préférence sur ce que des humains ont déclaré (types et
   statuts MusicBrainz, natures Wikidata). La proximité, elle, ne se déclare pas : elle se mesure
   sur le son (§2.2). Une
   heuristique est permise quand elle est mesurée, documentée et dite comme telle : la popularité
   classe la recherche et borne les relevés, un seuil choisit qui est relevé. Le profil par défaut
   de Lidarr fait les mêmes choix sur MusicBrainz (albums sans type secondaire, statut officiel).
8. **Mesurer avant de décider, et revenir sur une décision quand la mesure change.** Une règle se
   mesure sur les artistes joués, avec des exemples gardés et écartés ; la mesure s'écrit là où la
   décision est prise.
9. **Un seul style**, sobre et doux, en français et en anglais ; aucune interface expliquée par une
   légende.

## 4. Architecture

### 4.1 Les pièces et ce qu'elles possèdent

| Pièce | Rôle | Possède (seule à écrire) | Lit |
|---|---|---|---|
| `azuracast/` | diffuser | l'antenne : médias et leurs métadonnées, playlists, historique de diffusion | — |
| `pipeline/` | choisir ce qui passe | le goût (modèle, votes, candidats) et la bibliothèque d'antenne, qu'il publie par l'API d'AzuraCast avec l'ISRC de chaque titre | Plex (lecture seule), Deezer, Last.fm, Hype Machine, Soulseek |
| `site/` | l'expérience de l'auditeur | comptes, titres gardés, identité des artistes joués, ce que les sources en direct disent d'un artiste (portrait, ouverture de Wikipédia), journal de diffusion | AzuraCast (lecture seule), Deezer, Wikipédia, le schéma `musilogy` |
| `musilogy/` | ce qui se sait d'un artiste, hors ligne | ses tables, produites depuis des sources épinglées et datées, et le schéma `musilogy` de la base du site, qu'il remplace en bloc à chaque `musilogy load` | dumps MusicBrainz et Discogs, relevés MusicBrainz, ListenBrainz et Wikidata |

### 4.2 Les flux

```
 Plex ──lecture──► pipeline ──API : fichier + ISRC──► AzuraCast ──flux MP3──► auditeur
                       ▲                                   │
         votes de Victor (page privée)       now-playing (ISRC compris), historique
                                                           ▼
 dumps et relevés                                        site ◄──── auditeur
 MusicBrainz, Discogs,      ──► musilogy ──musilogy load──► schéma `musilogy` (base du site)
 ListenBrainz, Wikidata
```

### 4.3 Les contrats

| Entre | Contrat | Où il est écrit |
|---|---|---|
| pipeline → AzuraCast | API AzuraCast, dossier `antenne/` ; l'ISRC de chaque titre écrit dans le fichier (trame ID3 `TSRC`), qu'AzuraCast range dans le champ `isrc` du média ; jamais de `PUT /file/{id}`, qui réécrit et supprime les balises | `pipeline/docs/vision.md` §6 et §7.2 |
| site ← AzuraCast | now-playing et historique en lecture, dont `song.isrc` | `site/CLAUDE.md` |
| site ← musilogy | les fonctions SQL de `musilogy/src/musilogy/pg/90_*.sql` : le site n'appelle qu'elles, jamais les tables | `musilogy/docs/conception.md` §4 |
| site ← Deezer, Wikipédia | chacun isolé, autorisé à tomber seul, son dernier résultat gardé en base (§4.6) ; MusicBrainz n'est appelé en direct que pour identifier un titre joué (§4.4) | `site/CLAUDE.md` |

**Couplages interdits** :

- **pipeline ↔ site** : l'antenne ne dépend pas du site, le site ne pilote pas l'antenne ; tout
  passe par AzuraCast, ISRC compris.
- **site → musilogy à l'exécution** : le site lit une copie chargée, jamais le pipeline de
  données ; musilogy peut être en panne, en travaux ou absent sans que le site tombe. Sans copie
  chargée, la page d'un artiste joué garde ce que l'antenne et les sources en direct en savent ;
  celle d'un artiste jamais joué répond qu'elle n'est pas disponible.

### 4.4 L'identité d'un titre et d'un artiste

Le titre se reconnaît par son **ISRC**, l'artiste par son **MBID** (le pivot vers musilogy) et par
son **identifiant Deezer** (portrait, liens d'écoute). Le pipeline connaît l'identifiant Deezer de
chaque titre qu'il publie ; il en tire l'ISRC et l'écrit dans le fichier, où AzuraCast le lit. Le
site résout ensuite, dans cet ordre :

1. **ISRC → MusicBrainz** (`/ws/2/isrc/{isrc}?inc=artist-credits`) : l'artiste crédité qui porte le
   nom joué, sur un enregistrement du titre joué. 32 des 40 titres de l'antenne tirés au hasard y
   sont reconnus (2026-10-04).
2. **ISRC → Deezer** : l'artiste Deezer du titre portant cet ISRC, sous les mêmes conditions.
3. **Le lien Deezer déclaré dans MusicBrainz**, pour compléter l'une des deux identités par l'autre.
4. **Le nom, en dernier recours**, seulement lié à un titre joué et sans homonyme exact.
5. **Rien d'autre.** Un artiste non identifié a sa page avec ce que l'antenne en sait ; l'absence se
   corrige à la source (MusicBrainz), pas par une devinette.

**Un ISRC ne suffit pas seul** : un code peut être déposé sur un autre enregistrement ou crédité à
un autre artiste (en production, le 2026-10-04 : Paul McCartney crédité à Wings, Daniel Avery
déposé sur un titre d'ANNA). Une réponse ISRC n'est retenue que si le titre et l'un des noms
crédités sont ceux joués, une fois normalisés.

Un titre gardé enregistre son ISRC et l'artiste qu'il désigne : c'est ce qui permet à la page de
montrer « vos titres gardés ». Un featuring crédite plusieurs artistes : la page est celle de
l'artiste principal, chaque crédité est relié.

### 4.5 Un fait, une source

| Fait | Source | Pourquoi |
|---|---|---|
| ce que l'antenne a joué | `radio_play` (site) | aucune source externe ne le sait |
| ce que l'auditeur a gardé | `liked_tracks` (site) | idem |
| portrait | Deezer, puis une pochette, puis l'onde (§2.4) | l'image de l'artiste exact quand une source l'a |
| faits (type, lieu, années), liens d'écoute, albums et EP | le dump MusicBrainz, via musilogy | une seule source pour toute page, reproductible |
| ouverture de l'article | Wikipédia (CC BY-SA), via l'identifiant Wikidata du dump | — |
| proches « Même son » (même public, même courant), groupes et projets | musilogy, datés de leurs dumps et relevés | reproductibles, avec leur provenance |

Un artiste plus récent que le dump épinglé n'a pas de faits jusqu'au suivant (§7, étape 9).

### 4.6 Une page artiste qui répond toujours

- **Chaque source tombe seule** : une panne de Deezer ou de Wikipédia vide sa section, jamais la
  page.
- **Le dernier état connu est gardé en base**, pas en mémoire : un redémarrage ou un déploiement ne
  fait pas tout réinterroger, et la page sert le profil connu pendant qu'il se rafraîchit.
- **Jamais de page vide** : l'ouverture de Wikipédia quand l'article existe (FR ou EN : 136 des 149
  artistes joués identifiés, 2026-10-04) ; sinon les faits en une phrase ; sinon le nom et ce que
  l'antenne en a joué.

### 4.7 L'exécution

Une seule machine, partagée avec d'autres services (victorserv, 16 Go). Faute de budget, c'est un
choix assumé, et il impose :

- **des plafonds de mémoire** sur chaque conteneur, `systemd-oomd` sur les tâches de l'utilisateur,
  un chien de garde matériel ;
- **les tâches lourdes plafonnées** (`systemd-run --scope`, `musilogy/CLAUDE.md`) ;
- **le déploiement par fusion sur `master`**, tiré par un timer, jamais pendant la passe
  hebdomadaire ;
- **des sauvegardes sur un disque distinct**, dont les médias de l'antenne (restic, quotidien) ;
- **une surveillance par Gatus**, chaque tâche planifiée envoyant son battement de cœur.

Risques acceptés tant que leur déclencheur ne s'est pas produit :

| Risque | Déclencheur de révision |
|---|---|
| le flux passe par Cloudflare Tunnel, contre ses conditions CDN (audio « disproportionné ») | un avis de Cloudflare, ou le palier P1 de `site/docs/scaling-roadmap.md` |
| aucune copie hors de la maison | dès qu'un stockage gratuit (B2 ou R2, 10 Go) est ouvert |
| une seule machine : si elle tombe, la radio se tait | un budget d'hébergement (≈ 12 € HT/mois au 2026-10-03) |

## 5. Les surfaces

| Surface | Route | Indexée | Geste |
|---|---|---|---|
| Accueil | `/`, `/en` | oui, pré-rendue | Écouter |
| Page artiste | `/artiste/:slug` (`/en/artist/:slug`) ; `/artiste/:mbid` tant que l'artiste n'a pas de slug ; un slug par artiste, jamais réattribué | au-delà d'un seuil de contenu (§2.3), décidé par le serveur | Savoir, Découvrir |
| Musilogy | `/musilogy` (recherche) ; `/musilogy/:mbid/…` renvoie en 301 à la page artiste | non | Découvrir |
| Connexion | `/connexion`, `/en/sign-in` | non | Garder |
| Bibliothèque, compte | panneau et menu de l'en-tête | non | Garder |

## 6. Écarts actuels

1. **Statut officiel incomplet** : la page écarte les disques que MusicBrainz ne montre pas
   comme l'œuvre de l'artiste (476 des 4 980 disques des artistes joués, 2026-10-06) ; seuls les
   artistes d'au moins 500 auditeurs sont interrogés, désormais tous types confondus, EP compris
   (partie du 2026-10-06, épinglée le 2026-10-07).
2. **La découverte ne suit qu'un signal, et il favorise les artistes connus** : les proches de la
   page viennent du seul service de co-écoute ListenBrainz, dont 80 % des voisins sont plus connus
   que l'artiste et qui ne couvre pas les artistes de moins de 1 000 auditeurs environ ; la page
   montre encore les influences déclarées. « Même son » (notre co-écoute et le courant d'accord)
   reste à faire (§7, étape 9).
3. **Les pages d'artistes jamais joués qui passent le seuil restent à leur MBID** :
   `/artiste/<mbid>`, sans slug (étape 7.5).
4. **Identité incomplète** : 52 des 397 artistes joués n'ont pas de MBID (2026-10-06). Le lien
   Deezer déclaré dans Wikidata en rattrape 3 (Tocotronic, Talulah Gosh, Romane Santarelli) ; les
   autres n'ont aucun lien vers Deezer dans MusicBrainz, ce qui se corrige à la source. 22 des 91
   titres gardés ne retrouvent ni leur passage ni leur titre exact chez Deezer.
5. **Relevés incomplets** : musilogy publie tous les types d'artistes, sauf les 12 artistes à
   usage spécial (les 674 240 sans type, 17 790 personnages et 6 572 « autres » s'ajoutent), mais
   la co-écoute ne couvre que les artistes d'au moins 500 auditeurs que le service a relevés, tous
   types depuis la partie du 2026-10-06 (épinglée le 2026-10-07).
6. **Les featurings ne relient que l'artiste principal** (§4.4).
7. **Licences à régulariser** : le portrait et les pochettes Deezer (§2.5).
8. **Aucune copie hors de la maison** (§4.7).

## 7. Feuille de route

Dans cet ordre, en PR courtes fusionnées une à une. Les étapes 1 à 6 (vision, retraits, identité
par ISRC, page artiste, musilogy refondu, Musilogy en ligne) sont faites ; leur détail est dans
l'historique git.

7. **Un artiste, une page** (écarts 1 et 3) :
   1. musilogy : albums et EP et liens d'écoute — fait (#337, #338) ; le relevé du statut
      officiel MusicBrainz (#340, pris le 2026-10-05) et la règle qui s'en sert (#408) — fait ; les groupes et projets du §2.4 : `links` réduite aux appartenances, aux
      pseudonymes et aux changements de nom, et une fonction SQL par rubrique ;
   2. le site lit faits et liens d'écoute dans musilogy (#344), le portrait en cascade (#346) —
      fait ;
   3. une seule page, `/artiste/…`, sections dans l'ordre du §2.4 (#347), le fil de découverte
      (#348), une page pour tout MBID et `/musilogy/:mbid` en 301 (#352) — fait ;
   4. le serveur écrit le titre, la description et le canonique de chaque page, répond 404 pour un
      MBID inconnu et `noindex` pour une page par MBID — fait (#352) ;
   5. une fois les proches en ligne : le seuil d'indexation mesuré (§2.3) — fait ; un slug pour
      chaque page qui le passe — à faire.

   Le rendu React côté serveur des pages artistes est fait (#394 à #398) : les robots des
   assistants IA ne rendent pas le JavaScript, et la page arrive dessinée (LCP sur un téléphone
   simulé, document servi en local : ~2,9 s → ~0,6 s). Un service `renderer`, construit avec le site, dessine la page ;
   au-delà de 300 ms le backend envoie la page vide, que le client remplit.
8. **Les proches en ligne** — fait (#293, chargé le 2026-10-06).
9. **La découverte refondue** (écarts 2 et 5), en PR courtes. Le site n'a pas encore de public :
   chaque PR remplace pour de bon, et retire dans la même PR ce qu'elle rend inutile. Les sources
   restent séparées : une source, ses tables ; les ponts entre bases sont des tables ; les
   combinaisons vivent dans une couche dérivée qui ne réécrit jamais une source
   (`musilogy/docs/conception.md` §1).
   1. **Population complète** — fait (#406 à #409, chargé le 2026-10-07) ; les relevés
      complémentaires de co-écoute et de statut officiel (2026-10-06) sont épinglés (2026-10-07).
   2. **Discogs** : le dump des sorties épinglé, la table des styles par décennie — fait (#413) ;
      la table des labels part avec le label (§2.2).
   3. **L'évaluation** — premier tour fait (2026-10-07 : 20 artistes, 515 candidats). À faire :
      une soixantaine de références, surtout peu écoutées, chaque son décrit depuis des sources
      citées avant d'être jugé (§2.2) ; l'oreille de Victor sur un échantillon. Elle mesure la
      co-écoute par tranche d'auditeurs, le courant, et leur accord, et fixe le seuil sous lequel
      la page ne montre rien.
   4. **Notre co-écoute** — calculée et publiée (#451 : 50 voisins pour 371 582 artistes,
      cosinus asymétrique et lissage, mesurée meilleure que le service). Elle ne va sur la page
      qu'avec « Même son », au-dessus du seuil mesuré.
   5. **« Même son »** : une table calculée hors ligne (artiste, proche, signaux, raison, rang) où
      un proche entre quand la co-écoute et le courant s'accordent, le courant seul sous le seuil
      d'auditeurs ; une fonction SQL ; la carte et la ligne de genres sur la page.
   6. **Ce qui part**, chacun dans la PR qui le remplace : les influences déclarées (relevé
      Wikidata, table, fonction, marques et rubrique de la page), la table des labels, le relevé
      du service des artistes similaires de ListenBrainz avec sa mécanique de parties, et
      `artist_neighbours`, remplacée par la fonction « Même son ». Déjà partis (2026-10-07) :
      `artist_links`, que le site n'appelait plus, et les copies de l'étude sur le serveur.
   7. **Ensuite, sur mesure** : relier plus d'artistes à Discogs par les sorties que MusicBrainz y
      relie, adopté seulement à 99 % de justesse mesurée ; l'audio pour les artistes de la
      bibliothèque.
10. **Les données à jour** : un dump MusicBrainz plus récent, le dump Discogs mensuel et les
    relevés rapides refaits régulièrement par un timer (dumps, relevés, invariants, publication,
    chargement) ; les relevés longs avancent en incrémental, sur les nouveaux artistes. La
    référence des tests reste figée.
11. **À décider sur mesure** : les liens d'œuvre (écart 6) — featurings, remixes, producteurs,
    tirés du dump MusicBrainz.

En parallèle : la copie hors site dès qu'un compte de stockage existe.
