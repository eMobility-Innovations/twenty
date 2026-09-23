#!/usr/bin/env bash
#
# Verify that the ESC tour is present in a built image, or in the container that is running,
# and that the routes its steps point at are routes the LIVE workspace still serves.
#
#   ./scripts/verify-esc-tour.sh --image twenty-esc-sso:v2.0.0-tour1
#   ./scripts/verify-esc-tour.sh --container twenty-esc-server-1
#   ./scripts/verify-esc-tour.sh                     # defaults to --container twenty-esc-server-1
#   ./scripts/verify-esc-tour.sh --anchors-only      # only the live anchor-drift check
#   ./scripts/verify-esc-tour.sh --container twenty-esc-server-1 --anchors   # both
#
# WHAT THIS PROVES, AND WHAT IT DOES NOT
#
# It proves the compiled tour code is in the frontend the image serves, that the sidebar
# launcher that starts it is in there too, and that the frontend was replaced as a whole
# (index.html references an asset that exists). Those are real checks: the failures they
# catch are an image built with the overlay unapplied, and an overlay that carries the tour
# module but has lost the sidebar entry — both of which otherwise produce a perfectly
# healthy container with no Tour button in it.
#
# --anchors asks a different question of a different target: the tour's steps anchor on
# object ROUTES, and an object that upstream or an admin renames makes its step vanish
# from the tour rather than break it. Nothing that greps a bundle can see that, so this
# reads the live workspace's own object metadata and compares.
#
# It does NOT prove the tour runs. Nothing that greps a bundle can. A human clicking Tour
# in a browser is the proof, and it is a numbered step of the deploy in esc/deploy/DEPLOY.md.
#
# Exit codes: 0 all checks passed · 1 a check FAILED · 2 bad usage · 3 COULD NOT MEASURE.
# 3 is its own code on purpose — "the container is not running" and "the tour is missing"
# are different answers, and this script used to give the same one for both.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER="${DOCKER:-docker}"
MODE="container"
TARGET="twenty-esc-server-1"
FRONT="/app/packages/twenty-server/dist/front"

RUN_BUNDLE=true
RUN_ANCHORS=false
DB_CONTAINER="${DB_CONTAINER:-twenty-esc-db-1}"
DB_NAME="${DB_NAME:-default}"
DB_USER="${DB_USER:-postgres}"

usage() {
    cat <<USAGE
usage: $0 [--image <tag> | --container <name>] [--anchors | --anchors-only]
          [--db-container <name>] [--db-name <name>] [--db-user <name>]
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --image)        MODE="image";     TARGET="${2:?--image needs a tag}";      shift 2 ;;
        --container)    MODE="container"; TARGET="${2:?--container needs a name}"; shift 2 ;;
        --anchors)      RUN_ANCHORS=true; shift ;;
        --anchors-only) RUN_ANCHORS=true; RUN_BUNDLE=false; shift ;;
        --db-container) DB_CONTAINER="${2:?--db-container needs a name}"; shift 2 ;;
        --db-name)      DB_NAME="${2:?--db-name needs a name}";           shift 2 ;;
        --db-user)      DB_USER="${2:?--db-user needs a name}";           shift 2 ;;
        --help|-h)      usage; exit 0 ;;
        *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
    esac
done

PASS=0
FAIL=0

run_in_target() {
    if [ "${MODE}" = "image" ]; then
        ${DOCKER} run --rm --network none --entrypoint sh "${TARGET}" -c "$1"
    else
        ${DOCKER} exec "${TARGET}" sh -c "$1"
    fi
}

# 🔧 ADDED 2026-09-23. check() below used to discard stdout AND stderr, so every failure
# printed the same bare line: a container that is not running, a docker socket that needs
# sudo, and the tour genuinely being absent were indistinguishable. Establish first that
# the target can be reached at all, and exit 3 — not 1 — when it cannot, so "could not
# measure" never reads as "measured and failed".
assert_target_reachable() {
    local out
    local status=0

    if [ "${MODE}" = "image" ]; then
        out="$(${DOCKER} image inspect "${TARGET}" --format '{{.Id}}' 2>&1)" || status=$?

        if [ "${status}" -ne 0 ]; then
            echo "esc-tour: CANNOT MEASURE — no such image '${TARGET}', or docker is unusable." >&2
            printf '%s\n' "${out}" | sed 's/^/  /' >&2
            echo "  On a CT the socket needs sudo: DOCKER='sudo docker' $0 ..." >&2
            exit 3
        fi

        return 0
    fi

    out="$(${DOCKER} inspect "${TARGET}" --format '{{.State.Running}}' 2>&1)" || status=$?

    if [ "${status}" -ne 0 ]; then
        echo "esc-tour: CANNOT MEASURE — no such container '${TARGET}', or docker is unusable." >&2
        printf '%s\n' "${out}" | sed 's/^/  /' >&2
        echo "  On a CT the socket needs sudo: DOCKER='sudo docker' $0 ..." >&2
        exit 3
    fi

    if [ "${out}" != "true" ]; then
        echo "esc-tour: CANNOT MEASURE — container '${TARGET}' exists but is not running." >&2
        echo "  A stopped container cannot be asked what it serves. This is not a FAIL." >&2
        exit 3
    fi
}

