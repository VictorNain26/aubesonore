# Cycle de vie d'un titre, de l'entrée à la sortie — proposition du 2026-10-02

Demande de Victor (2026-10-02) : un tiers, voire deux tiers, de nouveautés ; aucun titre ne doit
rester à l'antenne pour toujours parce qu'il est bien noté ; s'inspirer de ce qui existe ; voir
la radio dans sa globalité, chaque élément cohérent avec les autres.

Cette proposition relie les étapes 2 (sources), 4 (goût), 5 (acquisition), 7 (antenne) et 8
(enchaînement) de `docs/conception.md`. Les pratiques citées sont sourcées dans
`2026-10-02-rotation-radio.md` ; **[S]** = sourcé, **[I]** = déduit ici, **[M]** = mesuré.

## 1. Le constat

- **[M] Débit d'antenne.** 323 passages en 1 332 min (2026-10-01 12:30 → 2026-10-02 10:42,
  `song_history`), soit 14,6 titres par heure et ~2 450 passages par semaine ; 246 s par
  passage en moyenne.
- **[M] Entrées.** La passe du 2026-10-01 a demandé 300 titres et en a publié 263. 506 titres
  retenus attendent encore leur tour (plafond de 300 par passe).
- **[M] Nouveautés.** La commande existe, mais n'a encore jamais tourné : 0 candidat. Avec les
  deux genres d'origine, une passe apporterait au plus ~100 titres (Hype Machine : 50 titres en
  3 pages, la page 4 répond 404 ; Deezer : ~25 titres par genre), contre ~800 voisins. D'où
  l'élargissement mesuré au §9.
