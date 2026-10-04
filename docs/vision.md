# AubeSonore — vision produit et architecture

Refonte du 2026-10-04, à valider par Victor. Elle remplace la version du 2026-10-03, dont le
geste « Explorer » (frise des genres, filiation tirée de MusicBrainz, contemporains par lieu de
début) ne répondait pas à la question posée et reposait sur des données qui ne la remplissaient
pas. Validé, ce document fait autorité sur ce qui traverse les pièces : les produits, qui possède
quoi, comment les pièces se parlent. Chaque pièce garde sa conception propre —
`pipeline/docs/vision.md` (l'antenne), `site/CLAUDE.md` (le site), `azuracast/RUNBOOK.md` (la
diffusion), `musilogy/` (à réécrire, §8) — et ne doit pas le contredire. Quand le système réel le
contredit, le système a raison et ce document se corrige.

## 1. Deux produits, une radio

**AubeSonore** est une webradio de découverte dans la couleur de Victor : des titres qu'on ne
connaît pas, qu'il aurait pu choisir. Son goût (Plex) et ses votes (page privée) décident de ce
qui passe ; les auditeurs écoutent, gardent, apprennent qui joue.

**Musilogy** fait comprendre d'où vient une musique : pour n'importe quel artiste, ce qui l'a
précédé dans la même veine, ce qui jouait à côté de lui, ce qui l'a suivi, et les liens de ses
membres. C'est un produit à part, avec sa propre promesse (§2), relié à la radio dans les deux
sens : Musilogy amène des auditeurs à l'antenne, l'antenne amène à Musilogy.

**L'objectif du moment est d'attirer des auditeurs.** Au 2026-10-04, la radio n'a pas
d'auditeur régulier : 3 comptes, un seul qui garde des titres (89). Tout doit donc fonctionner
sans compte ; le compte personnalise, il ne débloque rien.

### 1.1 Le parcours

| Geste | Question | Surface | Ce qui y répond |
|---|---|---|---|
| **Écouter** | « Qu'est-ce qui passe ? » | accueil | le direct, ce qui vient de passer, les plus gardés |
| **Garder** | « Je ne veux pas le perdre » | bibliothèque, compte | aimer, retrouver, être prévenu quand l'artiste repasse |
| **Savoir** | « Qui est-ce ? » | page artiste | portrait, ouverture de Wikipédia ou portrait factuel, vos titres gardés de l'artiste, où l'écouter |
| **Comprendre** | « D'où vient cette musique ? » | la même page artiste, ou Musilogy pour un artiste jamais joué | la carte de l'artiste : avant, pendant, après, influences déclarées, liens de groupe |

Les gestes se bouclent : le titre en cours mène à sa page artiste, qui porte aussi ce que Musilogy
sait de lui. **Un artiste, une page** (depuis le 2026-10-04) : la page artiste réunit qui il est et
sa place dans l'histoire de sa musique, chaque section seulement quand elle a quelque chose à
montrer. Musilogy garde sa recherche et une page pour les artistes que l'antenne n'a jamais joués ;
celle d'un artiste joué renvoie à sa page artiste. Chaque page garde le lecteur du direct.

### 1.2 Ce que les produits ne sont pas

- **Pas un service à la demande.** On écoute le direct ; pour un titre précis, le site mène à
  une plateforme par un lien réel, jamais par une recherche déguisée.
- **Pas une affirmation sans preuve.** Une proximité calculée n'est jamais présentée comme une
  influence (§2.2), une absence reste une absence.
- **Pas de technique à l'écran.** Les pages parlent à des auditeurs : aucune source de données,
  licence ni outil n'y est nommé ou lié (ni ListenBrainz, ni MusicBrainz, ni Wikidata), aucun
  jargon. La distinction entre une proximité et une influence se dit avec des mots d'auditeur.
  Les sources et leurs licences sont créditées dans les Mentions légales, la provenance reste dans
  les données. Seule exception, exigée par sa licence : un extrait de Wikipédia renvoie à son
  article (« Lire la suite sur Wikipédia »).
- **Pas une boucle de goût.** Ce que les auditeurs gardent ne nourrit pas l'antenne : la radio
  est dans la couleur de Victor, pas dans celle de son audience.
