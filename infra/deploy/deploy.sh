#!/usr/bin/env bash
# Deploys the committed HEAD to the server (CLAUDE.md §22.2). From the repo root, in Git Bash:
#   DEPLOY_TARGET=root@<server-ip> infra/deploy/deploy.sh
# Needs SSH key access and /opt/backgammon/.env on the server (from .env.example, with
# BASE_DOMAIN, URL_SCHEME=https and production-strength keys). Uncommitted changes are not deployed.
set -euo pipefail
TARGET=${DEPLOY_TARGET:?set DEPLOY_TARGET=user@host}
DIR=/opt/backgammon

git diff --quiet HEAD || echo "warning: uncommitted changes are not deployed" >&2
git archive --format=tar HEAD |
  ssh "$TARGET" "set -e; rm -rf $DIR/src.new; mkdir -p $DIR/src.new; tar -x -C $DIR/src.new"
ssh "$TARGET" "bash $DIR/src.new/infra/deploy/remote.sh"