- **[I] Stagnation.** La sortie actuelle retire « le moins bien noté de plus de 60 jours ». Un
  titre bien noté ne sort donc jamais, et chaque place qu'il garde raccourcit le séjour de toutes
  les entrées (loi de Little : stock = débit d'entrée × durée de séjour). Aucune radio étudiée ne
  fait ainsi : on sort par âge, et on met au repos [S].
- **[M] Défaut.** `remove_excess` retire au plus 50 titres par passe, pour ~260 entrées : une fois
  le plafond de 2 000 atteint (vers la mi-novembre), l'antenne dériverait de ~200 titres par
  semaine.
- **[S] AzuraCast 0.23.8** ne connaît ni durée de vie, ni repos, ni platooning. Il offre des
  playlists liées à des dossiers, des poids, la programmation horaire, l'ordre séquentiel et
  `do=move`.

## 2. Le principe : une grille horaire, comme toute radio programmée

Une radio programmée découpe chaque heure en créneaux, chacun réservé à une catégorie de titres
(« horloge », MusicMaster et Powergold [S]). La part d'antenne d'une catégorie est donc fixée par
la grille, quelle que soit sa taille ; sa taille fixe seulement la fréquence à laquelle chacun de
ses titres revient (le « turnover » [S]).

L'enchaînement (conception §7.3) devait déjà écrire des playlists horaires séquentielles. **Le même
planificateur remplit les créneaux de la grille, puis ordonne l'heure en fil qui dérive.** C'est
ce qui rend tout cohérent : la part de nouveautés, la rotation et l'ordre se décident au même
endroit. Avec les poids des playlists AzuraCast, il faudrait deux mécanismes qui se contredisent :
AzuraCast tire les playlists au hasard, et ne permet donc aucun ordre.

## 3. Les catégories

| Catégorie | Contenu | Part d'antenne | Titres à l'antenne | Retour d'un titre |
|---|---|---|---|---|
| **Nouveautés** | nouveautés en premier séjour | 1/3 (5 titres par heure) | ~410 | 2 fois par semaine |
| **Découvertes** | voisins en premier séjour | 1/3 (5 par heure) | ~410 | 2 fois par semaine |
| **Fond** | anciens courants promus (« recurrents ») | 1/6 (2 à 3 par heure) | ~410 | 1 fois par semaine |
| **Repères** | titres de la bibliothèque de Victor | 1/6 (2 à 3 par heure) | ~410 | 1 fois par semaine |

Le stock est déduit de la part et de la fréquence : `part × 2 450 / passages par semaine` [I].
Total à l'antenne : ~1 640 titres, sous le plafond actuel de 2 000, qui devient une conséquence
et non plus une règle. Nouveautés et découvertes forment ensemble le **courant**.

**Le réglage qui commande tout : 2 passages par semaine pour un titre courant.**
- Aujourd'hui, un titre revient environ toutes les 22 h, soit ~7 fois par semaine, et l'ancienne
  antenne a été jugée trop répétitive à ce rythme.
- À 1 fois par semaine, le stock courant doublerait et les entrées aussi. Mais un titre
  serait si rarement réentendu qu'il ne deviendrait jamais familier : l'intérêt monte avec les
  premières expositions avant de s'user (Ex2Vec, Deezer, RecSys 2023 [S]).
- 2 fois par semaine pendant 6 semaines donne ~12 passages par titre, sous les 5 à 7 passages
  hebdomadaires d'une C-list de la BBC [S]. Le chiffre 2 est déduit [I] et réglable
  (`editorial.toml`).

## 4. Le cycle de vie

1. **Entrée.** Chaque semaine, ~70 nouveautés et ~70 découvertes (stock ÷ 6 semaines). Le débit
   d'entrée découle de la grille : il ne se règle plus à part.
2. **Premier séjour : 6 semaines** en catégorie courante (KEXP : 6 à 8 semaines ; BBC Radio 1 :
   ~7 semaines [S]). Sortie **par âge**, jamais par score.
3. **Vote « non »** : sortie définitive, immédiate (règle actuelle).
4. **Fin du premier séjour.** Les meilleurs de la cohorte (vote « oui » d'abord, puis score du
   modèle) deviennent **recurrents** et partent au repos ; les autres sortent. Ce sont ~17 titres
   par semaine, soit ~12 % des ~136 qui finissent leur séjour : le même ordre que les ~10 % de
   titres vraiment « chauds » chez Powergold [S pour 10 %, I pour le calcul : ~1 220 recurrents,
   410 au fond et ~810 au repos, renouvelés en 72 semaines].
5. **Platooning du fond** (MusicMaster [S]). Chaque semaine, les recurrents présents depuis
   6 semaines au fond retournent au repos (critère « Move Date »). Ceux qui se reposent depuis le
   plus longtemps, et depuis au moins 12 semaines (~3 mois chez MusicMaster Oldies [S]), les
   remplacent. Environ 70 échanges par semaine.
6. **Péremption à 18 mois** après la première diffusion (le recurrent de BBC Radio 2 [S]) :
   sortie définitive, quel que soit le score. Un titre revient ensuite seulement si Victor
   l'ajoute à sa bibliothèque Plex, comme repère.
7. **Repères** : même platooning, sur toute la bibliothèque. Ils restent 6 semaines à l'antenne,
   puis sont remplacés par d'autres, tirés selon l'écoute, qui n'ont pas été diffusés depuis au
   moins 12 semaines. Ce sont les seuls titres qui reviennent sans limite : ce rôle de noyau est
   tenu par le goût de Victor, pas par le modèle (les 94 titres « core » de MusicMaster
   Oldies [S]).

**Le score du modèle ne garde plus jamais un titre à l'antenne** : il choisit qui entre, et qui
est promu en recurrent. C'est la seule part originale, imposée par l'absence de panel
d'auditeurs, qui remplace ici la recherche auditeurs des radios [I].

### Bilan : combien de temps, combien de titres

| Catégorie | Séjour à l'antenne | Passages par séjour | Vie totale | À l'antenne | Hors antenne |
|---|---|---|---|---|---|
| Nouveautés | 6 semaines | ~12 | 6 semaines (12 % promues) | ~410 | — |
| Découvertes | 6 semaines | ~12 | 6 semaines (12 % promues) | ~410 | — |
| Fond | 6 semaines, puis ≥ 12 au repos | ~6 | 18 mois, ~4 retours, ~24 passages | ~410 | ~810 au repos |
| Repères | 6 semaines, puis ≥ 12 hors antenne | ~6 | sans fin | ~410 | toute la bibliothèque |

- **Maximum : ~1 640 titres à l'antenne**, et ~810 au repos, soit ~2 450 fichiers (~23 Go à
  9,4 Mo par titre [M], sur un disque où 112 Go sont libres [M]). Le plafond de 2 000 tombe :
  le stock découle de la grille.
