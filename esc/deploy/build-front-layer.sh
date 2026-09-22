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
#                               packages/twenty-front/build). --layer-only reads it from here.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKER="${DOCKER:-docker}"
FRONT_BUILD_DIR="${FRONT_BUILD_DIR:-${REPO_ROOT}/packages/twenty-front/build}"

DO_FRONT=true
DO_LAYER=true

case "${1:-}" in
    --front-only) DO_LAYER=false; shift ;;
    --layer-only) DO_FRONT=false; shift ;;
esac

BASE_IMAGE="${1:-}"
NEW_TAG="${2:-}"

if [ "${DO_LAYER}" = true ] && { [ -z "${BASE_IMAGE}" ] || [ -z "${NEW_TAG}" ]; }; then
    echo "usage: $0 [--front-only|--layer-only] <base-image> <new-tag>" >&2
    exit 2
fi

is_production_host() {
    ${DOCKER} ps --format '{{.Names}}' 2>/dev/null | grep -qx 'twenty-esc-server-1'
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
    if [ -z "${REACT_APP_SERVER_BASE_URL:-}" ]; then
        echo "REACT_APP_SERVER_BASE_URL is not set." >&2
        echo "  Read it off the running image rather than trusting a note:" >&2
        echo "    docker inspect twenty-esc-server-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep REACT_APP_SERVER_BASE_URL" >&2
        exit 2
    fi

    # CT175 runs production Postgres, Redis and two CRM stacks in 8 GB. The frontend build
    # asks for an 8 GB Node heap on its own. This is the refusal boot-smoke-test.sh makes.
    if is_production_host; then
        echo "REFUSING: twenty-esc-server-1 runs on this host, so this is CT175." >&2
        echo "  Build the frontend on the build host, then bring the output here and use" >&2
        echo "  --layer-only, which needs no heap." >&2
        exit 1
    fi

    echo "==> applying the ESC overlay"
    "${REPO_ROOT}/esc/esc-apply.sh" --no-verify

    rm -rf "${REPO_ROOT}/packages/twenty-front/build"

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
        mkdir -p "${REPO_ROOT}/packages/twenty-front"
        ${DOCKER} cp "${EXTRACT_ID}:/app/packages/twenty-front/build" \
            "${REPO_ROOT}/packages/twenty-front/build"
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

cat <<NEXT

Built: ${NEW_TAG}

It carries the server of ${BASE_IMAGE} unchanged. Before it goes anywhere:

  1. Save it OFF this host. The fork's images live in exactly one place today, and on
     2026-09-22 two of them vanished from CT175 with no attribution — which made the
     documented one-step rollback inert and forced a full rebuild:
       ${DOCKER} save ${NEW_TAG} | gzip > ${NEW_TAG//[:\/]/_}.tar.gz
  2. Deploy with 'docker compose up -d', never 'down' — twenty-ingest-app-1 shares
     twenty-esc_default.
  3. Re-run the SERVER checks against the running container. A layer built over a bare
     upstream tag silently loses both compiled server patches, and only this says so:
       CONTAINER=twenty-esc-server-1 ./scripts/verify-esc-image.sh
  4. Open the CRM in a real browser and click Tour. Nothing before this point proves the
     tour runs — only that it is present.
NEXT
