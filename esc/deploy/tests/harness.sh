#!/usr/bin/env bash
#
# A very small test harness for the deploy scripts, and a fake `docker`.
#
# WHY NOT JEST: `verify.sh`'s wizard suite needs `node_modules`, which the shared gate
# runner's payload does not carry, so that gate SKIPS itself there — loudly, but it
# skips. These tests are plain POSIX-ish shell with no dependencies, so they run
# everywhere, including on the runner. The scripts they cover are the ones that stand
# between a bad image and production; a gate that cannot run is not a gate.
#
# WHY A FAKE DOCKER: the real scripts each start containers and take minutes. What
# needs testing is not docker, it is the DECISIONS — does the script refuse when it
# should, does it pass when it should, does it exit non-zero when it says FAIL. So
# `docker` is stubbed, driven by files in a scratch directory, and the scripts run
# unmodified against it.
#
# Every test asserts on the script's EXIT CODE as well as its output. A script that
# prints FAIL and exits 0 is the exact defect this repo has already shipped twice.

set -uo pipefail

TESTS_RUN=0
TESTS_FAILED=0
CURRENT_TEST=""

RED='\033[0;31m'; GREEN='\033[0;32m'; BOLD='\033[1m'; NC='\033[0m'

TEST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${TEST_ROOT}/.." && pwd)"
REPO_DIR="$(cd "${DEPLOY_DIR}/../.." && pwd)"

SCRATCH=""

setup_scratch() {
  SCRATCH="$(mktemp -d)"
  export DOCKER_STUB_STATE="${SCRATCH}/stub"
  mkdir -p "${DOCKER_STUB_STATE}" "${SCRATCH}/bin"
  install_docker_stub
  export PATH="${SCRATCH}/bin:${PATH}"
}

teardown_scratch() {
  [ -n "${SCRATCH}" ] && rm -rf "${SCRATCH}"
  SCRATCH=""
}

# The stub answers from files so each test can shape docker's behaviour without
# touching the scripts. Unknown subcommands succeed silently: the point is to exercise
# the script's logic, not to reimplement docker.
install_docker_stub() {
  cat > "${SCRATCH}/bin/docker" <<'STUB'
#!/usr/bin/env bash
S="${DOCKER_STUB_STATE}"
echo "docker $*" >> "${S}/calls.log"

reply_file() { [ -f "${S}/$1" ] && cat "${S}/$1"; }

case "$1" in
  ps)      reply_file ps_output ;;
  images)  reply_file images_output ;;
  create)
    # The container id encodes the image, so `cp` can serve a DIFFERENT fixture tree per
    # image — which is the whole point of compare-dist-front.sh.
    img="$2"
    echo "cid-$(printf '%s' "${img}" | tr -c 'a-zA-Z0-9' '_')"
    ;;
  cp)
    # docker cp CID:PATH DEST  — copy the fixture tree prepared for that container id
    src_spec="$2"; dest="$3"
    cid="${src_spec%%:*}"
    name="${src_spec##*:}"; name="${name##*/}"
    if [ -d "${S}/cp/${cid}/${name}" ]; then
      mkdir -p "${dest}"
      cp -R "${S}/cp/${cid}/${name}" "${dest}/"
      exit 0
    fi
    exit 1
    ;;
  run)
    # The enterprise probe is invoked as: docker run ... --entrypoint node IMAGE -
    for arg in "$@"; do
      case "$arg" in
        *:*) image="$arg" ;;
      esac
    done
    if [ -f "${S}/run_output" ]; then cat "${S}/run_output"; fi
    if [ -n "${image:-}" ] && [ -f "${S}/run_output.${image}" ]; then cat "${S}/run_output.${image}"; fi
    exit "$(cat "${S}/run_rc" 2>/dev/null || echo 0)"
    ;;
  exec)
    args="$*"
    # Answers are keyed by what the command ASKS, because boot-smoke-test.sh asks the
    # same question before and after the upgrade and must get different answers. A
    # queue file is consumed one line per call; a plain file answers every call.
    answer_for() { # key
      if [ -f "${S}/queue_$1" ]; then
        head -1 "${S}/queue_$1"
        tail -n +2 "${S}/queue_$1" > "${S}/queue_$1.rest" && mv "${S}/queue_$1.rest" "${S}/queue_$1"
        return 0
      fi
      [ -f "${S}/exec_$1" ] && cat "${S}/exec_$1"
      return 0
    }
    case "${args}" in
      *pg_isready*)        exit "$(cat "${S}/pg_isready_rc" 2>/dev/null || echo 0)" ;;
      *healthz*)           answer_for healthz ;;
      *to_regclass*)       answer_for to_regclass ;;
      *upgradeMigration*WHERE*) answer_for migration_status ;;
      *'command:prod upgrade'*) answer_for upgrade
                                exit "$(cat "${S}/upgrade_rc" 2>/dev/null || echo 0)" ;;
      *DROP*|*DELETE*)     : ;;
      *)                   answer_for other ;;
    esac
    exit "$(cat "${S}/exec_rc" 2>/dev/null || echo 0)"
    ;;
  logs)    reply_file logs_output ;;
  network|rm|stop|pull) exit 0 ;;
  *)       exit 0 ;;
