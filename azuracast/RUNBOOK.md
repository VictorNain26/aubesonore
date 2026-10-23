# Runbook — remonter la radio depuis zéro

Ordre de remontage : **AzuraCast → pipeline → application web → Musilogy**. Le
pipeline et le site consomment AzuraCast, Musilogy se charge dans la base du site ;
l'inverse n'est jamais vrai. Tous vivent dans un seul dépôt, cloné une fois :

```bash
git clone https://github.com/VictorNain26/aubesonore.git ~/aubesonore
loginctl enable-linger                # les unités systemd tournent sans session ouverte
```

Ce fichier vit ici parce qu'AzuraCast est la seule brique qui ne sache pas se
reconstruire seule depuis un dépôt public.

## Ce qu'il faut avoir sauvegardé

| Élément | Où il vit | Sauvegarde | Sans lui |
|---|---|---|---|
| `azuracast/.env`, `azuracast.env` (`MYSQL_PASSWORD`) | hors git | restic | base inaccessible, ports par défaut |
| `stations/` (médias, et `*/config/` dans la sauvegarde AzuraCast) | NVMe | restic | catalogue perdu, station à reconfigurer |
| Base MariaDB d'AzuraCast | volume Docker | sauvegarde AzuraCast quotidienne | métadonnées, comptes, playlists |
| Base PostgreSQL du site | volume Docker | `aubesonore-backup` (`site/scripts/backup-db.sh`) | comptes, titres gardés |
| `pipeline/data/radio.db`, `data/models/` | NVMe | `radio-backup` | les votes, qui n'existent nulle part ailleurs |
| `site/.env`, `pipeline/.env` | hors git | **aucune** : une copie à garder soi-même (gestionnaire de mots de passe) | secrets à recréer : Plex, AzuraCast, YouTube, Google, SMTP |
| `~/musilogy-data` | NVMe | **aucune** (choix du 2026-10-13 : 16 Go) | Musilogy se refait sur un dump MusicBrainz plus récent, une journée de calcul, des chiffres un peu différents |
| Mot de passe du dépôt restic | `~/.config/restic/password` | une copie hors de la machine | le dépôt restic est illisible |

`azuracast-backup.timer` (04:45, `scripts/backup-media.sh`, unités dans `scripts/systemd/`)
sauvegarde depuis le 2026-10-03 `stations/`, `docker-compose.yml`, `.env` et `azuracast.env`
dans un dépôt restic chiffré, `/media/plex/.backups/restic`, disque distinct du NVMe ;
rétention 7 jours, 4 semaines, 6 mois.
Les bases ont leurs propres sauvegardes, sur le même disque distinct.

## 1. AzuraCast

restic s'installe depuis le binaire officiel signé (https://restic.readthedocs.io,
« Installation » : empreinte `SHA256SUMS`, signature GPG de la clé
`CF8F 18F2 8445 7597 3F79 D4E1 91A6 868B D3F7 A907`) dans `~/.local/bin/restic`.

```bash
cd ~/aubesonore/azuracast
# stations/, .env et azuracast.env reprennent leur place (ajuster les ports de .env si la
# machine a changé) :
restic -r /media/plex/.backups/restic --password-file <copie du mot de passe> \
  restore latest --tag nightly --target /
docker compose up -d
# la copie du mot de passe reprend sa place, puis la sauvegarde quotidienne :
install -m 600 <copie du mot de passe> ~/.config/restic/password
ln -s ~/aubesonore/azuracast/scripts/systemd/* ~/.config/systemd/user/
chmod 600 .env azuracast.env
systemctl --user enable --now azuracast-backup.timer
```

Vérifier : l'UI répond sur le port `AZURACAST_HTTP_PORT`, la station diffuse.
Restaurer ensuite la base via l'outil de restauration d'AzuraCast, puis
régénérer une clé d'API — les clés ne survivent pas à une restauration partielle.

Points à ne pas rejouer de travers :
- `stations/` doit appartenir à `AZURACAST_PUID:AZURACAST_PGID`, sinon le
  pipeline ne peut plus lire ce que le conteneur écrit.
- Le média reste sur SSD. Sur disque mécanique, les rattrapages de latence
  Liquidsoap produisent des coupures audibles.
- `AUTO_ASSIGN_PORT_MAX` (dans `azuracast.env`) doit rester cohérent avec la
  plage réellement publiée par `docker-compose.yml`.

## 2. Pipeline

```bash
cd ~/aubesonore/pipeline
uv sync
# sockseek et rsgain : binaires figés dans ~/.local/bin (versions et sha256 : docs/conception.md)
# ffmpeg et fpcalc (libchromaprint-tools) : apt ; dans models/, le modèle EffNet (radio/signals/audio.py)
# et les quatre modèles de mesure (MODELS de radio/signals/features.py, essentia.upf.edu/models, sha256 vérifiés)
# .env : ta copie (sinon .env.example, secrets à recréer), avec la clé d'API AzuraCast régénérée
for u in deploy/systemd/*; do systemctl --user link "$PWD/$u"; done
systemctl --user daemon-reload
systemctl --user enable --now radio-weekly.timer radio-backup.timer radio-grille.timer radio-votes.service
```

Restaurer `data/radio.db` et `data/models/` depuis la copie la plus récente de
`/media/plex/.backups/radio` (`radio-backup`) : la base porte les votes, qui
n'existent nulle part ailleurs.

## 3. Application web

```bash
cd ~/aubesonore/site
./scripts/make-certs.sh               # TLS de Postgres (certs/ n'est ni versionné ni sauvegardé)
# .env : ta copie (sinon .env.example : secrets d'auth, SMTP, base, clé YouTube à recréer)
docker compose up -d --build
ln -s ~/aubesonore/site/scripts/systemd/* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now aubesonore-deploy.timer aubesonore-backup.timer
```

Restaurer PostgreSQL depuis le dump le plus récent de `/media/plex/.backups/aubesonore`
**dans une base jetable d'abord** — vérifier qu'il se lit avant de le passer sur la
production.

## 4. Musilogy

La sauvegarde de la base du site laisse de côté le schéma `musilogy`
(`site/scripts/backup-db.sh`) : tant qu'il n'est pas rechargé, les pages des artistes
jamais joués répondent qu'elles ne sont pas disponibles.

```bash
cd ~/aubesonore
ln -s ~/musilogy-data musilogy/data   # perdu avec le NVMe : `musilogy run` sur un dump récent le refait (une journée)
cd musilogy && uv sync
# puis `uv run musilogy load` avec l'environnement libpq de .claude/rules/musilogy.md (« Charger la base du site »)
```

## Vérifier que tout est remonté

```bash
docker ps                                   # azuracast, aubesonore-{db,backend,frontend,renderer}
systemctl --user list-timers                # un par *.timer de pipeline/deploy/systemd, site/scripts/systemd et azuracast/scripts/systemd
systemctl --user is-active radio-votes      # page de vote ; 127.0.0.1:8040 répond 403 sans Cloudflare Access
cd ~/aubesonore/pipeline && .venv/bin/pytest -q -W error && .venv/bin/radio report
```

Le vrai test de bout en bout reste une passe `radio-weekly` complète : elle touche
l'API AzuraCast, le disque média et la base SQLite d'un seul coup.
