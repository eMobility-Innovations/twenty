#!/usr/bin/env bash
#
# Runs every deploy-script test suite and aggregates the result.
#
#   ./esc/deploy/tests/run-tests.sh
#
# Wired into ./verify.sh. Unlike the wizard's jest suite, this needs no `node_modules`
# and no datastores, so it RUNS on the shared gate runner rather than skipping there —
# which matters, because these scripts are what stands between a bad image and
# production, and the repo's only other code gate cannot run on the runner at all.
#
# A suite that cannot be found is a failure, not a skip: a test file quietly renamed or
# deleted would otherwise read as green.
set -uo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; BOLD='\033[1m'; NC='\033[0m'

SUITES="
test-tree-guard.sh
test-esc-features.sh
test-enterprise-probe.sh
test-enterprise-behaviour.sh
test-compare-dist-front.sh
test-boot-smoke.sh
"

FAILED_SUITES=""
TOTAL_TESTS=0

printf "${BOLD}ESC deploy-script tests${NC}\n"

for suite in ${SUITES}; do
  path="${TESTS_DIR}/${suite}"

  if [ ! -f "${path}" ]; then
    printf "\n${RED}MISSING${NC} %s — a suite that cannot be found is a failure, not a skip\n" "${suite}"
    FAILED_SUITES="${FAILED_SUITES} ${suite}"
    continue
  fi

  output="$(bash "${path}" 2>&1)"
  rc=$?

  printf '%s\n' "${output}"

  # `s/^.*\([0-9]*\)/` is a trap here: the greedy .* leaves the group matching the LAST
  # digit only, so "16 test(s)" counted as 6 and a 71-test run reported 21. Requiring a
  # non-digit immediately before the group captures the whole number. Anchoring at the
  # line start does not work either — the summary line begins with a bold escape whose
  # own text contains a digit.
  count="$(printf '%s\n' "${output}" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) test(s),.*/\1/p' | tail -1)"
  case "${count}" in
    ''|*[!0-9]*) ;;
    *) TOTAL_TESTS=$((TOTAL_TESTS + count)) ;;
  esac

  [ "${rc}" -eq 0 ] || FAILED_SUITES="${FAILED_SUITES} ${suite}"
done

printf "\n${BOLD}==========================================${NC}\n"

if [ -n "${FAILED_SUITES}" ]; then
  printf "${RED}deploy-script tests FAILED${NC} in:%s\n" "${FAILED_SUITES}"
  exit 1
fi

printf "${GREEN}deploy-script tests: all %s passed${NC}\n" "${TOTAL_TESTS}"
