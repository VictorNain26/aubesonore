# CLAUDE.md — pipeline AubeSonore

## Ce que fait ce dépôt

Le pipeline de la radio AubeSonore : goût, découverte, acquisition, publication sur AzuraCast
et page de vote. **`docs/vision.md` est l'unique document de conception et d'exploitation** : le
lire avant toute modification, et le tenir à jour dans le même commit que le code. Les mesures et
sources qui fondent chaque décision sont dans `docs/recherches/`.

## Commandes

```bash
uv sync                                  # dépendances (.venv)
.venv/bin/pytest -q -W error             # suite complète, ~12 s, sans réseau
.venv/bin/ruff check radio tests_radio && .venv/bin/ruff format --check radio tests_radio
.venv/bin/mypy                           # strict
.venv/bin/radio --help                   # library-sync, discover, nouveautes, favoris, negatives-sync,
                                         # signals, train, votes-select, acquire, antenne,
                                         # antenne-isrc (rattrapage ponctuel),
                                         # mesures, check, report, backup, votes-serve,
                                         # votes-remind
```

## Invariants

- **Plex est la seule vérité, en lecture seule.** Section `Musique` uniquement (jamais
  « Musique second wave »), racine `/media/plex/Musique`. Ne jamais lire, lister ni référencer le
  disque de Maël (`/media/musique`), pas même par un `find`.
- **Aucun secret dans les journaux, exceptions, tests ou commits.** Cela vaut pour le jeton Plex,
  la clé Last.fm (passée en paramètre de requête : `urllib3` reste à ERROR), les URL d'extraits
  Deezer (signées : jamais stockées) et la clé CallMeBot. Le `.env` est illisible par l'agent.
- **Un repli silencieux est pire qu'une panne.** Tout ce qui est sauté est compté et nommé dans le
  rapport de la commande.
- **Seuls les votes d'examen jugent un modèle.** Un vote d'examen n'est jamais un exemple
  d'entraînement.
- **Pas d'usine à gaz.** Un signal ou un mécanisme qui ne prouve pas son utilité sur les votes
  est retiré. Pas de garde défensive entre fonctions internes.

## Pièges

- `signals` mesure environ 3 s par titre (EffNet sur un fil). Un rattrapage de milliers de titres
  prend des heures : le lancer à la main, en `nice`. Ne pas lancer `train` pendant `signals`.
- Recherche Deezer : le filtre avancé `artist:"…"` est cassé côté Deezer. Il faut requêter en
  texte simple, puis laisser `pick_match` juger.
- Les migrations SQLite suivent la procédure officielle de reconstruction de table. Un script ne
  contient ni `BEGIN` ni `COMMIT`.
- La passe hebdomadaire exécute le code de `~/aubesonore/pipeline` : développer dans un worktree
  pendant qu'elle tourne, sinon elle importe du code en cours d'écriture.
- Sockseek et rsgain sont des binaires figés dans `~/.local/bin` (versions et sha256 dans
  `docs/vision.md`) ; ffmpeg et fpcalc viennent d'apt.
- Les unités systemd de `deploy/systemd/` sont liées par `systemctl --user link`. Il faut les
  re-lier si le dépôt change de place.
