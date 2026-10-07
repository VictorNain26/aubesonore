#!/usr/bin/env bash
# Tells Gatus how a oneshot ended: run from ExecStopPost=, which sets
# $SERVICE_RESULT (systemd.exec(5)). The site's own token sits in site/.env;
# Gatus's endpoints are in pipeline/deploy/gatus/config/config.yaml.
set -euo pipefail

key=$1
token=$(sed -n 's/^GATUS_TOKEN=//p' "$(dirname "$0")/../.env")
success=false
[ "$SERVICE_RESULT" = success ] && success=true

curl -fsS -m 10 -X POST -H "Authorization: Bearer $token" \
  "http://127.0.0.1:8050/api/v1/endpoints/$key/external?success=$success&error=$SERVICE_RESULT"
