#!/usr/bin/env bash
#
# Build the ESC front-only image layer: the CRM frontend, rebuilt from this checkout with
# the ESC overlay applied, laid over an existing ESC image whose server is left alone.
#
# The two halves run on DIFFERENT hosts on purpose, because they need different things:
#
#   --front-only   compiles the frontend. Wants ~8 GB of Node heap, so it runs on the build
#                  host and REFUSES to run on CT175.
#   --layer-only   copies that output into an image. It is one docker COPY, needs no heap,
#                  and must run wherever the BASE IMAGE lives — which today is CT175's local
#                  docker store and nowhere else on earth.
#
# Usage:
#   ./esc/deploy/build-front-layer.sh --front-only
#   ./esc/deploy/build-front-layer.sh --layer-only <base-image> <new-tag>
#   ./esc/deploy/build-front-layer.sh <base-image> <new-tag>        # both, one host
#
# Environment:
#   REACT_APP_SERVER_BASE_URL   required for the front build. Compiled INTO the bundle by
#                               vite. A bundle built with the wrong value points the browser
#                               at the wrong API host and nothing in the image says so.
#   DOCKER                      docker command (default: docker; 'sudo docker' on a CT)
#   FRONT_BUILD_DIR             where the built frontend is (default: the checkout's
#                               packages/twenty-front/build). --layer-only reads it from
#                               here. A front build always WRITES to the checkout path —
#                               see the reconciliation note further down.
#   ESC_IMAGE_SAVE_DIR          where the layer's rollback tarball is written (default: $PWD)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKER="${DOCKER:-docker}"

# vite's outDir for twenty-front, and nothing in this script can move it. It gets its own
# name so the place the build WRITES and the place the checks READ can never drift apart —
# see fix 2 below for what happened while they were allowed to.
BUILT_FRONT_DIR="${REPO_ROOT}/packages/twenty-front/build"
FRONT_BUILD_DIR="${FRONT_BUILD_DIR:-${BUILT_FRONT_DIR}}"

DO_FRONT=true
DO_LAYER=true
DO_SAVE=true
BASE_IMAGE=""
NEW_TAG=""

usage() {
    cat <<USAGE
usage: $0 [--front-only|--layer-only] [--no-save] <base-image> <new-tag>

  --front-only   compile the frontend only (takes no positional arguments)
  --layer-only   lay an already-built frontend over <base-image> as <new-tag>
  --no-save      do not write the rollback tarball (only when one exists elsewhere)
USAGE
}

# 🔧 FIXED 2026-09-23 (fix 9). Flag parsing used to inspect ONLY $1, so
# `build-front-layer.sh <base> <tag> --front-only` silently dropped the flag and ran the
# whole build. On CT175 that leaves the production-host refusal below as the only thing
# standing between the operator and an 8 GB Node heap on the box that carries production
# Postgres, Redis and two CRM stacks in 8 GB total. A flag that can be silently ignored is
# not a control. Parse the whole line, and refuse what is not understood rather than
# quietly treating it as an image name.
ARG_COUNT=0

while [ $# -gt 0 ]; do
    case "$1" in
        --front-only) DO_LAYER=false; shift ;;
        --layer-only) DO_FRONT=false; shift ;;
        --no-save)    DO_SAVE=false;  shift ;;
        --help|-h)    usage; exit 0 ;;
        --)           shift; break ;;
        -*)
            echo "unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
        *)
            ARG_COUNT=$((ARG_COUNT + 1))
            case "${ARG_COUNT}" in
                1) BASE_IMAGE="$1" ;;
                2) NEW_TAG="$1" ;;
                *) echo "unexpected argument: $1" >&2; usage >&2; exit 2 ;;
            esac
            shift
            ;;
    esac
done

if [ "${DO_FRONT}" = false ] && [ "${DO_LAYER}" = false ]; then
    echo "--front-only and --layer-only are mutually exclusive." >&2
    exit 2
fi

if [ "${DO_LAYER}" = true ] && { [ -z "${BASE_IMAGE}" ] || [ -z "${NEW_TAG}" ]; }; then
    usage >&2
    exit 2
fi

if [ "${DO_LAYER}" = false ] && [ "${ARG_COUNT}" -gt 0 ]; then
    echo "--front-only takes no positional arguments, but got: ${BASE_IMAGE} ${NEW_TAG}" >&2
    echo "  It compiles the frontend; no base image is involved." >&2
    exit 2