- **Pas une page artiste pour n'importe quel nom.** Une page artiste n'existe que pour un artiste
  que l'antenne a joué ; Musilogy couvre tout artiste qui a un MBID.

## 2. Musilogy

### 2.1 La promesse

Ouvrir un artiste et voir sa place dans l'histoire : qui faisait déjà cette musique avant lui,
qui la faisait en même temps, qui l'a reprise après ; qui il a cité comme influence ; dans quels
groupes ses membres ont joué. Chaque lien se suit, et la carte se recentre : on apprend en
marchant d'un artiste à l'autre.

### 2.2 Trois couches, trois niveaux de preuve

| Couche | Source | Couverture mesurée | Ce que le site en dit |
|---|---|---|---|
| **Proximité × temps** | artistes proches selon ListenBrainz (co-écoute), rangés par leurs dates MusicBrainz | 15 des 16 artistes joués échantillonnés ont 100 voisins, des plus confidentiels (1 045 auditeurs) aux plus connus (2026-10-04) | « avant lui, en même temps, après lui, dans la même veine » — jamais « influencé par » |
| **Influences déclarées** | Wikidata (P737), puis citations extraites de Wikipédia avec leur phrase | 61 des 288 artistes joués via Wikidata (2026-10-04) | « a cité X comme influence » ; la déclaration reste en base, sans lien à l'écran (§1.2) |
| **Liens de groupe** | relations entre artistes de MusicBrainz | 75 % des artistes joués ont au moins un autre projet à deux pas, médiane 2 (2026-10-04) | « membre de », « autre projet de » |

La proximité seule ne dit pas qui a inspiré qui ; le temps lui donne un sens (avant, pendant,
après), et l'influence déclarée, quand elle existe, prime sur elle et se voit. Le classement
d'une couche est un calcul nommé, documenté, jamais un jugement.

### 2.3 La carte et le texte

- **La carte** : le temps de gauche à droite, l'artiste au centre sur ses années d'activité ; les
  artistes proches posés à leur année de début, d'autant plus près de l'axe qu'ils sont proches ;
  les influences déclarées et les liens de groupe dessinés par-dessus. Un clic recentre. La
  disposition est fixée par les dates, pas par une simulation de forces : elle reste lisible.
- **Le texte** : sous la carte, la même chose en phrases et en listes (les sources sont créditées
  dans les Mentions légales, §1.2). C'est ce
  que lisent les lecteurs d'écran et les moteurs de recherche.
- **Indexée quand elle est riche** : une page Musilogy est proposée aux moteurs de recherche
  au-delà d'un seuil de contenu à mesurer ; en deçà, elle existe mais n'est pas listée.

### 2.4 Conditions préalables

- **Licence de la similarité ListenBrainz** : le service (`labs.api.listenbrainz.org`) ne la
  publie pas sur sa page ; MetaBrainz publie ses jeux de données en CC0. À confirmer avant de
  publier quoi que ce soit qui en dérive.
- **Service expérimental** : musilogy en fait des relevés datés, stockés chez nous comme la
  popularité ; le site ne l'appelle jamais à chaud.

## 3. Principes communs

1. **Le flux d'abord.** Rien — tâche lourde, déploiement, sauvegarde — ne doit couper l'antenne ;
   AzuraCast est prioritaire sur le CPU (`cpu_shares`), et chaque conteneur a un plafond de
   mémoire.
2. **Rien n'est affirmé sans source.** Une valeur dérivée voyage avec sa provenance, une absence
   reste une absence (`null`, jamais zéro), et le texte du site ne promet rien que le système ne
   fasse.
3. **Identifier, ne pas deviner.** Un titre et un artiste se reconnaissent par un identifiant
   standard (ISRC, MBID, identifiant Deezer), jamais par la seule ressemblance d'un nom (§4.4).
4. **Une donnée, un propriétaire ; un fait, une source** (§4.1 et §4.5).
5. **Rien d'inventé.** Un outil existant, maintenu, vérifié le jour du choix ; le code maison est
   la colle. Un mécanisme qui ne prouve pas son utilité est retiré.
6. **Mesurer avant de décider**, et écrire la mesure là où la décision est prise.
7. **Un seul style**, sobre et doux, en français et en anglais ; aucune interface expliquée par
   une légende.

