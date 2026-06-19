#!/usr/bin/env bash
# esc/esc-deploy.sh — point the CT 175 `twenty-esc` stack at the ESC custom image
# and roll it, with a snapshot + one-step rollback. Idempotent.
#
# Usage (on CT 175):
#   ./esc/esc-deploy.sh v2.0.0
#
# Safety: snapshots docker-compose.yml before editing, only touches the
# `twenty-esc` stack (never twenty-rc), and prints the rollback command.
set -euo pipefail

VERSION="${1:?usage: esc-deploy.sh <version, e.g. v2.0.0>}"
STACK_DIR="${STACK_DIR:-/root/twenty-esc}"
IMAGE="twenty-esc-sso:${VERSION}"

cd "${STACK_DIR}"

# Image must already exist locally (built by esc-build.sh / esc-upgrade.sh).
if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
  echo "ERROR: ${IMAGE} not found locally. Build it first: esc/esc-build.sh" >&2
  exit 1
fi

TS="$(date +%Y%m%d_%H%M%S)"
cp docker-compose.yml "docker-compose.yml.bak.${TS}"
echo "==> Snapshot: ${STACK_DIR}/docker-compose.yml.bak.${TS}"

sed -i "s#image: twenty-esc-sso:[^[:space:]]*#image: ${IMAGE}#g; s#image: twentycrm/twenty:[^[:space:]]*#image: ${IMAGE}#g" docker-compose.yml

echo "==> twenty-esc now points at ${IMAGE}; rolling..."
docker compose up -d

sleep 5
CODE="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/healthz || true)"
echo "==> healthz: ${CODE} (expect 200)"
echo "==> Rollback (one step): cp docker-compose.yml.bak.${TS} docker-compose.yml && docker compose up -d"
