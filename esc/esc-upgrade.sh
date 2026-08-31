#!/usr/bin/env bash
# esc/esc-upgrade.sh — re-apply the ESC enterprise-bypass overlay onto a NEW
# upstream Twenty version, in one command. This is the whole point of the
# overlay pattern: a Twenty upgrade stays a one-liner instead of a re-discovery.
#
# Usage (on CT 175):
#   ./esc/esc-upgrade.sh v2.1.0
#
# What it does:
#   1. Builds twenty-esc-sso:<new> from twentycrm/twenty:<new> + the patch.
#      (If upstream changed enterprise-plan.service.js, the build FAILS here —
#       fix esc/patch-enterprise.cjs + esc/PATCH_MANIFEST.md, then re-run.)
#   2. Prints the exact, reversible cutover steps for the twenty-esc stack.
#      It does NOT mutate the running stack itself — that cutover is a
#      deliberate, approved, backed-up step (see esc-deploy.sh).
set -euo pipefail

NEW_VERSION="${1:?usage: esc-upgrade.sh <twenty-version, e.g. v2.1.0>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TWENTY_VERSION="${NEW_VERSION}" IMAGE="twenty-esc-sso:${NEW_VERSION}" "${HERE}/esc-build.sh"

cat <<EOF

==> Image twenty-esc-sso:${NEW_VERSION} is built. Cutover (run on CT 175, with approval):

  cd /root/twenty-esc
  cp docker-compose.yml docker-compose.yml.bak.\$(date +%Y%m%d_%H%M%S)   # snapshot
  sed -i 's#twenty-esc-sso:[^[:space:]]*#twenty-esc-sso:${NEW_VERSION}#g' docker-compose.yml
  docker compose up -d                                                   # rolling restart
  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/healthz # expect 200

  Rollback (one step):
  cp docker-compose.yml.bak.<ts> docker-compose.yml && docker compose up -d
EOF