fi

# 🔧 FIXED 2026-09-23 (fix 1). This was `is_production_host()`, whose whole body was the
# exit status of `${DOCKER} ps ... 2>/dev/null | grep -qx ...` — and that FAILS OPEN. On
# CT175 the invoking user cannot reach the docker socket without sudo, so `docker ps`
# errors, its stderr is discarded, grep matches nothing, and the guard reports "not
# production" — letting the 8 GB-heap frontend build run on the production host, which is
# the exact accident it exists to prevent. It was one missing `sudo` away the whole time.
#
# "docker says no such container" and "docker could not be asked" are different answers,
# and only the first is permission to continue.
assert_not_production_host() {
    local names
    local status=0

    names="$(${DOCKER} ps --format '{{.Names}}' 2>&1)" || status=$?

    if [ "${status}" -ne 0 ]; then
        echo "REFUSING: could not ask docker what is running on this host." >&2
        echo "  '${DOCKER} ps' exited ${status}, so this host CANNOT be distinguished" >&2
        echo "  from CT175 — where an 8 GB frontend build takes production down." >&2
        echo "  docker said:" >&2
        printf '%s\n' "${names}" | sed 's/^/    /' >&2
        echo "  On a CT the socket needs sudo: DOCKER='sudo docker' $0 ..." >&2
        exit 1
    fi

    if printf '%s\n' "${names}" | grep -qx 'twenty-esc-server-1'; then
        echo "REFUSING: twenty-esc-server-1 runs on this host, so this is CT175." >&2
        echo "  Build the frontend on the build host, then bring the output here and use" >&2
        echo "  --layer-only, which needs no heap." >&2
        exit 1
    fi
}

# 🔧 ADDED 2026-09-23 (fix 7). Nothing verified that the BASE IMAGE was an ESC image at
# all. A layer built over a bare twentycrm/twenty:v2.0.0 gives a perfectly healthy
# container with a working Tour button that has SILENTLY LOST both compiled server
# patches: the enterprise bypass (every signed-in user then sees "your enterprise key is
# no longer valid", with SSO gated behind it) and the SSRF allowlist (one workflow stops
# working, quietly). The only check that said so was scripts/verify-esc-image.sh, which
# runs against the container AFTER it is already serving users. Ask the base image before
# the new tag exists.
#
# The enterprise half is a BEHAVIOUR probe rather than a grep, for a measured reason:
# option B regex-injects `return true;` onto the compiled signature line, while a source
# build's `nest build` pretty-prints the same semantics across three lines. The two routes
# emit different text for identical behaviour, so no grep serves both — that check has
# already been wrong in both directions. See esc/deploy/enterprise-behaviour-probe.cjs.
assert_base_image_is_esc() {
    local base="$1"
    local probe="${REPO_ROOT}/esc/deploy/enterprise-behaviour-probe.cjs"
    local all_valid='ESC_ENTERPRISE_VERDICT: isValid=true hasValidEnterpriseValidityToken=true licenceIsValid=true subscriptionActive=true'
    local report verdict
    local status=0

    if [ ! -f "${probe}" ]; then
        echo "REFUSING: the enterprise behaviour probe is missing at ${probe}," >&2
        echo "  so this base image cannot be shown to be an ESC image." >&2
        exit 1
    fi

    echo "==> checking that ${base} is an ESC image and not a bare upstream tag"

    # --network none matters twice over: it proves the answer owes nothing to a licensing
    # server, and it stops an UNPATCHED getSubscriptionStatus() from actually calling one.
    report="$(${DOCKER} run --rm -i --network none --memory 512m \
        --entrypoint node "${base}" - < "${probe}" 2>&1)" || status=$?

    if [ "${status}" -ne 0 ]; then
        echo "REFUSING: could not run the enterprise probe inside ${base} (exit ${status})." >&2
        echo "  That is 'could not measure', not 'measured and fine'. It is not a pass." >&2
        printf '%s\n' "${report}" | sed 's/^/    /' >&2
        exit 1
    fi

    verdict="$(printf '%s\n' "${report}" | grep '^ESC_ENTERPRISE_VERDICT:' || true)"

    if [ "${verdict}" != "${all_valid}" ]; then
        echo "REFUSING: ${base} is NOT an ESC image — it does not report enterprise valid." >&2
        echo "  Laying this frontend over it ships a CRM that tells every signed-in user" >&2
        echo "  \"your enterprise key is no longer valid\", with SSO gated behind it." >&2
        echo "  The base must be an ESC image (twenty-esc-sso:*), never twentycrm/twenty:*." >&2
        printf '%s\n' "${report}" | sed 's/^/    /' >&2
        exit 1
    fi

    # The SSRF allowlist is the OTHER compiled patch, and it is the quiet one: losing it
    # breaks a workflow that calls an internal endpoint and nothing else looks wrong. It is
    # a plain marker in one compiled file that both routes emit identically, so a grep is
    # the right tool here where it was the wrong one above.
    if ! ${DOCKER} run --rm --network none --entrypoint sh "${base}" -c \
        'grep -q ESC_SSRF_ALLOWED_HOSTS /app/packages/twenty-server/dist/engine/core-modules/secure-http-client/utils/is-private-ip.util.js' \
        >/dev/null 2>&1; then
        echo "REFUSING: ${base} carries the enterprise patch but NOT the SSRF allowlist." >&2
        echo "  ESC_SSRF_ALLOWED_HOSTS is absent from is-private-ip.util.js, so a workflow" >&2
        echo "  calling an internal host would fail with \"Request to internal IP address" >&2
        echo "  ... is not allowed\" — and nothing else would look wrong." >&2
        exit 1
    fi

    echo "==> base image carries both compiled server patches"
}

