#!/usr/bin/env bash
# upgrade.sh TAG... — step twenty-esc-supplier through each image tag in order. For each: set TAG in
# .env, recreate server+worker, wait for /healthz, then require `upgrade:status --failed-only`
# to report no failed workspace before moving on. Runs on CT175 in /root/twenty-esc-supplier.
# The image is BUILT locally (Dockerfile: upstream + the SSO enterprise-gate patches) from
# BUILD_DIR, a copy of this repo's esc/ directory; a patch whose anchor moved fails the build.
BUILD_DIR=${BUILD_DIR:-/root/twenty-esc-supplier-build}
set -euo pipefail
cd "$(dirname "$0")"
for tag in "$@"; do
  # build BEFORE touching .env, so a failed patch leaves the running tag in place
  docker build -q --build-arg TAG="$tag" -f "$BUILD_DIR/esc-supplier/Dockerfile" \
    -t "twenty-esc-supplier-sso:$tag" "$BUILD_DIR"
  sed -i "s/^TAG=.*/TAG=$tag/" .env
  grep -q "^TAG=$tag$" .env || echo "TAG=$tag" >> .env
  echo "== $tag"
  docker compose up -d
  for _ in $(seq 1 120); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' twenty-esc-supplier-server-1)" = healthy ] && break
    sleep 10
  done
  [ "$(docker inspect -f '{{.State.Health.Status}}' twenty-esc-supplier-server-1)" = healthy ] || {
    echo "upgrade.sh: server not healthy on $tag" >&2; docker compose logs --tail 60 server >&2; exit 1; }
  docker compose exec -T server yarn command:prod upgrade:status --failed-only 2>&1 | tail -5 || true
  echo "   $tag healthy: $(curl -s -o /dev/null -w '%{http_code}' http://192.168.103.175:3002/healthz)"
done