## 4. Architecture

### 4.1 Les pièces et ce qu'elles possèdent

| Pièce | Rôle | Possède (seule à écrire) | Lit |
|---|---|---|---|
| `azuracast/` | diffuser | l'antenne : médias et leurs métadonnées, playlists, historique de diffusion | — |
| `pipeline/` | choisir ce qui passe | le goût (modèle, votes, candidats) et la bibliothèque d'antenne, qu'il publie par l'API d'AzuraCast avec l'ISRC de chaque titre | Plex (lecture seule), Deezer, Last.fm, Hype Machine, Soulseek |
| `site/` | l'expérience de l'auditeur | comptes, titres gardés, identité et profil des artistes joués, journal de diffusion | AzuraCast (lecture seule), Deezer, MusicBrainz, Wikidata, Wikipédia, le schéma `musilogy` |
| `musilogy/` | les données de Musilogy | ses tables, produites hors ligne depuis des sources épinglées et datées, et le schéma `musilogy` de la base du site, qu'il remplace en bloc à chaque `musilogy load` | dumps MusicBrainz, relevés ListenBrainz (popularité, proximité), Wikidata |

### 4.2 Les flux

```
 Plex ──lecture──► pipeline ──API : fichier + ISRC──► AzuraCast ──flux MP3──► auditeur
                       ▲                                   │
         votes de Victor (page privée)       now-playing (ISRC compris), historique
                                                           ▼
 dumps MusicBrainz,                                      site ◄──── auditeur
 relevés ListenBrainz, ──► musilogy ──musilogy load──► schéma `musilogy` (base du site)
 Wikidata
```

### 4.3 Les contrats

| Entre | Contrat | Où il est écrit |
|---|---|---|
| pipeline → AzuraCast | API AzuraCast, dossier `antenne/` ; l'ISRC de chaque titre écrit dans le fichier en trame ID3 `TSRC`, qu'AzuraCast range dans le champ `isrc` du média ; jamais de `PUT /file/{id}`, qui réécrit et supprime les balises | `pipeline/docs/vision.md` §6 et §7.2 |
| site ← AzuraCast | now-playing et historique en lecture, dont `song.isrc` | `site/CLAUDE.md` |
| site ← musilogy | les fonctions SQL de `musilogy/src/musilogy/pg/90_*.sql` : le site n'appelle qu'elles, jamais les tables | conception de musilogy |
| site ← Deezer, MusicBrainz, Wikidata, Wikipédia | chacun isolé, autorisé à tomber seul, son dernier résultat gardé en base (§4.6) | `site/CLAUDE.md` |

**Couplages interdits**, et pourquoi :

- **pipeline ↔ site** : l'antenne ne dépend pas du site, le site ne pilote pas l'antenne ; tout
  passe par AzuraCast, ISRC compris.
- **site → musilogy à l'exécution** : le site lit une copie chargée, jamais le pipeline de
  données ; musilogy peut être en panne, en travaux ou absent sans que le site tombe — Musilogy
  affiche alors son indisponibilité, la page artiste n'en dépend pas.

### 4.4 L'identité d'un titre et d'un artiste

