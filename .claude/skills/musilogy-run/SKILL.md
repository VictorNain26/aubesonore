---
name: musilogy-run
description: Lancer `musilogy run` ou une requête lourde sur les données complètes de victorserv, dans un scope mémoire plafonné. Utiliser avant tout calcul Musilogy sur le serveur.
---

# Travaux lourds sur victorserv

`musilogy run` part dans un scope plafonné :
`build.connect()` borne DuckDB, mais pas le cache disque ni Python, et les
services de la machine en occupent déjà une bonne part. Une requête sans borne
l'a déjà gelée.

Depuis le poste, une commande part sur victorserv par `victorserv claude '<commande>'` (compte
restreint, sans demande ; il ne lit pas `/home/victormoi`) ou `victorserv admin '<commande>'`
(victormoi, root par sudo, demande à chaque fois). Un `ssh` direct vers victorserv est refusé.

```bash
systemd-run --user --scope -p MemoryHigh=3G -p MemoryMax=3584M -p MemorySwapMax=0 \
  nice -n 10 uv --directory musilogy run musilogy run
```

- La co-écoute sur toutes les écoutes demande plus : `musilogy run` part alors
  dans un scope de 5,5 Go visés et 6 Go au plus, quand la passe hebdomadaire de
  la radio ne tourne pas.
- Un plafond visé (`MemoryHigh`) se pose au-dessus du pic mesuré, jamais
  dessus : le noyau freine sinon le calcul pendant des heures. Après le
  lancement, `memory.pressure` de l'unité le dit.
- `data/tmp/`, où DuckDB déborde à des dizaines de Mo/s, pointe vers le SSD
  externe (`/media/plex/.musilogy-tmp`), jamais vers le NVMe interne : celui-ci
  porte le système, Docker, Postgres et la radio, et le débordement l'a saturé
  au point de ralentir toute la machine. Ni `IOSchedulingClass=idle` (NVMe en
  ordonnanceur `none`) ni `io.max` (non délégué aux unités utilisateur) ne le
  bridaient.
- Sur le SSD externe, le calcul part dès qu'il est prêt, sans attendre la nuit.
  Une unité trop gourmande se gèle (`systemctl --user freeze`) et reprend où
  elle était (`thaw`).
