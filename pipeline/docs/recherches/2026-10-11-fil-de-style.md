# Fil de style : la ressemblance des titres qui s'enchaînent (2026-10-11)

Question de Victor : la programmation devait être fluide, avec des passages intelligents d'un
titre à l'autre. Mesures sur l'antenne réelle, empreinte Discogs-EffNet de l'extrait Deezer de
chaque titre (`track_measures`, la même que le modèle de goût), similarité = cosinus.

## Ce que jouait l'antenne

Historique AzuraCast du 2026-10-08 au 2026-10-11, 1 020 passages, tous mesurés :

| Enchaînement | Énergie, dansabilité, tempo (écart fin → début) p10 / 50 / 90 | Style (cosinus) p10 / 50 / 90 |
|---|---|---|
| Diffusé | 0,12 / 0,33 / 0,73 | 0,30 / 0,44 / 0,65 |
| Deux titres au hasard de l'antenne | 0,31 / 0,72 / 1,13 | 0,26 / 0,40 / 0,59 |

Le fil qui dérive tenait l'ambiance (énergie, dansabilité, tempo), pas le style : un titre
suivait le précédent presque comme au hasard (AUX 88 → Sulfur City, Crystal Castles → Bob
Dylan). Repère : deux titres d'un même artiste de la bibliothèque ont un cosinus médian de 0,62
(p10 0,42, p90 0,80, 655 artistes), deux titres au hasard de la bibliothèque 0,36.

## Variantes simulées

Grille du 2026-10-12 recalculée hors ligne sur les 702 titres à l'antenne (`plan_day`,
historique réel, durées réelles), coût
d'un enchaînement = écart d'ambiance + λ × (1 - cosinus) :

| Variante | Style p10 / 50 / 90 | Ambiance p10 / 50 / 90 |
|---|---|---|
| Actuelle | 0,30 / 0,46 / 0,65 | 0,12 / 0,31 / 0,74 |
| Ordre seul, glouton, λ = 1 | 0,35 / 0,52 / 0,68 | 0,13 / 0,34 / 0,74 |
| Ordre seul, 2-opt, λ = 1 | 0,33 / 0,52 / 0,68 | 0,12 / 0,32 / 0,68 |
| Choix et ordre, λ = 1 (retenue) | 0,37 / 0,57 / 0,71 | 0,12 / 0,35 / 0,78 |

- Réordonner une heure ne suffit pas : ses titres, choisis sans le style, sont aussi disparates
  qu'au hasard. Le gain vient du choix : chaque créneau préfère, parmi les titres permis, celui
  qui ressemble au titre placé juste avant.
- Sur l'antenne à un titre par artiste (511 titres), 2-opt n'apporte rien de plus une fois le
  style dans le choix (0,55 dans les deux cas), et un choix pesé à 2 au lieu de 1 donne 0,57
  contre 0,55 : le glouton et un seul poids restent.
- Aucune heure courte, aucun créneau cédé, aucun titre en retard de plus en plus : les règles de
  rotation passent toujours avant.
- Pas de monotonie (antenne à un titre par artiste) : à 1 h d'écart (15 titres), le cosinus médian retombe à 0,42-0,43, et à 3 h
  à 0,41-0,42, comme au hasard. Le fil dérive d'un style à l'autre au lieu de s'y enfermer.

Un titre sans empreinte compte pour 0,6, la distance médiane au hasard : ni favorisé ni écarté.