assert_tour_in_build() {
    # The tour compiles down to these data attributes. Their absence means the overlay did
    # not reach the bundle — which is exactly what a green build with an unapplied overlay
    # looks like. This proves the code is PRESENT; it does not prove it RUNS.
    if ! grep -rqs 'esc-tour' "${FRONT_BUILD_DIR}/assets"; then
        echo "THE BUILT BUNDLE DOES NOT CONTAIN THE TOUR." >&2
        echo "  Looked for 'esc-tour' under ${FRONT_BUILD_DIR}/assets" >&2
        echo "  The overlay was not applied, or this build output is stale." >&2
        exit 1
    fi
}

if [ "${DO_FRONT}" = true ]; then
    # It must be SET, and it is allowed to be EMPTY — because on CT175 it IS empty. The
    # browser gets the API host at runtime from window._env_, which the image entrypoint
    # writes from SERVER_URL; the build-time define is the fallback underneath it. Baking a
    # URL in where production has none is a difference from production that nothing in the
    # image would report, so the value is taken deliberately rather than defaulted.
    if [ -z "${REACT_APP_SERVER_BASE_URL+set}" ]; then
        echo "REACT_APP_SERVER_BASE_URL is not set (set it to empty if production's is empty)." >&2
        echo "  Read it off the running container rather than trusting a note:" >&2
        echo "    docker inspect twenty-esc-server-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep REACT_APP_SERVER_BASE_URL" >&2
        echo "  Measured on CT175, 2026-09-22: it is EMPTY, and SERVER_URL carries the host." >&2
        exit 2
    fi

    # CT175 runs production Postgres, Redis and two CRM stacks in 8 GB. The frontend build
    # asks for an 8 GB Node heap on its own. This is the refusal boot-smoke-test.sh makes.
    assert_not_production_host

    # 🔧 FIXED 2026-09-23 (fix 2). The build wrote to a hard-coded
    # packages/twenty-front/build while the post-build existence check and the tour grep
    # both read ${FRONT_BUILD_DIR}. Anyone who exported FRONT_BUILD_DIR — the documented
    # variable, used in the --layer-only invocation on the same terminal, DEPLOY.md line
    # 330 — got one of two wrong answers: a good build reported as "BUILD PRODUCED NO
    # index.html", or a PASS measured against a stale directory left by an earlier run.
    # Neither is recoverable by reading the output. vite's outDir cannot move, so the
    # checks are what have to follow the build.
    if [ "${FRONT_BUILD_DIR}" != "${BUILT_FRONT_DIR}" ]; then
        echo "NOTE: FRONT_BUILD_DIR=${FRONT_BUILD_DIR} does not apply to a front BUILD."
        echo "  vite writes twenty-front to ${BUILT_FRONT_DIR}, which is not configurable"
        echo "  from here, so the checks below follow the build rather than the variable."
        echo "  FRONT_BUILD_DIR is for --layer-only, on the host that holds the base image."
        FRONT_BUILD_DIR="${BUILT_FRONT_DIR}"
    fi

    # Refuse a bad base BEFORE spending twenty minutes compiling a frontend that would
    # only be refused afterwards.
    if [ "${DO_LAYER}" = true ]; then
        assert_base_image_is_esc "${BASE_IMAGE}"
    fi

    echo "==> applying the ESC overlay"
    "${REPO_ROOT}/esc/esc-apply.sh" --no-verify

    rm -rf "${BUILT_FRONT_DIR}"

    if [ "${ESC_FRONT_BUILD_MODE:-docker}" = "docker" ]; then
        # Upstream's own twenty-front-build stage, used exactly as upstream wrote it. This
        # is the reproducible route: the build host needs docker and nothing else — no node,
        # no yarn, no corepack, and no 14-minute yarn install to keep in step with the
        # lockfile by hand. CT140 is a GitLab box; it should not grow a JS toolchain.
        echo "==> building twenty-front in docker (upstream's twenty-front-build stage)"
        ${DOCKER} build \
            --target twenty-front-build \
            --build-arg "REACT_APP_SERVER_BASE_URL=${REACT_APP_SERVER_BASE_URL}" \
            -f "${REPO_ROOT}/packages/twenty-docker/twenty/Dockerfile" \
            -t "${ESC_FRONT_BUILD_IMAGE:-esc-front-build:latest}" \
            "${REPO_ROOT}"

        echo "==> extracting the built frontend"
        EXTRACT_ID="$(${DOCKER} create "${ESC_FRONT_BUILD_IMAGE:-esc-front-build:latest}")"
        mkdir -p "$(dirname "${BUILT_FRONT_DIR}")"
        ${DOCKER} cp "${EXTRACT_ID}:/app/packages/twenty-front/build" \
            "${BUILT_FRONT_DIR}"
        ${DOCKER} rm -f "${EXTRACT_ID}" >/dev/null
    else
        echo "==> building twenty-front on this host (ESC_FRONT_BUILD_MODE=host)"
        (
            cd "${REPO_ROOT}"
            npx nx run twenty-front:lingui:extract
            npx nx run twenty-front:lingui:compile
            REACT_APP_SERVER_BASE_URL="${REACT_APP_SERVER_BASE_URL}" \
                NODE_OPTIONS="--max-old-space-size=8192" \
                npx nx build twenty-front
        )
    fi

    if [ ! -f "${FRONT_BUILD_DIR}/index.html" ]; then
        echo "BUILD PRODUCED NO index.html at ${FRONT_BUILD_DIR}" >&2
        exit 1
    fi
    assert_tour_in_build
    echo "==> tour markers found in the built bundle"

    if [ "${DO_LAYER}" = false ]; then
        cat <<NEXT