- **Un auditeur fidèle** entend chaque titre courant 2 fois par semaine, un même titre du fond
  au plus 1 fois par semaine, et ne retrouve jamais un titre à moins de ~3 jours (turnover).
- Tout se règle par trois nombres de `editorial.toml` : la grille (parts), les passages par
  semaine de chaque catégorie, la durée du séjour. Le débit d'entrée, le stock et les
  promotions s'en déduisent.

## 5. Les entrées : sources et goût

- **Une barre de goût par catégorie.** Chaque semaine, on retient les ~70 voisins les mieux
  notés, et les ~70 nouveautés les mieux notées. Les deux familles ne se disputent plus la même
  coupure. `keep_fraction` disparaît au profit de ces effectifs, qui découlent de la grille.
- **Plus d'offre de nouveautés** pour que la barre reste haute : les 3 pages de Hype Machine, et
  les genres éditoriaux Deezer que le modèle note dans la couleur de Victor (mesure du §8).
- **Acquisition.** Les candidats de la dernière fournée passent d'abord : une nouveauté vieillit.
- **Démarrage.** Les ~270 découvertes à l'antenne forment la première cohorte (entrée le
  2026-10-01). Les fournées précédentes, renotées avec la même règle (80 par famille), ne
  passent qu'après la dernière, dans la limite de 160 par passe. L'arriéré de 506 retenus
  disparaît : les 80 meilleurs voisins de chaque ancienne fournée sont déjà acquis [M].
- **Montée en charge.** Tant qu'une catégorie n'a pas son stock, ses créneaux sont réduits en
  proportion et rendus aux autres : sinon les premières nouveautés reviendraient ~12 fois par
  semaine. Les nouveautés atteignent leur tiers en 6 semaines [I].
- **Votes.** Inchangés : 10 d'examen (tirage uniforme dans la fournée, qui juge chaque source) et
  10 de leçon. `radio report` donne le taux de « oui » par catégorie.

## 6. L'enchaînement

