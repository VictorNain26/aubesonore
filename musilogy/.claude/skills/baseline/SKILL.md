---
name: baseline
description: À charger dès que `uv run pytest -m slow` échoue ou qu'un chiffre de tests/test_baseline.py doit bouger. Rejouer la ligne de base sur le dump réel et instruire un écart avant de l'entériner. Prend une dizaine de minutes et exige les extractions de data/work/.
---

# Ligne de base

Rejoue `tests/test_baseline.py` sur le dump réel et, s'il y a un écart, dit
d'où il vient avant de toucher au chiffre attendu.

`tests/test_baseline.py` est le seul point d'autorité des chiffres du dépôt.
Un écart n'est pas une valeur à rafraîchir : c'est une conséquence, dont il
faut nommer la cause.

## 1. Vérifier que les extractions sont là

```bash
uv run python -c "from musilogy import REFERENCE_DUMP; from musilogy.paths import work_dir; print(work_dir(REFERENCE_DUMP))"
```

Si le répertoire est absent ou vide, la ligne de base ne peut pas tourner.
`uv run musilogy run` reconstruit la chaîne complète, mais télécharge les dumps
— demander avant de le lancer.

## 2. Lancer

```bash
uv run pytest -m slow
```

Compter une dizaine de minutes. Ne pas lancer la suite rapide à la place en
espérant le même signal : elle tourne sur les témoins, pas sur la population.

## 3. Si tout passe

Le dire avec la sortie, sans plus. Rien à modifier.

## 4. S'il y a un écart

Pour chaque chiffre qui bouge, dans l'ordre :

1. **Nommer la table et la variation** — valeur attendue, valeur obtenue,
   écart absolu et relatif.
2. **Trouver la règle responsable.** `git diff` sur `src/musilogy/sql/` depuis
   le dernier passage vert dit quels paliers ont changé. La numérotation est
   topologique : une variation sur `links` vient de `80_links.sql` ou
   d'un fichier de numéro inférieur.
3. **Mesurer le coût de la règle, ne pas le supposer.** Le pipeline est
   déterministe, donc le contrefactuel est toujours disponible : interroger les
   extractions de `data/work/` avec DuckDB pour compter exactement ce que la
   règle modifiée ajoute ou retire. Une requête tranche plus vite qu'un
   raisonnement plausible, et son résultat est opposable.
4. **Vérifier les invariants.** Un écart accompagné d'une vue non vide dans
   `90_invariants.sql` n'est pas un nouveau chiffre à entériner, c'est un bug.
5. **Décider, puis écrire.** Si le nouveau chiffre est le bon, mettre à jour
   `BASELINE` et dire dans le message de commit quelle règle l'a déplacé et de
   combien. Si le chiffre attendu était le bon, c'est la règle qu'on corrige.

Aligner la valeur attendue sur la valeur obtenue sans avoir franchi les étapes
2 à 4 supprime le test au lieu de le faire passer.

## 5. Les chiffres repris ailleurs

Le `README.md` et certains commentaires citent des chiffres de la ligne de
base. Ils sont descriptifs. Quand un chiffre du contrat bouge, les mettre à
jour dans le même commit : c'est la duplication silencieuse qui finit par
diverger.