check() {
    local label="$1"
    local command="$2"
    local output
    local status=0

    output="$(run_in_target "${command}" 2>&1)" || status=$?

    if [ "${status}" -eq 0 ]; then
        echo "  PASS  ${label}"
        PASS=$((PASS + 1))
    else
        echo "  FAIL  ${label}"
        echo "        the check exited ${status}"
        if [ -n "${output}" ]; then
            printf '%s\n' "${output}" | sed 's/^/        /'
        fi
        FAIL=$((FAIL + 1))
    fi
}

if [ "${RUN_BUNDLE}" = true ]; then
    echo "esc-tour: checking ${MODE} ${TARGET}"
    assert_target_reachable

    check "frontend directory exists" \
        "test -f ${FRONT}/index.html"

    check "tour code is in the served bundle" \
        "grep -rqs 'esc-tour' ${FRONT}/assets"

    # 🔧 REPLACED 2026-09-23. This check was labelled "the tour's sidebar label is in the
    # bundle" and greped for 'esc-tour"' or 'data-esc-tour' — both of which the tour
    # OVERLAY emits on its own. So it measured the same thing as the check above it, and
    # the failure it appeared to cover was covered by nothing: the overlaid
    # NavigationDrawerOtherSection not reaching the bundle, i.e. the tour module shipping
    # in full with NO TOUR BUTTON ANYWHERE. Two checks reading one marker is one check.
    #
    # THE MARKER. The launcher renders `<NavigationDrawerItem label="Tour" …>`, a plain
    # string literal — not a lingui macro, so it survives into the bundle verbatim, and
    # the props object of a JSX call is not minified away because its keys are runtime
    # values. `label:"Tour"` is therefore emitted by the SIDEBAR ENTRY and by nothing
    # else; upstream ships no "Tour" string anywhere in twenty-front, twenty-ui or
    # twenty-shared (grepped 2026-09-23, zero hits). The same string is pinned on the
    # source side by the module's own unit test, "puts an entry called Tour in the
    # sidebar" in __tests__/EscTourNavigationDrawerItem.test.tsx, so the two move
    # together: renaming the label fails that test before it ever reaches a bundle.
    # Both spacings are accepted because a dev build does not minify.
    check "the sidebar launcher itself is in the bundle (label \"Tour\")" \
        "grep -rqs 'label:\"Tour\"' ${FRONT}/assets || grep -rqs 'label: \"Tour\"' ${FRONT}/assets"

    # index.html and the hashed assets must come from the SAME build. A half-replaced
    # directory serves an index.html asking for a bundle that is not there — a white
    # screen, and every server-side check still green.
    check "index.html references an asset that exists" \
        "set -e; asset=\$(sed -n 's/.*src=\"\\/assets\\/\\([^\"]*\\)\".*/\\1/p' ${FRONT}/index.html | head -1); test -n \"\${asset}\"; test -f ${FRONT}/assets/\${asset}"
fi

# ── LIVE ANCHOR DRIFT ────────────────────────────────────────────────────────────────
#
# 🔧 ADDED 2026-09-23. Every anchored step in the tour points at an object ROUTE, and the
# tour is deliberately forgiving: a step whose anchor is not on the page is SKIPPED, not
# an error. That is the right runtime behaviour and the wrong thing to leave unwatched —
# rename or deactivate an object and the tour just gets shorter, looking exactly like a
# tour that works. Until now the only guard was a hard-coded array inside a unit test,
# written on 2026-09-22 and true only of that day.
#
# So: read the routes OUT OF the shipped step script — never a second hand-written list,
# which is the same mistake one indirection further along — and ask the live workspace's
# own object metadata whether it still serves each one.
ESC_TOUR_STEPS_FILE=""

for candidate in \
    "${REPO_ROOT}/esc/new/packages/twenty-front/src/modules/esc-tour/constants/escTourSteps.ts" \
    "${REPO_ROOT}/packages/twenty-front/src/modules/esc-tour/constants/escTourSteps.ts"
do
    if [ -f "${candidate}" ]; then
        ESC_TOUR_STEPS_FILE="${candidate}"
        break
    fi
done

