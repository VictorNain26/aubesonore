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
| **Mot de passe du dépôt restic** | `~/.config/restic/password` | **une copie hors de la machine** (gestionnaire de mots de passe) | tout le reste est illisible |
| `azuracast/.env`, `azuracast.env` (`MYSQL_PASSWORD`), `gatus.env` | hors git | restic | base inaccessible, ports par défaut |
| `site/.env`, `pipeline/.env` | hors git | restic | secrets à recréer : Plex, AzuraCast, YouTube, Google, SMTP, Gatus |
| `stations/` (médias, et `*/config/` dans la sauvegarde AzuraCast) | NVMe | restic | catalogue perdu, station à reconfigurer |
| `~/musilogy-data/raw`, `out` | NVMe | restic | dump de référence (plus publié par MetaBrainz) et tables à refaire |
| Base MariaDB d'AzuraCast | volume Docker | sauvegarde AzuraCast quotidienne | métadonnées, comptes, playlists |
| Base PostgreSQL du site | volume Docker | `aubesonore-backup` (`site/scripts/backup-db.sh`) | comptes, titres gardés |
| `pipeline/data/radio.db`, `data/models/` | NVMe | `radio-backup` | les votes, qui n'existent nulle part ailleurs |

`azuracast-backup.timer` (04:45, `scripts/backup-media.sh`, unités dans `scripts/systemd/`)
sauvegarde dans un dépôt restic chiffré, `/media/plex/.backups/restic`, disque distinct du
NVMe : les médias et la configuration d'AzuraCast depuis le 2026-10-03, les secrets du site
et du pipeline et les données de Musilogy depuis le 2026-10-13. Rétention 7 jours,
4 semaines, 6 mois ; battement de cœur Gatus `radio_sauvegarde-medias`. Les bases ont leurs
propres sauvegardes, sur le même disque distinct.

Tous les secrets étant dans le dépôt restic, **son mot de passe est le seul à garder hors de
la machine** : sans une copie ailleurs, la perte du NVMe rend le dépôt illisible.

## 1. AzuraCast

restic s'installe depuis le binaire officiel signé (https://restic.readthedocs.io,
« Installation » : empreinte `SHA256SUMS`, signature GPG de la clé
`CF8F 18F2 8445 7597 3F79 D4E1 91A6 868B D3F7 A907`) dans `~/.local/bin/restic`.

```bash
cd ~/aubesonore/azuracast
# tout ce que restic garde reprend sa place : stations/, les .env d'AzuraCast, du site et du
# pipeline, gatus.env, ~/musilogy-data/raw et out (ajuster les ports de .env si la machine a changé)
restic -r /media/plex/.backups/restic --password-file <copie du mot de passe> \
  restore latest --tag nightly --target /
docker compose up -d
# la copie du mot de passe reprend sa place, puis la sauvegarde quotidienne :
install -m 600 <copie du mot de passe> ~/.config/restic/password
ln -s ~/aubesonore/azuracast/scripts/systemd/* ~/.config/systemd/user/
chmod 600 .env azuracast.env gatus.env ../site/.env ../pipeline/.env
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
# sockseek et rsgain : binaires figés dans ~/.local/bin (versions et sha256 : docs/vision.md)
# ffmpeg et fpcalc (libchromaprint-tools) : apt ; dans models/, le modèle EffNet (radio/signals/audio.py)
# et les quatre modèles de mesure (MODELS de radio/signals/features.py, essentia.upf.edu/models, sha256 vérifiés)
# .env restauré à l'étape 1 : y remettre la clé d'API AzuraCast régénérée
for u in deploy/systemd/*; do systemctl --user link "$PWD/$u"; done
systemctl --user daemon-reload
systemctl --user enable --now radio-weekly.timer radio-remind.timer radio-backup.timer radio-grille.timer radio-votes.service
cd deploy/gatus && ln -s ../../.env .env && docker compose up -d
```

Restaurer `data/radio.db` et `data/models/` depuis la copie la plus récente de
`/media/plex/.backups/radio` (`radio-backup`) : la base porte les votes, qui
n'existent nulle part ailleurs.

## 3. Application web

```bash
cd ~/aubesonore/site
# .env restauré à l'étape 1 (secrets d'auth, SMTP, base, clé YouTube)
docker compose up -d --build
ln -s ~/aubesonore/site/scripts/systemd/* ~/.config/systemd/user/
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
ln -s ~/musilogy-data musilogy/data   # raw/ et out/ restaurés à l'étape 1 ; work/ se refait (`musilogy run`)
cd musilogy && uv sync
# puis `uv run musilogy load` avec l'environnement libpq de musilogy/CLAUDE.md (« Charger la base du site »)
```

## Vérifier que tout est remonté

```bash
docker ps                                   # azuracast, gatus, aubesonore-{db,backend,frontend,renderer}
systemctl --user list-timers                # 7 timers : aubesonore-{backup,deploy}, azuracast-backup, radio-{backup,grille,remind,weekly}
systemctl --user is-active radio-votes      # page de vote ; 127.0.0.1:8040 répond 403 sans Cloudflare Access
cd ~/aubesonore/pipeline && .venv/bin/pytest -q -W error && .venv/bin/radio report
```

Le vrai test de bout en bout reste une passe `radio-weekly` complète : elle touche
l'API AzuraCast, le disque média et la base SQLite d'un seul coup.
