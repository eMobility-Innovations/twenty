#!/usr/bin/env bash
# upgrade.sh TAG... — step twenty-rc through each image tag in order. For each: set TAG in
# .env, recreate server+worker, wait for /healthz, then require `upgrade:status --failed-only`
# to report no failed workspace before moving on. Runs on CT175 in /root/twenty-rc.
set -euo pipefail
cd "$(dirname "$0")"
for tag in "$@"; do
  sed -i "s/^TAG=.*/TAG=$tag/" .env
  grep -q "^TAG=$tag$" .env || echo "TAG=$tag" >> .env
  echo "== $tag"
  docker compose pull -q server worker
  docker compose up -d
  for _ in $(seq 1 120); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' twenty-rc-server-1)" = healthy ] && break
    sleep 10
  done
  [ "$(docker inspect -f '{{.State.Health.Status}}' twenty-rc-server-1)" = healthy ] || {
    echo "upgrade.sh: server not healthy on $tag" >&2; docker compose logs --tail 60 server >&2; exit 1; }
  docker compose exec -T server yarn command:prod upgrade:status --failed-only 2>&1 | tail -5 || true
  echo "   $tag healthy: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/healthz)"
done
