#!/usr/bin/env bash
# Covers esc/deploy/compare-dist-front.sh — the frontend check the preflight critic
# found nobody had: every other gate is server-side, and /healthz never renders a
# component, so a server can boot green while the CRM serves a broken bundle.
set -uo pipefail
. "$(dirname "$0")/harness.sh"

SCRIPT="${DEPLOY_DIR}/compare-dist-front.sh"

REF=reference:1
CAND=candidate:1

printf '\n== compare-dist-front.sh\n'

begin "two bundles of the same shape pass, exit 0"
setup_scratch
stub_front_tree "${REF}"  100 2494 1000
stub_front_tree "${CAND}" 100 2494 1000
out="$("${SCRIPT}" "${REF}" "${CAND}" 2>&1)"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "same shape" && pass
teardown_scratch

# The design decision this test exists to protect: asset filenames carry content
# hashes, so a real change moves every path. A check demanding equality would fire on
# every correct build and be switched off within a week. Different names, same shape,
# must PASS.
begin "different filenames but the same shape still pass"
setup_scratch
stub_front_tree "${REF}"  100 2494 1000
stub_front_tree "${CAND}" 100 2494 1000
mv "${DOCKER_STUB_STATE}/cp/$(cid_for "${CAND}")/front/assets/asset-1.js" \
   "${DOCKER_STUB_STATE}/cp/$(cid_for "${CAND}")/front/assets/asset-1.deadbeef.js"
out="$("${SCRIPT}" "${REF}" "${CAND}" 2>&1)"; rc=$?
assert_exit 0 $rc && pass
teardown_scratch

# What a failed frontend build actually looks like: a handful of files, not 20% fewer.
begin "a collapsed bundle fails, exit 1"
setup_scratch
stub_front_tree "${REF}"  100 2494 1000
stub_front_tree "${CAND}"   3 2494 1000
out="$("${SCRIPT}" "${REF}" "${CAND}" 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "DO NOT SWAP" && pass
teardown_scratch

begin "an index.html below the floor fails even when the file count is fine"
setup_scratch
stub_front_tree "${REF}"  100 2494 1000
stub_front_tree "${CAND}" 100   12 1000
out="$("${SCRIPT}" "${REF}" "${CAND}" 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "not a page" && pass
teardown_scratch

begin "a missing index.html fails"
setup_scratch
stub_front_tree "${REF}"  100 2494 1000
stub_front_tree "${CAND}" 100    0 1000
out="$("${SCRIPT}" "${REF}" "${CAND}" 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "not a page" && pass
teardown_scratch

begin "a bundle far larger than the reference also fails"
setup_scratch
stub_front_tree "${REF}"  100 2494 1000
stub_front_tree "${CAND}" 100 2494 9000
out="$("${SCRIPT}" "${REF}" "${CAND}" 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "outside" && pass
teardown_scratch

begin "a 10% difference is within tolerance and passes"
setup_scratch
stub_front_tree "${REF}"  100 2494 1000
stub_front_tree "${CAND}"  91 2494 1000
out="$("${SCRIPT}" "${REF}" "${CAND}" 2>&1)"; rc=$?
assert_exit 0 $rc && pass
teardown_scratch

begin "the tolerance is configurable, and a tighter one catches a 10% move"
setup_scratch
stub_front_tree "${REF}"  100 2494 1000
stub_front_tree "${CAND}"  91 2494 1000
out="$(ESC_FRONT_TOLERANCE_PERCENT=2 "${SCRIPT}" "${REF}" "${CAND}" 2>&1)"; rc=$?
assert_exit 1 $rc && pass
teardown_scratch

# An image with no dist/front at all is not "a small difference", it is the wrong image.
begin "an image with no dist/front fails with a clear reason"
setup_scratch
stub_front_tree "${REF}" 100 2494 1000
out="$("${SCRIPT}" "${REF}" "${CAND}" 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "not a complete server image" && pass
teardown_scratch

begin "missing arguments are a usage error"
setup_scratch
out="$("${SCRIPT}" only-one:1 2>&1)"; rc=$?
assert_exit 2 $rc && pass
teardown_scratch

# The script must not let a passing collapse check be read as "the UI works".
begin "a pass says out loud that a human still has to open the page"
setup_scratch
stub_front_tree "${REF}"  100 2494 1000
stub_front_tree "${CAND}" 100 2494 1000
out="$("${SCRIPT}" "${REF}" "${CAND}" 2>&1)"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "not proof the UI works" && pass
teardown_scratch

summary
