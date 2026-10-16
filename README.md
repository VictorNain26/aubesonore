# AubeSonore

Webradio de découverte musicale : [radio.aubesonore.fr](https://radio.aubesonore.fr). Indé,
électro, hip-hop, des années 60 à aujourd'hui, et Musilogy pour aller d'un artiste à ses voisins.

Vision produit et architecture : [`docs/vision.md`](docs/vision.md). La lire avant un changement
qui traverse plusieurs pièces.

## Les quatre pièces

| Dossier | Rôle | Pour commencer |
|---|---|---|
| [`site/`](site/) | Site d'écoute et API (pnpm, Bun, React) | [README](site/README.md), [règles agent](.claude/rules/site.md) |
| [`pipeline/`](pipeline/) | Goût, découverte, acquisition et publication à l'antenne (Python, uv) | [conception](pipeline/docs/vision.md), [règles agent](.claude/rules/pipeline.md) |
| [`azuracast/`](azuracast/) | Configuration du serveur de diffusion (Docker) | [runbook](azuracast/RUNBOOK.md), [règles agent](.claude/rules/azuracast.md) |
| [`musilogy/`](musilogy/) | Données de Musilogy, hors ligne : MusicBrainz, Discogs, ListenBrainz, Wikidata (Python, DuckDB) | [README](musilogy/README.md), [règles agent](.claude/rules/musilogy.md) |

AzuraCast est le centre : le pipeline y dépose les titres, le site y lit ce qui passe, et les
deux ne se parlent jamais. Musilogy est chargé dans la base du site, qui ne le lit que par ses
fonctions SQL (`docs/vision.md` §4).

## Travailler ici

- Une branche et une PR par changement ; la CI de chaque pièce tourne sur toutes les PR.
- **Merger sur `master`, c'est déployer** : le serveur avance son checkout `~/aubesonore` tout seul.
- `site/` se développe sur n'importe quel poste (`site/README.md`). `pipeline/` et `musilogy/`
  ont besoin des données du serveur : on y travaille dans une worktree, jamais dans
  `~/aubesonore`, qui est le checkout de production.
- Reconstruire la machine de zéro : [`azuracast/RUNBOOK.md`](azuracast/RUNBOOK.md).