esac
STUB
  chmod +x "${SCRATCH}/bin/docker"
}

stub_set() { printf '%s' "$2" > "${DOCKER_STUB_STATE}/$1"; }
stub_setline() { printf '%s\n' "$2" > "${DOCKER_STUB_STATE}/$1"; }
# Answer every `docker exec` whose command matches KEY with VALUE.
stub_answer() { printf '%s\n' "$2" > "${DOCKER_STUB_STATE}/exec_$1"; }
# A queue answers one line per call, so a script asking twice gets two answers.
stub_queue() { local k="$1"; shift; : > "${DOCKER_STUB_STATE}/queue_${k}"; for v in "$@"; do printf '%s\n' "$v" >> "${DOCKER_STUB_STATE}/queue_${k}"; done; }


# --- fixtures ---------------------------------------------------------------

cid_for() { printf 'cid-%s' "$(printf '%s' "$1" | tr -c 'a-zA-Z0-9' '_')"; }

# Build a fake dist/front for an image: an index.html of INDEX_BYTES plus
# (FILE_COUNT - 1) asset files of ASSET_BYTES each.
stub_front_tree() { # image file_count index_bytes asset_bytes
  local image="$1" count="$2" index_bytes="$3" asset_bytes="$4"
  local dir="${DOCKER_STUB_STATE}/cp/$(cid_for "${image}")/front"

  mkdir -p "${dir}/assets"
  if [ "${index_bytes}" -gt 0 ]; then
    head -c "${index_bytes}" /dev/zero | tr '\0' 'x' > "${dir}/index.html"
  fi
  local i=1
  while [ "${i}" -lt "${count}" ]; do
    head -c "${asset_bytes}" /dev/zero | tr '\0' 'y' > "${dir}/assets/asset-${i}.js"
    i=$((i + 1))
  done
}

# --- assertions -------------------------------------------------------------

begin() { CURRENT_TEST="$1"; TESTS_RUN=$((TESTS_RUN + 1)); }

pass() { printf "  ${GREEN}PASS${NC} %s\n" "${CURRENT_TEST}"; }

fail() {
  printf "  ${RED}FAIL${NC} %s\n" "${CURRENT_TEST}"
  printf "       %s\n" "$1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

assert_exit() { # expected_rc actual_rc
  if [ "$1" -eq "$2" ]; then return 0; fi
  fail "expected exit $1, got $2"
  return 1
}

assert_contains() { # haystack needle
  case "$1" in
    *"$2"*) return 0 ;;
    *) fail "output did not contain: $2" ; return 1 ;;
  esac
}

assert_not_contains() {
  case "$1" in
    *"$2"*) fail "output unexpectedly contained: $2" ; return 1 ;;
    *) return 0 ;;
  esac
}

summary() {
  printf "\n${BOLD}%s test(s), %s failed${NC}\n" "${TESTS_RUN}" "${TESTS_FAILED}"
  [ "${TESTS_FAILED}" -eq 0 ]
}
