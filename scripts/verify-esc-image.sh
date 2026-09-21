#!/usr/bin/env bash
#
# ESC Twenty — verify the RUNNING image still carries both option-B patches.
#
# verify-esc-features.sh checks the SOURCE overlay (option A). This one checks what is
# actually running, which is the thing that breaks: option-B patches live only in the
# built image, so an upgrade that rebuilds from a new upstream tag without re-running
# the patches produces a healthy-looking container that has silently lost them. SSO
# would fail loudly; the SSRF allowlist would fail quietly, as one workflow that stops
# working.
#
#   ./scripts/verify-esc-image.sh                     # against the local docker host
#   CONTAINER=twenty-esc-server-1 ./scripts/verify-esc-image.sh
set -euo pipefail

CONTAINER="${CONTAINER:-twenty-esc-server-1}"
DIST=/app/packages/twenty-server/dist
PASS=0; FAIL=0

check() { # name, command
  if eval "$2" >/dev/null 2>&1; then echo "  PASS $1"; PASS=$((PASS+1));
  else echo "  FAIL $1"; FAIL=$((FAIL+1)); fi
}

echo "ESC Twenty image verification — container ${CONTAINER}"

check "enterprise gate bypassed (isValid returns true)" \
  "docker exec ${CONTAINER} grep -q 'isValid() { return true;' ${DIST}/engine/core-modules/enterprise/services/enterprise-plan.service.js"

check "SSRF allowlist present in isPrivateIp" \
  "docker exec ${CONTAINER} grep -q 'ESC_SSRF_ALLOWED_HOSTS' ${DIST}/engine/core-modules/secure-http-client/utils/is-private-ip.util.js"

# The allowlist is inert unless the environment names a host. Absent is not a failure —
# it is the safe default — but it IS worth saying out loud, because a workflow that
# calls an internal endpoint will fail with "Request to internal IP address ... is not
# allowed" and the cause is here, not in the workflow.
if docker exec "${CONTAINER}" sh -c '[ -n "$ESC_SSRF_ALLOWED_HOSTS" ]' >/dev/null 2>&1; then
  echo "  INFO allowlist is active: $(docker exec "${CONTAINER}" sh -c 'echo $ESC_SSRF_ALLOWED_HOSTS')"
else
  echo "  INFO allowlist is EMPTY — the guard behaves exactly as upstream ships it"
fi

echo "${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ]
