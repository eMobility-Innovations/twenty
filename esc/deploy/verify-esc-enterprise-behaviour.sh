#!/usr/bin/env bash
#
# Asserts that an image REPORTS ENTERPRISE AS VALID — by running its own compiled
# code, not by grepping it.
#
#   ./esc/deploy/verify-esc-enterprise-behaviour.sh twenty-esc-sso:v2.0.0-ssrf1
#   ./esc/deploy/verify-esc-enterprise-behaviour.sh --compare imageA imageB
#
# The fork has two routes to the same semantics — option B patches the compiled
# file, option A builds from the source overlay — and `nest build` pretty-prints
# what the patch injects onto a signature line. The two produce DIFFERENT COMPILED
# TEXT FOR IDENTICAL SEMANTICS, so a text check cannot serve both:
# `verify-esc-image.sh` fails on a correct source image, and
# `build-source-image.sh`'s own check greps for `return true`, which upstream
# already ships twice, so it cannot fail at all. This runs the methods instead.
#
# Exit 0 only when all four of isValid, hasValidEnterpriseValidityToken,
# getLicenseInfo().isValid and getSubscriptionStatus().status === 'active' report
# valid. In --compare mode, only when both images agree on all four.
#
# Read-only with respect to the image: it starts a short-lived `node` with
# --network none, no ports, no volumes, and --rm.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROBE="${SCRIPT_DIR}/enterprise-behaviour-probe.cjs"
DOCKER="${DOCKER:-docker}"

probe_image() {
  # --network none matters twice over: it proves the answer owes nothing to a
  # licensing server, and it stops an unpatched getSubscriptionStatus() from
  # actually calling one.
  $DOCKER run --rm -i --network none --memory 512m \
    --entrypoint node "$1" - < "${PROBE}"
}

# The probe prints one canonical verdict line. Matching the JSON instead is a trap:
# `isValid` appears at the top level AND inside reportsEnterpriseValid, so a glob over
# the document can pair a true from one with a false from the other. This also keeps
# the script free of any dependency on the HOST having node — only the image needs it.
verdict_of() {
  printf '%s\n' "$1" | grep '^ESC_ENTERPRISE_VERDICT:' || echo 'ESC_ENTERPRISE_VERDICT: (no verdict — the probe did not complete)'
}

ALL_VALID='ESC_ENTERPRISE_VERDICT: isValid=true hasValidEnterpriseValidityToken=true licenceIsValid=true subscriptionActive=true'

all_valid() {
  [ "$1" = "${ALL_VALID}" ]
}

if [ ! -f "${PROBE}" ]; then
  echo "enterprise-behaviour: probe missing at ${PROBE}" >&2
  exit 2
fi

if [ "${1:-}" = "--compare" ]; then
  A="${2:-}"; B="${3:-}"
  [ -n "${A}" ] && [ -n "${B}" ] || { echo "usage: $0 --compare <imageA> <imageB>" >&2; exit 2; }

  printf '== %s\n' "${A}"
  REPORT_A="$(probe_image "${A}")"
  VERDICT_A="$(verdict_of "${REPORT_A}")"
  printf '   %s\n' "${VERDICT_A}"

  printf '== %s\n' "${B}"
  REPORT_B="$(probe_image "${B}")"
  VERDICT_B="$(verdict_of "${REPORT_B}")"
  printf '   %s\n' "${VERDICT_B}"

  if [ "${VERDICT_A}" != "${VERDICT_B}" ]; then
    echo >&2
    echo "enterprise-behaviour: THE TWO IMAGES DISAGREE." >&2
    echo "  ${A}: ${VERDICT_A}" >&2
    echo "  ${B}: ${VERDICT_B}" >&2
    echo "  Option B is option A's rollback. They must present the same licence." >&2
    exit 1
  fi

  if ! all_valid "${VERDICT_A}"; then
    echo >&2
    echo "enterprise-behaviour: the images agree, and they agree on the WRONG answer." >&2
    echo "  ${VERDICT_A}" >&2
    exit 1
  fi

  echo
  echo "enterprise-behaviour: both images report enterprise valid, identically."
  exit 0
fi

IMAGE="${1:-}"
[ -n "${IMAGE}" ] || { echo "usage: $0 <image> | $0 --compare <imageA> <imageB>" >&2; exit 2; }

printf '== %s\n' "${IMAGE}"
REPORT="$(probe_image "${IMAGE}")"
printf '%s\n' "${REPORT}"

VERDICT="$(verdict_of "${REPORT}")"
printf '\n   %s\n' "${VERDICT}"

if ! all_valid "${VERDICT}"; then
  echo >&2
  echo "enterprise-behaviour: FAIL — this image does NOT report enterprise as valid." >&2
  echo "  Every signed-in user would see \"Your enterprise key is no longer valid\"." >&2
  echo "  Extend esc/overlay/.../enterprise-plan.service.ts to cover every method" >&2
  echo "  esc/deploy/patch-enterprise.cjs patches, then rebuild." >&2
  exit 1
fi

echo
echo "enterprise-behaviour: OK — the image reports enterprise valid on all four methods."
