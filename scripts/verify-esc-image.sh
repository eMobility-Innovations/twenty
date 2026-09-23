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
#   DOCKER='sudo docker' ./scripts/verify-esc-image.sh   # on a CT, where the socket needs it
#
# Exit codes: 0 all checks passed · 1 a check FAILED · 3 COULD NOT MEASURE.
set -euo pipefail

CONTAINER="${CONTAINER:-twenty-esc-server-1}"
# 🔧 FIXED 2026-09-23 (fix 3). Every command in here was a bare `docker`, while every
# documented command on the production host is `sudo docker` — CT175's invoking user
# cannot reach the socket. The consequence was not a clean error: the enterprise probe's
# failure was swallowed by `|| true` into an EMPTY report, whose verdict then did not
# match, and this script announced "FAIL enterprise does NOT report valid" about a
# perfectly good image. A false alarm about the licence, during a cutover, is the worst
# moment this could pick to be wrong. Honour DOCKER, and separate "could not ask" from
# "asked and got a bad answer".
DOCKER="${DOCKER:-docker}"
DIST=/app/packages/twenty-server/dist
PASS=0; FAIL=0

check() { # name, command
  local output
  local status=0

  output="$(eval "$2" 2>&1)" || status=$?

  if [ "${status}" -eq 0 ]; then
    echo "  PASS $1"; PASS=$((PASS+1))
  else
    echo "  FAIL $1"
    echo "       the check exited ${status}"
    [ -n "${output}" ] && printf '%s\n' "${output}" | sed 's/^/       /'
    FAIL=$((FAIL+1))
  fi
}

echo "ESC Twenty image verification — container ${CONTAINER}"

# Establish that the container can be asked AT ALL before any verdict is printed about
# what it contains. A container that is absent, stopped, or behind a socket this user
# cannot reach is "could not measure" — never a FAIL about the image's contents.
INSPECT_STATUS=0
INSPECT_OUT="$(${DOCKER} inspect "${CONTAINER}" --format '{{.State.Running}}' 2>&1)" || INSPECT_STATUS=$?

if [ "${INSPECT_STATUS}" -ne 0 ]; then
  echo "CANNOT MEASURE — no such container '${CONTAINER}', or docker is unusable here." >&2
  printf '%s\n' "${INSPECT_OUT}" | sed 's/^/  /' >&2
  echo "  On a CT the socket needs sudo: DOCKER='sudo docker' $0" >&2
  exit 3
fi

if [ "${INSPECT_OUT}" != "true" ]; then
  echo "CANNOT MEASURE — container '${CONTAINER}' exists but is not running." >&2
  echo "  A stopped container cannot be asked what it carries. This is not a FAIL." >&2
  exit 3
fi

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
  # `2>/dev/null || true` used to live on this line, and it is what turned an unusable
  # docker into a licence alarm: the probe's own error went to the bin, the report came
  # back empty, and an empty report has no verdict line, so the else-branch below fired.
  # An empty or short read is a DEGRADED SOURCE, never a measurement.
  ENTERPRISE_STATUS=0
  ENTERPRISE_REPORT="$(${DOCKER} exec -i "${CONTAINER}" node - < "${ENTERPRISE_PROBE}" 2>&1)" \
    || ENTERPRISE_STATUS=$?
  ENTERPRISE_VERDICT="$(printf '%s\n' "${ENTERPRISE_REPORT}" | grep '^ESC_ENTERPRISE_VERDICT:' || true)"
  ALL_VALID='ESC_ENTERPRISE_VERDICT: isValid=true hasValidEnterpriseValidityToken=true licenceIsValid=true subscriptionActive=true'

  if [ "${ENTERPRISE_STATUS}" -ne 0 ] || [ -z "${ENTERPRISE_VERDICT}" ]; then
    echo "CANNOT MEASURE — the enterprise probe did not complete inside ${CONTAINER}" >&2
    echo "  (exit ${ENTERPRISE_STATUS}, and no ESC_ENTERPRISE_VERDICT line came back)." >&2
    echo "  This says nothing about the licence. Do not read it as a failure." >&2
    printf '%s\n' "${ENTERPRISE_REPORT}" | sed 's/^/    /' >&2
    exit 3
  fi

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
  "${DOCKER} exec ${CONTAINER} grep -q 'ESC_SSRF_ALLOWED_HOSTS' ${DIST}/engine/core-modules/secure-http-client/utils/is-private-ip.util.js"

# The allowlist is inert unless the environment names a host. Absent is not a failure —
# it is the safe default — but it IS worth saying out loud, because a workflow that
# calls an internal endpoint will fail with "Request to internal IP address ... is not
# allowed" and the cause is here, not in the workflow.
if ${DOCKER} exec "${CONTAINER}" sh -c '[ -n "$ESC_SSRF_ALLOWED_HOSTS" ]' >/dev/null 2>&1; then
  echo "  INFO allowlist is active: $(${DOCKER} exec "${CONTAINER}" sh -c 'echo $ESC_SSRF_ALLOWED_HOSTS')"
else
  echo "  INFO allowlist is EMPTY — the guard behaves exactly as upstream ships it"
fi

echo "${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ]
