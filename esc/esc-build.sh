#!/usr/bin/env bash
# esc/esc-build.sh — build the ESC custom Twenty image (enterprise gate removed).
#
# Usage:
#   ./esc/esc-build.sh                 # builds twenty-esc-sso:v2.0.0 (default)
#   TWENTY_VERSION=v2.1.0 ./esc/esc-build.sh
#
# Run on a host with Docker (CT 175 has it). The build fails loudly if the
# upstream enterprise service changed shape — that is intentional.
set -euo pipefail

TWENTY_VERSION="${TWENTY_VERSION:-v2.0.0}"
IMAGE="${IMAGE:-twenty-esc-sso:${TWENTY_VERSION}}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Building ${IMAGE} from twentycrm/twenty:${TWENTY_VERSION}"
docker build \
  --build-arg "TWENTY_VERSION=${TWENTY_VERSION}" \
  -t "${IMAGE}" \
  "${HERE}"

echo "==> Built ${IMAGE}"
echo "    Verify the patch landed in the image:"
echo "    docker run --rm --entrypoint node ${IMAGE} -e \"console.log(require('/app/packages/twenty-server/dist/engine/core-modules/enterprise/services/enterprise-plan.service.js'))\" >/dev/null 2>&1 || true"
echo "    docker run --rm --entrypoint grep ${IMAGE} -n 'isValid() { return true' /app/packages/twenty-server/dist/engine/core-modules/enterprise/services/enterprise-plan.service.js"
