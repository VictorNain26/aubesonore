#!/usr/bin/env bash
# Sauvegarde restic de ce qu'aucune autre sauvegarde ne couvre : les médias de
# l'antenne (stations/) et la configuration non versionnée d'AzuraCast (.env,
# azuracast.env, dont MYSQL_PASSWORD). Dépôt chiffré sur /media/plex, disque
# physique distinct du NVMe. La base a sa propre sauvegarde, faite par AzuraCast.
#
# Le mot de passe du dépôt est dans ~/.config/restic/password, sur le NVMe :
# il doit aussi être gardé ailleurs, sans lui le dépôt est illisible.
set -euo pipefail

AZURACAST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESTIC="$HOME/.local/bin/restic"
export RESTIC_REPOSITORY=/media/plex/.backups/restic
export RESTIC_PASSWORD_FILE="$HOME/.config/restic/password"

if ! mountpoint -q /media/plex; then
    echo "/media/plex is not mounted, refusing to back up onto the NVMe" >&2
    exit 1
fi

# 20 Mio/s : le 2026-08-18, le contrôleur USB de sda a cessé de répondre sous
# écriture soutenue (~100 Mo/s). La cause n'est pas établie ; on reste loin de
# ce régime.
"$RESTIC" backup --limit-upload 20480 --tag nightly \
    "$AZURACAST/stations" \
    "$AZURACAST/docker-compose.yml" \
    "$AZURACAST/.env" \
    "$AZURACAST/azuracast.env"

"$RESTIC" forget --tag nightly --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune

# Une sauvegarde illisible ressemble à une sauvegarde : la structure du dépôt
# est relue à chaque passage.
"$RESTIC" check