Le planificateur doit tenir deux contraintes qui tirent en sens contraires : la **rotation**
(chaque titre revient à son rythme) et la **courbe** de la journée (un titre calme ne passe pas
le samedi à minuit). Il remplit la grille créneau par créneau, comme un ordonnanceur radio
(MusicMaster [S]) : pour chaque créneau, la catégorie est parcourue dans l'ordre de rotation
(joué il y a le plus longtemps d'abord, le turnover [S]), sur une fenêtre de recherche, et le
titre le plus proche de la cible de l'heure est pris, l'ancienneté départageant. Un artiste ne
repasse ni dans l'heure ni dans l'heure précédente (au moins 60 min, proche des 70 min de
MusicMaster [S]). Chaque heure est ensuite ordonnée en fil qui dérive.

Une première version affectait toute la journée d'un coup (algorithme hongrois) avec un seul
titre par artiste et par jour : essayée à blanc sur l'antenne du 2026-10-02, elle laissait
224 créneaux vides sur 384, les découvertes venant d'un nombre limité d'artistes, et des heures
presque vides [M]. Le remplissage créneau par créneau en laisse 0 (16 titres par heure, 315
titres distincts, au plus 2 passages par jour avec 341 titres pour 384 créneaux) [M].

- **Grille cible 7 × 24 h** (énergie, tempo, dansabilité). L'écoute suit cinq blocs dans la
  journée (Heggli, Stupacher, Vuust, *Royal Society Open Science*, 2021, 2 milliards d'écoutes
  Spotify, texte intégral PMC8580447 [S]) : matin dès 6 h, plus d'énergie et un tempo plus
  lent ; après-midi dès 12 h, tempo en nette hausse ; soir dès 20 h, tempo et dansabilité au plus
  haut ; nuit dès 23 h, volume et tempo au plus bas ; fin de nuit dès 4 h, un peu plus d'énergie
  que la nuit. Le week-end, le soir s'allonge (nuit à 3 h puis 4 h, fin de nuit à 5 h). Décision
  du 2026-09-23 : le vendredi et le samedi soir sont plus dansants, jusqu'à 03:00. L'amplitude
  des cibles est un choix [I] : l'article ne donne que le sens des écarts. **Les cibles
  s'expriment en quantiles des titres à l'antenne** et non en valeurs absolues : chaque titre a
  ainsi des heures qui lui conviennent, et la grille suit la couleur de l'antenne quand elle
  change [I].
- **Mesures par titre** (`2026-10-02-mesures-titres.md`) : dansabilité et arousal (énergie) sur
  MSD-MusiCNN, tempo par TempoCNN, sur le titre entier, son début et sa fin. Modèles MTG sous
  licence non commerciale, compatible avec une radio gratuite et sans publicité.
- **Une heure prévoit un titre de plus que la station n'en joue** (16 pour 14,6 mesurés) : le
  secours ne prend jamais la fin d'une heure ; le titre de trop n'est pas joué et reste en tête
  de rotation.
- **AzuraCast** : une playlist séquentielle programmée par heure (`loop_once`,
  `avoid_duplicates=false`), remplie par `DELETE …/empty` puis `POST …/import` (M3U, l'ordre est
  conservé). La playlist « AubeSonore » reste le secours, liée au seul dossier `antenne/` ; le
  repos est dans `repos/`, lié à aucune playlist (`do=move` déplace un fichier sans réécrire ses
  balises [S]). Une sonde Gatus alerte si le secours joue.
- **Un vote « non »** retire le titre à la passe du dimanche, qui réécrit aussitôt les heures
  restantes de la journée.

## 7. Ce qu'on n'avait pas encore vu

- **Un artiste qui envahit sa catégorie.** Les voisins donnent 10 titres par artiste : au plus
  2 titres d'un même artiste par catégorie courante, sinon la séparation de 70 min devient
  impossible à tenir [I].
- **L'offre de nouveautés doit se renouveler.** Si Deezer garde la même sélection d'une semaine
  à l'autre, ses titres déjà vus ne comptent plus et l'offre fond. Le rapport compte les titres
  « déjà vus » par source, et une source qui n'apporte plus rien est remplacée (conception §3.1).
- **Les échecs d'acquisition** (12 % le 2026-10-01 [M]) : on retient ~80 titres par catégorie
  pour en publier ~70.
- **Le modèle change chaque semaine** : la promotion utilise le score du jour de la fin de
  séjour, pas celui d'entrée.
- **Le vote reste rare** (20 titres par semaine pour ~140 entrées) : la plupart des promotions
  reposent sur le score. Le taux de « oui » par catégorie dans `radio report` dira si ce choix
  tient.
- **Pas d'enchaînement harmonique** (tonalité, mixage à la Camelot) pour l'instant : aucun
  besoin exprimé, et le fondu enchaîné de 2 s n'en dépend pas (YAGNI).
- **Observabilité** : passages réels par catégorie comparés à la grille (`song_history`),
  catégorie en sous-stock, part d'antenne jouée par le secours.

## 8. Ordre de réalisation

1. **Entrées** : barre par catégorie, offre de nouveautés, acquisition par fournée. Livrée avec
   cette proposition, avant la passe du dimanche 2026-10-04.
2. **Cycle de vie à l'antenne** : catégories, sorties par âge, promotion, platooning, repos,
   péremption. Elle remplace `remove_excess` et le défaut des 50 retraits par passe. Livrée le
   2026-10-02 ; les premières fins de séjour tombent le 2026-11-15 (cohorte du 2026-10-01).
3. **Mesures par titre** pour l'enchaînement. Livrée le 2026-10-02.
4. **Planificateur et grille** dans AzuraCast, sonde Gatus. Livrée le 2026-10-02.

Chaque étape met `docs/conception.md` à jour dans le même commit.

## 9. Offre de nouveautés mesurée

[M] Copie de la base de production, 2026-10-02 : `radio nouveautes` avec les 3 pages de Hype
Machine et 22 genres éditoriaux Deezer, puis `radio signals`, puis notes du modèle en service
(n°2) sur la fournée n°3. Coupure des 80 meilleurs voisins : 0,810 ; ancienne coupure du tiers :
0,708.

| Source | Titres | Note médiane | ≥ 0,708 | ≥ 0,810 |
|---|---|---|---|---|
| dance | 23 | 0,747 | 13 | 6 |
| jazz | 28 | 0,732 | 17 | 7 |
| classique | 30 | 0,722 | 20 | 3 |
| Hype Machine | 32 | 0,700 | 16 | 0 |
| alternative | 26 | 0,696 | 13 | 4 |
| rock | 23 | 0,680 | 9 | 4 |
| indienne | 3 | 0,671 | 1 | 0 |
| folk | 22 | 0,654 | 8 | 0 |
| blues | 25 | 0,649 | 8 | 0 |
| brésilienne | 14 | 0,634 | 4 | 0 |
| electro | 24 | 0,619 | 7 | 3 |
| arabe | 19 | 0,565 | 1 | 0 |
| soul & funk | 26 | 0,557 | 2 | 1 |
| latino | 26 | 0,532 | 4 | 1 |
| chanson française | 30 | 0,522 | 2 | 0 |
| reggae | 25 | 0,462 | 1 | 0 |
| R&B | 30 | 0,444 | 5 | 2 |
| pop | 17 | 0,408 | 1 | 0 |
| rap | 15 | 0,405 | 2 | 0 |
| country | 23 | 0,376 | 0 | 0 |
| africaine | 19 | 0,373 | 1 | 0 |
| metal | 27 | 0,250 | 2 | 0 |
| asiatique | 27 | 0,237 | 1 | 0 |

- **Le modèle trie à l'intérieur de chaque genre**, et c'est ce qui garde la couleur : R&B,
  Leon Bridges, Cleo Sol et Sault en tête (0,72 à 0,81), SZA et Jacquees dessous ; pop, Stevie
  Wonder en tête (0,77) ; asiatique, Sanullim (rock coréen des années 70) à 0,82, la K-pop à
  0,24-0,43 ; rap, surtout du rap français grand public dans la sélection Deezer (L'morphine,
  Djadja & Dinaz), Drake et A$AP Rocky au milieu.
- **Genres lus** : ceux où au moins 25 % des titres passent l'ancienne coupure du tiers
  (alternative, electro, dance, jazz, classique, rock, folk, blues, brésilienne), plus ceux que
  Victor aime (2026-10-02 : pop, rap, surtout le hip-hop américain, R&B plutôt ancien, musique
  asiatique), à l'essai, avec soul & funk, voisin du R&B ancien. Écartés : indienne (3 titres),
  chanson française, latino, reggae, arabe, africaine, country (aucun goût exprimé, notes
  basses), metal (négatif de démarrage). Les votes d'examen jugent chaque genre (conception §3.1).
- **Classique** : la bibliothèque de Victor en contient (Debussy, Satie, Chopin, Tchaïkovski,
  Radu Lupu), donc la règle « un genre présent chez un de ses artistes est gardé » s'applique.
- **Résultat** : 362 nouveautés ; la 80e note 0,749, au-dessus de l'ancienne coupure (0,708).
  Les 80 retenues : jazz 12, Hype Machine 12, dance 11, alternative 10, classique 9, rock 7,
  folk 6, electro 4, R&B 3, blues 2, soul & funk 1, asiatique 1, brésilienne 1, pop 1. Les
  genres ajoutés à l'essai n'abaissent pas la barre : sans eux, la 80e note valait 0,744. Les découvertes passent, elles, de 0,708 à 0,810 :
  les deux familles entrent au-dessus de l'ancienne barre.
- Hype Machine n'a donné que 50 titres (32 retrouvés sur Deezer, 13 absents, 4 déjà dans la
  bibliothèque) : le classement est court, la profondeur vient des genres Deezer.
- **Reste inconnu** : le rythme auquel Deezer renouvelle ses sélections. Le rapport de la
  passe le dira par les titres « déjà vus ».

## 10. Choix arrêtés

Victor a délégué ces choix le 2026-10-02 (« je te laisse faire les meilleurs choix ») :
grille 1/3 nouveautés, 1/3 découvertes, 1/6 fond, 1/6 repères ; 2 passages par semaine pour un
titre courant, 1 pour le fond et les repères ; séjour de 6 semaines, repos d'au moins 12,
péremption à 18 mois. La part de nouveautés pourra monter vers 2/3 après une vingtaine de votes
d'examen par source, si leur taux de « oui » tient face aux découvertes.