Le titre se reconnaît par son **ISRC**, l'artiste par son **MBID** (le pivot vers Musilogy) et
par son **identifiant Deezer** (portrait, liens d'écoute). Le pipeline connaît l'identifiant
Deezer de chaque titre qu'il publie ; il en tire l'ISRC et l'écrit dans le fichier, où
AzuraCast le lit. Le site résout
ensuite, dans cet ordre :

1. **ISRC → MusicBrainz** (`/ws/2/isrc/{isrc}?inc=artist-credits`) : l'artiste crédité qui porte
   le nom joué, sur un enregistrement du titre joué. 32 des 40 titres de l'antenne tirés au
   hasard y sont reconnus (2026-10-04).
2. **ISRC → Deezer** : l'artiste Deezer du titre portant cet ISRC, sous les mêmes conditions.
3. **Lien Deezer déclaré dans MusicBrainz**, pour compléter l'une des deux identités par l'autre.
4. **Le nom, en dernier recours**, seulement lié à un titre joué (la recherche Deezer garde
   l'artiste du titre joué dont le nom est le même une fois normalisé, et seulement s'il n'a
   pas d'homonyme exact), puis le lien Deezer que MusicBrainz déclare.
5. **Rien d'autre.** Un artiste non identifié a sa page avec ce que l'antenne en sait, sans faits
   ni Musilogy ; l'absence se corrige à la source (MusicBrainz), pas par une devinette.

**Un ISRC ne suffit pas seul** : un code peut être déposé sur un autre enregistrement ou crédité
à un autre artiste. Mesuré en production le 2026-10-04, avant cette vérification : le titre de
Paul McCartney crédité à Wings, celui de Daniel Avery déposé sur un titre d'ANNA, celui des
Pirouettes rendu par un autre titre Deezer. Une réponse ISRC n'est donc retenue que si le titre
et l'un des noms crédités sont ceux joués, une fois normalisés.

Un titre gardé enregistre son ISRC et l'artiste qu'il désigne, au moment où il est gardé : c'est
ce qui permet à la page artiste de montrer « vos titres gardés ». Un featuring crédite plusieurs
artistes : la page est celle de l'artiste principal, chaque crédité est relié.

### 4.5 Un fait, une source

| Fait | Source | Pourquoi |
|---|---|---|
| ce que l'antenne a joué | `radio_play` (site) | aucune source externe ne le sait |
| ce que l'auditeur a gardé | `liked_tracks` (site) | idem |
| portrait | Deezer | l'image de l'artiste exact du titre |
| faits de la page artiste (type, lieu, années) | MusicBrainz, rafraîchis | à jour pour les nouveautés que le dump épinglé ne connaît pas |
| ouverture de l'article | Wikipédia (CC BY-SA), via Wikidata | — |
| proximités, influences, liens de groupe, dates (Musilogy) | musilogy, datés de leurs relevés | reproductibles, avec leur provenance |

La page artiste et Musilogy peuvent donner deux années différentes pour un même artiste : chacune
garde la source de ce qu'elle montre, aucune ne recopie l'autre.

### 4.6 Une page artiste qui répond toujours

- **Chaque source tombe seule** : une panne de Deezer, de MusicBrainz ou de Wikipédia vide sa
  section, jamais la page.
- **Le dernier état connu est gardé en base**, pas en mémoire : un redémarrage ou un déploiement
  ne fait pas tout réinterroger, et la page sert le profil connu pendant qu'il se rafraîchit.
- **Jamais de page vide** : l'ouverture de Wikipédia quand l'article existe (FR ou EN : 136 des
  149 artistes joués identifiés, 2026-10-04) ; sinon un portrait factuel en phrases tiré de
  MusicBrainz ; sinon le nom et ce que l'antenne en a joué.

### 4.7 L'exécution

Une seule machine, partagée avec d'autres services (victorserv, 16 Go). Faute de budget, c'est
un choix assumé, pas une étape provisoire, et il impose :

- **des plafonds de mémoire** sur chaque conteneur, `systemd-oomd` sur les tâches de
  l'utilisateur, un chien de garde matériel ;
- **les tâches lourdes plafonnées** (`systemd-run --scope`, `musilogy/CLAUDE.md`) ;
- **le déploiement par fusion sur `master`**, tiré par un timer, jamais pendant la passe
  hebdomadaire ;
- **des sauvegardes sur un disque distinct**, dont les médias de l'antenne (restic, quotidien) ;
- **une surveillance par Gatus**, chaque tâche planifiée envoyant son battement de cœur.

Risques connus, acceptés tant que leur déclencheur ne s'est pas produit :

| Risque | Déclencheur de révision |
|---|---|
| le flux passe par Cloudflare Tunnel, contre ses conditions CDN (audio « disproportionné », conditions du 2026-09-28) | un avis de Cloudflare, ou le palier P1 de `site/docs/scaling-roadmap.md` |
| aucune copie hors de la maison | dès qu'un stockage gratuit (B2 ou R2, 10 Go) est ouvert |
| une seule machine : si elle tombe, la radio se tait | un budget d'hébergement (CX33 + Storage Box ≈ 12 € HT/mois au 2026-10-03) |

## 5. Les surfaces

| Surface | Route | Indexée | Geste |
|---|---|---|---|
| Accueil | `/`, `/en` | oui, pré-rendue | Écouter |
| Page artiste | `/artist/:id/:slug` | oui | Savoir, Comprendre |
| Musilogy | `/musilogy` (recherche), `/musilogy/:mbid/:slug` pour un artiste jamais joué (et `/en/…`) | au-delà d'un seuil de contenu (§2.3) | Comprendre |
| Connexion | `/connexion`, `/en/sign-in` | non | Garder |
| Bibliothèque, compte | panneau et menu de l'en-tête | non | Garder |

`/frieze` disparaît.

## 6. Écarts actuels

Ce qui ne s'emboîte pas encore, mesuré le 2026-10-04 au soir (les écarts du 2026-10-03 sur la
frise, l'identité devinée, les titres gardés non reliés, les caches de la page artiste et les
alertes « artiste aimé » sont résolus par les étapes 2 à 4, dans l'historique git) :

1. **Les proximités ne sont pas encore en ligne** : le relevé ListenBrainz (111 402 artistes)
   avance à ~0,55 artiste par seconde, pannes du service comprises ; tant qu'il n'est pas
   épinglé et chargé, Musilogy dit « pas encore relevées » et la carte ne s'affiche pas.
2. **Licence de la similarité ListenBrainz** : le service n'en publie pas ; les données dont il
   dérive sont en CC0. Le site crédite ListenBrainz sans licence, dans les Mentions légales (§1.2).
3. **Identité incomplète** : 39 des 332 artistes joués n'ont pas de MBID (MusicBrainz ne les
   connaît pas, ou sans lien vérifiable) ; 22 des 91 titres gardés, gardés avant que les
   passages soient enregistrés, ne retrouvent ni leur passage ni leur titre exact chez Deezer.
4. **Les featurings ne relient que l'artiste principal** (§4.4 promet chaque crédité).
5. **Musilogy n'est pas indexé** : pages rendues côté client, `noindex` tant que le seuil de
   richesse n'est pas mesuré (§2.3) ; l'objectif d'attirer des auditeurs n'est donc pas encore
   servi.
6. **Le README du site décrit un site qui n'existe plus** : Songlink/Odesli (fermé le
   2026-07-31), identité jour/nuit, fil-journée.