Frontend built at ${FRONT_BUILD_DIR}

Carry it to the host that holds the base image, then build the layer there:

  tar -C "$(dirname "${FRONT_BUILD_DIR}")" -czf twenty-front-build.tar.gz "$(basename "${FRONT_BUILD_DIR}")"
  # ...copy it over, unpack it, and on that host:
  FRONT_BUILD_DIR=/path/to/build DOCKER='sudo docker' \\
    ./esc/deploy/build-front-layer.sh --layer-only <base-image> <new-tag>
NEXT
        exit 0
    fi
fi

if [ ! -f "${FRONT_BUILD_DIR}/index.html" ]; then
    echo "NO FRONTEND BUILD at ${FRONT_BUILD_DIR}" >&2
    echo "  Run --front-only on the build host first and bring its output here." >&2
    exit 1
fi
assert_tour_in_build

# In --layer-only the front half never ran, so this is where the base gets asked.
if [ "${DO_FRONT}" = false ]; then
    assert_base_image_is_esc "${BASE_IMAGE}"
fi

echo "==> building the image layer ${NEW_TAG} FROM ${BASE_IMAGE}"
BUILD_CONTEXT="$(mktemp -d)"
trap 'rm -rf "${BUILD_CONTEXT}"' EXIT
cp -R "${FRONT_BUILD_DIR}" "${BUILD_CONTEXT}/build"
cp "${REPO_ROOT}/esc/deploy/Dockerfile.front-layer" "${BUILD_CONTEXT}/Dockerfile"

