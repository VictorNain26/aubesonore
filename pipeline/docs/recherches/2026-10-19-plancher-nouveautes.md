# Plancher de note des nouveautés (2026-10-19)

Constat de Victor : Mastodon, « In the Ruins », métal sans rapport avec la couleur d'AubeSonore,
était à l'antenne en nouveautés depuis le 2026-10-11, sans avoir été soumis au vote. Mesures sur
`data/radio.db` du serveur, modèle n°2 en service.

## Pourquoi il est passé

Candidat Hype Machine (blog Heavy Blog Is Heavy), noté 0,54. La rétention gardait les
`keep_nouveautes` mieux notées sans plancher ; or les nouveautés sont peu nombreuses :

| Fournée | Famille | Candidats | Retenus | Plus basse note retenue |
|---|---|---|---|---|
| 5 (2026-10-11) | découvertes | 1 173 | 80 | 0,79 |
| 5 (2026-10-11) | nouveautés | 119 | 80 | 0,25 |
| 6 (2026-10-18) | découvertes | 941 | 80 | 0,75 |
| 6 (2026-10-18) | nouveautés | 109 | 80 | 0,23 |

Les découvertes étaient triées, les nouveautés passaient presque toutes (67 à 73 %). Dans la même
fournée que Mastodon : Girls' Generation (0,39), La Mano 1.9 (0,31), Lizzy McAlpine (0,25).

## Ce que disent les votes d'examen

Votes d'examen des nouveautés (hypem et sélections éditoriales Deezer), selon la note du modèle :

| Note | Oui | Non |
|---|---|---|
| ≥ 0,6 | 12 | 0 |
| < 0,6 | 4 | 4 |

Tous candidats confondus : ≥ 0,75 9 oui, 0 non ; 0,6 à 0,75 22 oui, 4 non ; < 0,6 6 oui, 9 non.

## Décision

Au plus `keep_nouveautes`, et jamais sous 0,6 (`min_score_nouveautes`, `config/editorial.toml`),
soit environ 40 nouveautés par fournée au lieu de 80. Le seuil repose sur 20 votes : les votes
d'examen suivants le confirmeront ou le corrigeront.