7. **La migration `0006_timestamptz` avale toute erreur** (`EXCEPTION WHEN OTHERS THEN NULL`).
8. **Aucune copie hors de la maison** (§4.7).

## 7. Feuille de route

Dans cet ordre ; chaque étape est une ou plusieurs PR courtes, fusionnées avant la suivante.

1. **Cette vision** — fait (#267).
2. **Retraits** — fait (#268).
3. **Identité exacte** — fait : ISRC écrit par le pipeline (#269, 532 titres rattrapés), résolution
   par ISRC (#270) vérifiée contre le titre et le nom joués (#288, 6 identités réparées), titres
   gardés reliés (#272).
4. **Page artiste** — fait (#275) : profil gardé en base, portrait factuel, titres gardés.
5. **musilogy refondu** — fait pour les retraits (#280), les influences Wikidata et la recherche
   (#286) ; reste la proximité, dont la PR attend la fin du relevé (écart 1).
6. **Musilogy, le produit** — page texte (#281, #289) et carte (#285) en ligne ; reste le seuil
   d'indexation mesuré, et le rendu serveur qu'il suppose (écart 5).
7. **Influences tirées de Wikipédia**, chaque citation avec sa phrase, après mesure du coût.
8. **Liens d'œuvre** : featurings (écart 4), remixes, producteurs, tirés du dump MusicBrainz.

En parallèle : le README du site et la migration 0006 (écarts 6 et 7), la copie hors site dès
qu'un compte de stockage existe, le test du disque de sauvegarde sur un port USB natif.

## 8. Ce qui est remplacé

- La spec de la frise et de la filiation abandonnées (`musilogy/docs/superpowers/specs/`,
  2026-10-02) est remplacée par `musilogy/docs/conception.md` (étape 5) ; son texte reste dans
  l'historique git.
- La version du 2026-10-03 de ce document reste dans l'historique git.