${DOCKER} build \
    --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
    -t "${NEW_TAG}" \
    "${BUILD_CONTEXT}"

echo "==> verifying the image that was just built"
DOCKER="${DOCKER}" "${REPO_ROOT}/scripts/verify-esc-tour.sh" --image "${NEW_TAG}"

# 🔧 ADDED 2026-09-23 (fix 8). This used to be step 1 of a printed checklist — "save it
# off this host" — and a printed step is one that gets skipped exactly once. On 2026-09-22
# two of this fork's images vanished from CT175's image store with no attribution, which
# made the documented one-step rollback inert and forced a full rebuild. The fork's images
# live in exactly one place, so the save belongs in the build, and the tarball gets read
# back: an unverified archive is the same as no archive on the day it is needed.
SAVED_TARBALL=""

if [ "${DO_SAVE}" = true ]; then
    SAVE_DIR="${ESC_IMAGE_SAVE_DIR:-$(pwd)}"
    SAVED_TARBALL="${SAVE_DIR}/${NEW_TAG//[:\/]/_}.tar.gz"

    mkdir -p "${SAVE_DIR}"
    echo "==> saving ${NEW_TAG} to ${SAVED_TARBALL}"
    ${DOCKER} save "${NEW_TAG}" | gzip > "${SAVED_TARBALL}"

    echo "==> reading the tarball back"
    if ! gzip -t "${SAVED_TARBALL}"; then
        echo "THE SAVED IMAGE TARBALL IS CORRUPT: ${SAVED_TARBALL}" >&2
        echo "  Do not deploy this image — its rollback copy cannot be restored." >&2
        echo "  The usual cause is a full filesystem; check df on this host." >&2
        exit 1
    fi

    # `gzip -t` alone proves the bytes decompress, which a gzip of anything at all does.
    # A rollback copy has to be an IMAGE ARCHIVE, so ask for the one entry every
    # `docker save` produces. The listing goes to a file rather than straight into grep:
    # `tar -tf - | grep -q` makes grep exit on the first hit, tar die of SIGPIPE, and
    # `set -o pipefail` report a failure for a tarball that was perfectly fine.
    SAVE_LISTING="${BUILD_CONTEXT}/saved-image-listing.txt"

    if ! gunzip -c "${SAVED_TARBALL}" | tar -tf - > "${SAVE_LISTING}" 2>/dev/null \
        || ! grep -q '^manifest\.json$' "${SAVE_LISTING}"; then
        echo "THE SAVED TARBALL IS NOT A DOCKER IMAGE ARCHIVE: ${SAVED_TARBALL}" >&2
        echo "  It decompresses, but it carries no manifest.json, so 'docker load' has" >&2
        echo "  nothing to restore. Do not deploy this image without a rollback copy." >&2
        exit 1
    fi

    echo "==> rollback tarball verified ($(grep -c '' "${SAVE_LISTING}") entries, $(du -h "${SAVED_TARBALL}" | cut -f1)): ${SAVED_TARBALL}"
else
    echo "==> --no-save: NO rollback tarball was written for ${NEW_TAG}"
fi

cat <<NEXT

Built: ${NEW_TAG}

It carries the server of ${BASE_IMAGE} unchanged, and that base was probed before this
layer existed: it reports enterprise valid on all four methods and carries the SSRF
allowlist.

Before it goes anywhere:

  1. Rollback copy: ${SAVED_TARBALL:-NONE — you passed --no-save}
     Restore it with: gunzip -c <tarball> | ${DOCKER} load
  2. Deploy with 'docker compose up -d', never 'down' — twenty-ingest-app-1 shares
     twenty-esc_default.
  3. Re-run the SERVER checks against the running container:
       CONTAINER=twenty-esc-server-1 ./scripts/verify-esc-image.sh
  4. Check the tour's anchors against the LIVE workspace — the one thing no bundle grep
     can see, because a renamed object makes a step vanish rather than break:
       DOCKER='${DOCKER}' ./scripts/verify-esc-tour.sh --anchors-only
  5. Open the CRM in a real browser and click Tour. Nothing before this point proves the
     tour runs — only that it is present.
NEXT
