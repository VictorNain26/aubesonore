#!/usr/bin/env bash
# Les outils du pipeline hors Python, sans sudo, pour un poste comme pour la CI : rsgain (la
# version de production, et non la 3.4 d'apt), le modèle EffNet officiel, et fpcalc s'il manque.
# Chaque téléchargement est vérifié par sa somme épinglée ; un outil déjà en place n'est pas
# retéléchargé. ffmpeg et ffprobe viennent du gestionnaire de paquets (apt install ffmpeg).
#   scripts/dev-setup.sh            # binaires dans ~/.local/bin, modèle dans pipeline/models/
#   BIN_DIR=/ailleurs scripts/dev-setup.sh
set -euo pipefail

PIPELINE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
# Renovate signale une nouvelle version (renovate.json) ; la somme se remplace à la main.
RSGAIN_VERSION=3.8
RSGAIN_URL="https://github.com/complexlogic/rsgain/releases/download/v$RSGAIN_VERSION/rsgain-$RSGAIN_VERSION-Linux.tar.xz"
RSGAIN_SHA256=4939de3b2022a50edc0751343b10a791ea8c1c9ca6505012f21413bf8de365a0
# La release 1.5.1 de chromaprint ne publie pas de somme : celle-ci est celle de l'archive
# téléchargée le 2026-10-16. Même version que le fpcalc d'Ubuntu en production.
FPCALC_VERSION=1.5.1
FPCALC_URL="https://github.com/acoustid/chromaprint/releases/download/v$FPCALC_VERSION/chromaprint-fpcalc-$FPCALC_VERSION-linux-x86_64.tar.gz"
FPCALC_SHA256=4d7433a7f778e5946d7225230681cbcd634e153316ecac87c538c33ac32387a5
# L'URL et la somme du modèle n'existent qu'à un endroit : le code qui le vérifie.
AUDIO_PY="$PIPELINE_DIR/radio/signals/audio.py"
MODEL_URL=$(grep -m1 -oE 'https://essentia\.upf\.edu/[^"]+\.pb' "$AUDIO_PY" || true)
MODEL_SHA256=$(sed -nE 's/^MODEL_SHA256 = "([0-9a-f]{64})"$/\1/p' "$AUDIO_PY")
MODEL="$PIPELINE_DIR/models/${MODEL_URL##*/}"
[[ -n "$MODEL_URL" && -n "$MODEL_SHA256" ]] || { echo "URL ou somme du modèle introuvable dans $AUDIO_PY" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# fetch URL SHA256 DEST : télécharge à côté de DEST (même disque, donc mv atomique), vérifie,
# puis remplace DEST d'un coup.
fetch() {
  mkdir -p "$(dirname "$3")"
  curl -fsSL --retry 3 -o "$3.partial" "$1"
  echo "$2  $3.partial" | sha256sum -c --quiet || { rm -f "$3.partial"; return 1; }
  mv "$3.partial" "$3"
}

mkdir -p "$BIN_DIR"

if "$BIN_DIR/rsgain" --version 2>/dev/null | grep -qF " $RSGAIN_VERSION "; then
  echo "rsgain $RSGAIN_VERSION : déjà dans $BIN_DIR"
else
  fetch "$RSGAIN_URL" "$RSGAIN_SHA256" "$work/rsgain.tar.xz"
  tar -xJf "$work/rsgain.tar.xz" -C "$work"
  install -m 755 "$work/rsgain-$RSGAIN_VERSION-Linux/rsgain" "$BIN_DIR/rsgain"
  echo "rsgain $RSGAIN_VERSION : installé dans $BIN_DIR"
fi

if command -v fpcalc >/dev/null; then
  echo "fpcalc : déjà là ($(command -v fpcalc))"
else
  fetch "$FPCALC_URL" "$FPCALC_SHA256" "$work/fpcalc.tar.gz"
  tar -xzf "$work/fpcalc.tar.gz" -C "$work"
  install -m 755 "$work"/chromaprint-fpcalc-*/fpcalc "$BIN_DIR/fpcalc"
  echo "fpcalc $FPCALC_VERSION : installé dans $BIN_DIR"
fi

if [[ -f "$MODEL" ]] && echo "$MODEL_SHA256  $MODEL" | sha256sum -c --quiet 2>/dev/null; then
  echo "modèle EffNet : déjà dans $MODEL"
else
  fetch "$MODEL_URL" "$MODEL_SHA256" "$MODEL"
  echo "modèle EffNet : téléchargé dans $MODEL"
fi

for tool in ffmpeg ffprobe; do
  command -v "$tool" >/dev/null || echo "$tool absent : l'installer par le gestionnaire de paquets (apt install ffmpeg)" >&2
done
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "$BIN_DIR n'est pas dans le PATH : les tests y cherchent rsgain et fpcalc" >&2 ;;
esac
