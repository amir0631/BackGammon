#!/usr/bin/env bash
# Server half of deploy.sh: swaps in the uploaded source, builds the images one at a time (small
# server) and starts the stack. Migrations run in the `migrate` service.
# URL_SCHEME=https in .env: TLS override, certificate issued if missing, daily renewal cron.
# URL_SCHEME=http: plain HTTP on port 80 (staging preview until a domain with a certificate exists).
set -euo pipefail
DIR=/opt/backgammon
cd "$DIR"
[ -f .env ] || { echo "$DIR/.env is missing (copy .env.example and fill it in)" >&2; exit 1; }
sed -i 's/\r$//' .env

ln -sfn ../.env src.new/.env  # the compose file reads ../.env relative to infra/
rm -rf src.old
[ -d src ] && mv src src.old
mv src.new src
cd src

COMPOSE=(docker compose -f infra/docker-compose.yml)
if grep -qx 'URL_SCHEME=https' "$DIR/.env"; then
  COMPOSE+=(-f infra/docker-compose.server.yml)
  bash infra/deploy/cert.sh
  echo "17 3 * * * root bash $DIR/src/infra/deploy/cert.sh renew >> /var/log/backgammon-cert.log 2>&1" \
    > /etc/cron.d/backgammon-cert
else
  rm -f /etc/cron.d/backgammon-cert
fi
COMPOSE+=(--env-file "$DIR/.env")

for svc in backend bot mobile admin; do "${COMPOSE[@]}" build "$svc"; done
"${COMPOSE[@]}" up -d --remove-orphans
docker image prune -f >/dev/null
"${COMPOSE[@]}" ps
