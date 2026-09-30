#!/usr/bin/env bash
# Let's Encrypt certificate for BASE_DOMAIN and its subdomains (CLAUDE.md §3), on the server.
#   cert.sh         issue the certificate if it is missing (stops nginx briefly: standalone on port 80)
#   cert.sh renew   renew through the running nginx (webroot) and reload it; run daily by cron
# ACME_EMAIL in .env (optional) receives expiry notices.
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV_FILE=${ENV_FILE:-/opt/backgammon/.env}

env_get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '' || true; }
DOMAIN=$(env_get BASE_DOMAIN)
EMAIL=$(env_get ACME_EMAIL)
[ -n "$DOMAIN" ] || { echo "BASE_DOMAIN missing in $ENV_FILE" >&2; exit 1; }

COMPOSE=(docker compose -f infra/docker-compose.yml -f infra/docker-compose.server.yml --env-file "$ENV_FILE")
CERTBOT=(docker run --rm -v /etc/letsencrypt:/etc/letsencrypt -v /var/www/certbot:/var/www/certbot)
mkdir -p /var/www/certbot

if [ "${1:-}" = renew ]; then
  "${CERTBOT[@]}" certbot/certbot renew --webroot -w /var/www/certbot --quiet
  "${COMPOSE[@]}" exec -T nginx nginx -s reload
  exit 0
fi

[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ] && exit 0

if [ -n "$EMAIL" ]; then CONTACT=(--email "$EMAIL"); else CONTACT=(--register-unsafely-without-email); fi
"${COMPOSE[@]}" stop nginx >/dev/null 2>&1 || true
"${CERTBOT[@]}" -p 80:80 certbot/certbot certonly --standalone --non-interactive --agree-tos "${CONTACT[@]}" \
  --cert-name "$DOMAIN" -d "$DOMAIN" -d "www.$DOMAIN" -d "app.$DOMAIN" -d "m.$DOMAIN" -d "admin.$DOMAIN"
