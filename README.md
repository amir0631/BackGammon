# Takhte Nard — online 3D backgammon

Product and engineering rules: [CLAUDE.md](CLAUDE.md). UX foundation: [docs/ux/foundation](docs/ux/foundation).

## Layout

| Path | What |
| --- | --- |
| `apps/mobile` | `m.` surface (Next.js 15, PWA) |
| `apps/admin` | `admin.` panel (Next.js 15) |
| `backend` | Django 5 API, Channels WebSocket, Celery |
| `packages/*` | Shared TS: protocol, api-client, game-core, game3d, i18n, design-tokens, device-routing |
| `infra` | Docker Compose, Nginx |

## Run the full stack locally

Requires Docker Desktop. Browsers resolve `*.localhost` to your machine, so no hosts-file edits are needed.

```sh
cp .env.example .env        # then set DJANGO_SECRET_KEY, POSTGRES_PASSWORD, SEED_ENCRYPTION_KEY
docker compose -f infra/docker-compose.yml --env-file .env up -d --build
```

- Mobile app: http://m.localhost
- Admin panel: http://admin.localhost
- API health: http://m.localhost/api/v1/health
- http://app.localhost and http://localhost redirect to `m.` (Phase 1, `DESKTOP_ENABLED=false`)

Set `HTTP_PORT` in `.env` if port 80 is taken.

### Test accounts

```sh
docker compose -f infra/docker-compose.yml --env-file .env exec backend python manage.py seed_testers
```

Creates `tester1`…`tester5` (phone `09000000001`…, 100 signup bonus + 1000 coins each) and a superadmin
`admin`, and prints every password plus the admin's authenticator secret (add it to Google Authenticator or
any TOTP app; the admin login asks for its 6-digit code). Options: `--count`, `--coins`, `--password`,
`--admin`, `--admin-password`. Re-running rotates the passwords and keeps coins and the authenticator.
Refused when `APP_ENV=production`.

SMS is off by default (`sms.enabled`): signup needs no code, and withdrawals are confirmed with the password.

## Develop

```sh
pnpm install
pnpm dev          # Next.js dev servers (mobile :3000, admin :3001)
pnpm lint && pnpm typecheck && pnpm test
```

Backend tests run in the backend image against the Compose Postgres:

```sh
docker compose -f infra/docker-compose.yml --env-file .env run --rm \
  --build -e DJANGO_DEBUG=true backend sh -c "pip install -q -r requirements-dev.txt && pytest"
```

## Deployment

Local first, then the server (CLAUDE.md §22.2). Never commit `.env` or `Arvan.txt`.

The server runs the same Compose stack plus [infra/docker-compose.server.yml](infra/docker-compose.server.yml)
(TLS on nginx, Let's Encrypt certificate for the root, `www.`, `app.`, `m.` and `admin.`). Its environment lives
only at `/opt/backgammon/.env` on the server (same keys as `.env.example`, with `URL_SCHEME=https`).

```sh
DEPLOY_TARGET=root@<server-ip> infra/deploy/deploy.sh   # deploys the committed HEAD
```

It uploads `git archive HEAD` to `/opt/backgammon/src`, issues the certificate if missing, builds the images one
at a time, runs migrations and starts the stack. A daily cron renews the certificate. To move to another domain,
change `BASE_DOMAIN` in the server `.env` and deploy again. With `URL_SCHEME=http` the server skips TLS and
serves plain HTTP on port 80 (staging preview only: no PWA install, no dice verification, no secure cookies).
