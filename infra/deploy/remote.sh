#!/usr/bin/env bash
# Server half of deploy.sh: swaps in the uploaded source, makes sure the certificate exists, builds
# the images one at a time (small server) and starts the stack. Migrations run in the `migrate` service.
set -euo pipefail
DIR=/opt/backgammon
cd "$DIR"
[ -f .env ] || { echo "$DIR/.env is missing (copy .env.example and fill it in)" >&2; exit 1; }

ln -sfn ../.env src.new/.env  # the compose file reads ../.env relative to infra/
rm -rf src.old
[ -d src ] && mv src src.old
mv src.new src
cd src

bash infra/deploy/cert.sh

COMPOSE=(docker compose -f infra/docker-compose.yml -f infra/docker-compose.server.yml --env-file "$DIR/.env")
for svc in backend bot mobile admin; do "${COMPOSE[@]}" build "$svc"; done
"${COMPOSE[@]}" up -d --remove-orphans
docker image prune -f >/dev/null

echo "17 3 * * * root bash $DIR/src/infra/deploy/cert.sh renew >> /var/log/backgammon-cert.log 2>&1" \
  > /etc/cron.d/backgammon-cert
"${COMPOSE[@]}" ps