anchor_routes() {
    # Read the declared `objectNamePlural` of each step, NOT the selector strings. The
    # selectors are DERIVED from these values by escTourObjectAnchor(), and they are
    # derived into two alternatives — an exact href and a `^=` prefix for the `?viewId=`
    # form — so mining the selector text would be reading a computed value back out of
    # its own output. The step script says as much in the comment above
    # ESC_TOUR_OBJECT_ROUTES; this is the same list, read the same way.
    #
    # The helper's own signature reads `(objectNamePlural: string)`, with no quote after
    # the colon, so requiring the quote keeps the declaration out of the result.
    grep -oE "objectNamePlural: '[^']+'" "${ESC_TOUR_STEPS_FILE}" \
        | sed -E "s/^objectNamePlural: '//; s/'\$//" \
        | sort -u
}

if [ "${RUN_ANCHORS}" = true ]; then
    echo ""
    echo "esc-tour: checking the tour's anchors against the live workspace"

    if [ -z "${ESC_TOUR_STEPS_FILE}" ]; then
        echo "esc-tour: CANNOT MEASURE — escTourSteps.ts was not found under" >&2
        echo "  ${REPO_ROOT}/esc/new/... nor ${REPO_ROOT}/packages/..." >&2
        echo "  The route list is derived from that file and is never written down here." >&2
        exit 3
    fi

    echo "  steps read from ${ESC_TOUR_STEPS_FILE#"${REPO_ROOT}"/}"

    ROUTES="$(anchor_routes)"

    if [ -z "${ROUTES}" ]; then
        echo "esc-tour: CANNOT MEASURE — no step in" >&2
        echo "  ${ESC_TOUR_STEPS_FILE}" >&2
        echo "  declares an objectNamePlural. Either every anchored step lost its object," >&2
        echo "  or this extraction no longer matches how a step names one. Both are" >&2
        echo "  defects; neither is a pass." >&2
        exit 3
    fi

    # `not "isSystem"` and `"isActive"` are what the sidebar itself filters on, so this is
    # the same population the browser would be able to link to.
    LIVE_QUERY='select "namePlural" from core."objectMetadata" where "isActive" and not "isSystem"'
    LIVE_STATUS=0
    LIVE_OUTPUT="$(${DOCKER} exec -i "${DB_CONTAINER}" \
        psql -U "${DB_USER}" -d "${DB_NAME}" -At -c "${LIVE_QUERY}" 2>&1)" || LIVE_STATUS=$?

    if [ "${LIVE_STATUS}" -ne 0 ]; then
        # Skip LOUDLY and BY NAME. A drift check that goes quiet when it cannot reach its
        # source is worse than no drift check, because the green line is still there.
        echo "  SKIP  could not read the live workspace — NOTHING below was checked:" >&2
        for route in ${ROUTES}; do
            echo "  SKIP  /objects/${route} — unchecked" >&2
        done
        echo "" >&2
        echo "esc-tour: CANNOT MEASURE anchor drift." >&2
        echo "  '${DOCKER} exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME}' exited ${LIVE_STATUS}:" >&2
        printf '%s\n' "${LIVE_OUTPUT}" | sed 's/^/    /' >&2
        echo "  Run this on the host that holds the CRM database container." >&2
        echo "  On a CT the socket needs sudo: DOCKER='sudo docker' $0 --anchors-only" >&2
        exit 3
    fi

    LIVE_OBJECTS="$(printf '%s\n' "${LIVE_OUTPUT}" | sed '/^[[:space:]]*$/d' | sort -u)"

    if [ -z "${LIVE_OBJECTS}" ]; then
        echo "esc-tour: CANNOT MEASURE — the workspace reported ZERO active objects." >&2
        echo "  An empty read is a degraded source, not a workspace with nothing in it." >&2
        exit 3
    fi

    for route in ${ROUTES}; do
        if printf '%s\n' "${LIVE_OBJECTS}" | grep -qx "${route}"; then
            echo "  PASS  /objects/${route} is served by the live workspace"
            PASS=$((PASS + 1))
        else
            echo "  FAIL  /objects/${route} is NOT an active object in the live workspace"
            echo "        that step will be silently SKIPPED — the tour just gets shorter"
            echo "        fix the anchor in ${ESC_TOUR_STEPS_FILE#"${REPO_ROOT}"/}"
            FAIL=$((FAIL + 1))
        fi
    done

    # Drift in the other direction is not a failure — the tour is a guided path, not a
    # table of contents — but it is the only place anybody would notice a new object that
    # nobody thought to introduce to a new starter.
    UNCOVERED="$(printf '%s\n' "${LIVE_OBJECTS}" \
        | grep -vxF -f <(printf '%s\n' "${ROUTES}") || true)"

    if [ -n "${UNCOVERED}" ]; then
        echo "  INFO  live objects the tour does not mention: $(printf '%s' "${UNCOVERED}" | tr '\n' ' ')"
    fi
fi

echo ""
echo "esc-tour: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ]
