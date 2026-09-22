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

# 🔧 REPLACED 2026-09-22, and the old check was wrong in a way that only bit on the
# day it mattered. It was:
#
#   docker exec ${CONTAINER} grep -q 'isValid() { return true;' …/enterprise-plan.service.js
#
# That one-line shape exists ONLY because option B regex-injects `return true;` onto
# the signature line of the compiled file. `nest build` pretty-prints, so an option-A
# SOURCE build emits the same semantics across three lines — and this check would have
# FAILED on a correct source image, on the cutover it was meant to protect. Its sibling
# in esc/deploy/build-source-image.sh had the opposite bug: it grepped the whole file
# for `return true`, a string upstream already ships twice, so it could not fail at all.
#
# The two routes produce different compiled text for identical semantics, so no grep
# can serve both. Ask the code what it returns instead.
ENTERPRISE_PROBE="$(cd "$(dirname "$0")/.." && pwd)/esc/deploy/enterprise-behaviour-probe.cjs"

if [ ! -f "${ENTERPRISE_PROBE}" ]; then
  echo "  FAIL enterprise behaviour probe missing at ${ENTERPRISE_PROBE}"
  FAIL=$((FAIL+1))
else
  ENTERPRISE_REPORT="$(docker exec -i "${CONTAINER}" node - < "${ENTERPRISE_PROBE}" 2>/dev/null || true)"
  ENTERPRISE_VERDICT="$(printf '%s\n' "${ENTERPRISE_REPORT}" | grep '^ESC_ENTERPRISE_VERDICT:' || true)"
  ALL_VALID='ESC_ENTERPRISE_VERDICT: isValid=true hasValidEnterpriseValidityToken=true licenceIsValid=true subscriptionActive=true'

  if [ "${ENTERPRISE_VERDICT}" = "${ALL_VALID}" ]; then
    echo "  PASS enterprise reports valid on all four methods (executed, not grepped)"
    PASS=$((PASS+1))
  else
    echo "  FAIL enterprise does NOT report valid on all four methods — every signed-in user would see the invalid-key banner"
    [ -n "${ENTERPRISE_REPORT}" ] && printf '%s\n' "${ENTERPRISE_REPORT}" | sed 's/^/       /'
    FAIL=$((FAIL+1))
  fi
fi

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
