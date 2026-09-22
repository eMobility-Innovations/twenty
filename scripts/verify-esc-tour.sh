#!/usr/bin/env bash
#
# Verify that the ESC tour is present in a built image, or in the container that is running.
#
#   ./scripts/verify-esc-tour.sh --image twenty-esc-sso:v2.0.0-tour1
#   ./scripts/verify-esc-tour.sh --container twenty-esc-server-1
#   ./scripts/verify-esc-tour.sh                     # defaults to --container twenty-esc-server-1
#
# WHAT THIS PROVES, AND WHAT IT DOES NOT
#
# It proves the compiled tour code is in the frontend the image serves, and that the
# frontend was replaced as a whole (index.html references an asset that exists). That is a
# real check: the failure it catches is an image built with the overlay unapplied, which
# otherwise produces a perfectly healthy container with no Tour button in it.
#
# It does NOT prove the tour runs. Nothing that greps a bundle can. A human clicking Tour in
# a browser is the proof, and it is a numbered step of the deploy in esc/deploy/DEPLOY.md.
set -euo pipefail

DOCKER="${DOCKER:-docker}"
MODE="container"
TARGET="twenty-esc-server-1"
FRONT="/app/packages/twenty-server/dist/front"

while [ $# -gt 0 ]; do
    case "$1" in
        --image)     MODE="image";     TARGET="${2:?--image needs a tag}";     shift 2 ;;
        --container) MODE="container"; TARGET="${2:?--container needs a name}"; shift 2 ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done

run_in_target() {
    if [ "${MODE}" = "image" ]; then
        ${DOCKER} run --rm --network none --entrypoint sh "${TARGET}" -c "$1"
    else
        ${DOCKER} exec "${TARGET}" sh -c "$1"
    fi
}

PASS=0
FAIL=0

check() {
    local label="$1"
    local command="$2"

    if run_in_target "${command}" >/dev/null 2>&1; then
        echo "  PASS  ${label}"
        PASS=$((PASS + 1))
    else
        echo "  FAIL  ${label}"
        FAIL=$((FAIL + 1))
    fi
}

echo "esc-tour: checking ${MODE} ${TARGET}"

check "frontend directory exists" \
    "test -f ${FRONT}/index.html"

check "tour code is in the served bundle" \
    "grep -rqs 'esc-tour' ${FRONT}/assets"

check "the tour's sidebar label is in the bundle" \
    "grep -rqs 'esc-tour\"' ${FRONT}/assets || grep -rqs 'data-esc-tour' ${FRONT}/assets"

# index.html and the hashed assets must come from the SAME build. A half-replaced directory
# serves an index.html asking for a bundle that is not there — a white screen, and every
# server-side check still green.
check "index.html references an asset that exists" \
    "set -e; asset=\$(sed -n 's/.*src=\"\\/assets\\/\\([^\"]*\\)\".*/\\1/p' ${FRONT}/index.html | head -1); test -n \"\${asset}\"; test -f ${FRONT}/assets/\${asset}"

echo "esc-tour: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ]
