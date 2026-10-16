#!/bin/sh
# Battement de cœur vers Gatus, lancé par l'ExecStopPost d'une unité radio-*, même en échec :
# $SERVICE_RESULT vaut « success » ou la cause (systemd.exec(5), « Environment Variables Set or
# Propagated by the Service Manager »). $GATUS_TOKEN vient du .env de l'unité.
#   ExecStopPost=-%h/aubesonore/pipeline/deploy/heartbeat.sh radio_<endpoint>
# Préfixé de « - » (systemd.service(5), « Command lines ») : un Gatus injoignable ou qui répond
# 404 ne fait pas échouer une passe réussie (radio-grille, 2026-10-02) ; le battement manqué
# déclenche quand même l'alerte de silence.
set -eu
endpoint=$1
result=${SERVICE_RESULT:-inconnu}
if [ "$result" = success ]; then ok=true; else ok=false; fi
exec curl -fsS -m 10 -X POST -H "Authorization: Bearer $GATUS_TOKEN" \
  "http://127.0.0.1:8050/api/v1/endpoints/$endpoint/external?success=$ok&error=$result"
