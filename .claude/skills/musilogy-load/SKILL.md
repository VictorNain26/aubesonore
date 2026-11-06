---
name: musilogy-load
description: Charger la livraison Musilogy publiée dans la base de production du site, depuis victorserv.
disable-model-invocation: true
---

# Charger Musilogy dans la base du site

Depuis victorserv, à la racine de la worktree du serveur qui porte la livraison (`musilogy/data` relié à
`~/musilogy-data`, `.claude/rules/musilogy.md`). Ce que `musilogy load` vérifie et comment il bascule de
schéma : `musilogy/README.md`, « Installation, tests, exécution ».

Le port de `aubesonore-db` n'est publié que sur `127.0.0.1:5433`, et `pg_hba.conf` impose TLS ; le certificat
couvre `localhost` :

```bash
PGPASSWORD="$(grep '^POSTGRES_PASSWORD=' ~/aubesonore/site/.env | cut -d= -f2-)" \
PGHOST=localhost PGPORT=5433 PGUSER=aubesonore PGDATABASE=aubesonore \
PGSSLMODE=verify-full PGSSLROOTCERT=~/aubesonore/site/certs/ca.crt \
systemd-run --user --scope -p MemoryHigh=3G -p MemoryMax=3584M -p MemorySwapMax=0 \
  nice -n 10 uv --directory musilogy run musilogy load
```

Rapporter les comptes que la commande affiche. Un chargement raté laisse le précédent en place.
