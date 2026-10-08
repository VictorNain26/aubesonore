# Runbook — remonter la radio depuis zéro

Ordre de remontage : **AzuraCast → pipeline → application web**. Les deux derniers
consomment le premier ; l'inverse n'est jamais vrai. Les trois vivent dans un seul
dépôt, cloné une fois :

```bash
git clone https://github.com/VictorNain26/aubesonore.git ~/aubesonore
loginctl enable-linger                # les unités systemd tournent sans session ouverte
```

Ce fichier vit ici parce qu'AzuraCast est la seule brique qui ne sache pas se
reconstruire seule depuis un dépôt public.

## Ce qu'il faut avoir sauvegardé

| Élément | Où il vit | Versionné | Sans lui |
|---|---|---|---|
| `docker-compose.yml`, `.env.example` | ce dépôt | oui | rien ne redémarre |
| `azuracast.env` (dont `MYSQL_PASSWORD`) | hors git | non — restic | base inaccessible |
| `.env` | hors git | non — restic, ou `.env.example` | ports par défaut, collisions |
| `stations/` (média) | NVMe | restic, quotidien | catalogue perdu |
| `stations/*/config/` | NVMe | inclus dans la sauvegarde AzuraCast | station à reconfigurer |
| Base MariaDB | volume Docker | sauvegarde AzuraCast quotidienne | métadonnées, comptes, playlists |

Depuis le 2026-10-03, `azuracast-backup.timer` (04:45, `scripts/backup-media.sh`,
unités dans `scripts/systemd/`) sauvegarde
`stations/`, `docker-compose.yml`, `.env` et `azuracast.env` dans un dépôt restic chiffré,
`/media/plex/.backups/restic`, disque distinct du NVMe ; rétention 7 jours, 4 semaines,
6 mois ; battement de cœur Gatus `radio_sauvegarde-medias`. Cela remplace l'arbitrage
d'août 2026, qui laissait les médias sans sauvegarde. La base MariaDB a sa propre
sauvegarde quotidienne (~2 Mo, même disque distinct).

**Le mot de passe du dépôt** est dans `~/.config/restic/password`, sur le NVMe : sans
une copie gardée ailleurs, la perte du NVMe rend le dépôt illisible.

## 1. AzuraCast

restic s'installe depuis le binaire officiel signé (https://restic.readthedocs.io,
« Installation » : empreinte `SHA256SUMS`, signature GPG de la clé
`CF8F 18F2 8445 7597 3F79 D4E1 91A6 868B D3F7 A907`) dans `~/.local/bin/restic`.

```bash
cd ~/aubesonore/azuracast
cp .env.example .env                  # ajuster les ports si la machine a changé
# restaurer stations/, .env et azuracast.env (MYSQL_PASSWORD) depuis restic :
restic -r /media/plex/.backups/restic --password-file <copie du mot de passe> \
  restore latest --tag nightly --target /
docker compose up -d
# la copie du mot de passe reprend sa place, puis la sauvegarde quotidienne :
install -m 600 <copie du mot de passe> ~/.config/restic/password
ln -s ~/aubesonore/azuracast/scripts/systemd/* ~/.config/systemd/user/
# jeton du battement : la valeur de GATUS_AZURACAST_TOKEN de pipeline/.env (étape 2)
install -m 600 /dev/null gatus.env && echo 'GATUS_TOKEN=<jeton>' > gatus.env
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
# sockseek et rsgain : binaires figés dans ~/.local/bin (versions et sha256 : docs/vision.md)
# ffmpeg et fpcalc (libchromaprint-tools) : apt ; modèle EffNet dans models/ (radio/signals/audio.py)
cp .env.example .env                  # y remettre la clé d'API AzuraCast régénérée
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
cp .env.example .env                  # secrets d'auth, SMTP, base, clé YouTube
docker compose up -d --build
ln -s ~/aubesonore/site/scripts/systemd/* ~/.config/systemd/user/
systemctl --user enable --now aubesonore-deploy.timer aubesonore-backup.timer
```

Restaurer PostgreSQL depuis le dump le plus récent de `/media/plex/.backups/aubesonore`
**dans une base jetable d'abord** — vérifier qu'il se lit avant de le passer sur la
production.

## Vérifier que tout est remonté

```bash
docker ps                                   # azuracast, gatus, aubesonore-{db,backend,frontend,renderer}
systemctl --user list-timers                # 7 timers : aubesonore-{backup,deploy}, azuracast-backup, radio-{backup,grille,remind,weekly}
systemctl --user is-active radio-votes      # page de vote ; 127.0.0.1:8040 répond 403 sans Cloudflare Access
cd ~/aubesonore/pipeline && .venv/bin/pytest -q -W error && .venv/bin/radio report
```

Le vrai test de bout en bout reste une passe `radio-weekly` complète : elle touche
l'API AzuraCast, le disque média et la base SQLite d'un seul coup.
