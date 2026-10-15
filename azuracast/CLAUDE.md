# CLAUDE.md — azuracast

## Ce que ce dépôt versionne — et ce qu'il ne versionne pas

Ce dossier est d'abord un **runtime**, pas un projet. Le dépôt ne capture que la
partie reproductible :

- **versionné** — `docker-compose.yml` (son en-tête liste ce qui diffère de l'exemple amont),
  `.env.example`, `azuracast.sample.env` (le modèle d'`azuracast.env`), ce guide, `RUNBOOK.md` et
  `scripts/`.
- **ignoré** — `stations/` (le catalogue et la config réécrite par l'UI), `.env`,
  `azuracast.env` (mot de passe MariaDB), `gatus.env`, les journaux.

Corollaire : `git status` propre **ne veut pas dire** que la station est
sauvegardée. Les médias et les secrets sont dans le dépôt restic, la base dans la
sauvegarde AzuraCast — voir `RUNBOOK.md`.

## Position dans le système

AzuraCast est le hub. Le pipeline y écrit (upload, playlists, rotation),
l'application web y lit (titre en cours, historique). Les deux autres briques ne
se connaissent pas ; elles partagent cette station.

Une conséquence pratique : **couper ce conteneur casse les deux autres.** Un
`docker compose down` ici met la radio hors antenne, fait échouer le run du
pipeline, et vide le lecteur du site.

## Règles de travail

- **La config de station appartient à l'UI.** Tout sous `stations/*/config/`
  (Liquidsoap, Icecast, nginx) est réécrit par AzuraCast. Une modification à la
  main y est perdue au prochain changement fait depuis l'interface. Passer par
  l'UI, et traiter les `*.backup.json` comme des instantanés, jamais comme des
  entrées.
- **Ne pas déplacer le média hors SSD.** Sur disque mécanique, les rattrapages de
  latence Liquidsoap produisent des coupures audibles à l'antenne.
- **Les ports sont remappés exprès** — cette machine héberge beaucoup d'autres
  services. Avant de publier un port, vérifier `docker ps`. La plage
  d'auto-attribution déclarée dans `azuracast.env` doit rester cohérente avec ce
  que `docker-compose.yml` publie réellement.
- **Les ports ne sont publiés que sur la boucle locale** (127.0.0.1, plus 8080 sur
  172.17.0.1, l'adresse `host.docker.internal` du backend du site) : Docker contourne ufw et
  la machine a une IPv6 publique. Tout client est sur la machine (tunnel Cloudflare, Gatus,
  pipeline) ; l'interface s'ouvre par `radio.aubesonore.fr`. Un nouveau port suit la même règle.
- **Le conteneur écrit dans `stations/` en tant que `AZURACAST_PUID:PGID`.** Si
  ces valeurs ne correspondent plus au propriétaire du dossier sur l'hôte, le
  pipeline perd l'accès aux fichiers — panne silencieuse et déroutante.
- **AzuraCast n'applique que sa fenêtre anti-doublon.** La séparation entre deux
  passages d'un même artiste (3 h) est tenue par la grille du pipeline (`radio
  grille`, `pipeline/docs/vision.md` §7.3), dont les playlists tournent sans
  `avoid_duplicates`.

## Modifier la topologie

`docker-compose.yml` décrit la machine autant que le service : chemins de montage,
ports, pondération CPU face aux autres charges. Un changement ici se teste avec
`docker compose config` avant `up -d`, et se commite avec la raison — c'est
précisément le genre de décision qu'on ne sait plus justifier six mois après.
