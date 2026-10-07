#!/usr/bin/env bash
# The TLS material compose.yaml's Postgres requires (pg-cert-init stages it): a CA, a server
# certificate for the hosts the stack reaches it by (`postgres` on the compose network,
# `localhost` from the host on the loopback port), and the pg_hba.conf that allows TLS only.
# The same files as the production box's, made the same way. Leaves an existing set untouched.
set -euo pipefail

dir="$(cd "$(dirname "$0")/.." && pwd)/certs"
if [ -f "$dir/server.crt" ]; then
  echo "$dir already holds certificates: nothing to do"
  exit 0
fi
mkdir -p "$dir"
cd "$dir"

openssl req -x509 -new -nodes -newkey rsa:2048 -days 3650 \
  -keyout ca.key -out ca.crt -subj "/CN=AubeSonore CA/O=AubeSonore" 2>/dev/null
openssl req -new -nodes -newkey rsa:2048 \
  -keyout server.key -out server.csr -subj "/CN=postgres/O=AubeSonore" 2>/dev/null
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 3650 \
  -out server.crt -extfile <(printf 'subjectAltName=DNS:postgres,DNS:localhost') 2>/dev/null
rm -f server.csr ca.srl

cat > pg_hba.conf <<'EOF'
local   all   all                 trust
hostssl all   all   0.0.0.0/0     scram-sha-256
hostssl all   all   ::/0          scram-sha-256
EOF

chmod 600 ca.key server.key
echo "certificates written to $dir"
