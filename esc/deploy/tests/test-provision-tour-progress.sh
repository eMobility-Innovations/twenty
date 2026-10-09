#!/usr/bin/env bash
# Covers esc/deploy/provision-esc-tour-progress.cjs — the one deploy step that WRITES to the
# production workspace's data model — against a fake /metadata endpoint that behaves like
# Twenty's: creating an object also adds a sidebar entry for it, for everyone.
set -uo pipefail
. "$(dirname "$0")/harness.sh"

SCRIPT="${DEPLOY_DIR}/provision-esc-tour-progress.cjs"
FAKE="${TEST_ROOT}/fake-metadata-server.cjs"

if ! command -v node >/dev/null 2>&1; then
  printf '\n== provision-esc-tour-progress.cjs\n  SKIPPED — no node on PATH. THIS RUN DID NOT CHECK THE PROVISIONER.\n' >&2
  exit 0
fi

FAKE_PID=""

start_fake() { # initial-state-json [extra env assignments...]
  printf '%s' "$1" > "${SCRATCH}/state.json"
  : > "${SCRATCH}/calls.log"
  rm -f "${SCRATCH}/port"
  shift
  env FAKE_STATE="${SCRATCH}/state.json" FAKE_LOG="${SCRATCH}/calls.log" \
    FAKE_PORT_FILE="${SCRATCH}/port" "$@" node "${FAKE}" &
  FAKE_PID=$!
  for _ in $(seq 1 50); do [ -s "${SCRATCH}/port" ] && break; sleep 0.1; done
}

stop_fake() { [ -n "${FAKE_PID}" ] && kill "${FAKE_PID}" 2>/dev/null; wait "${FAKE_PID}" 2>/dev/null; FAKE_PID=""; }

provision() { # args...
  TWENTY_URL="http://127.0.0.1:$(cat "${SCRATCH}/port")" TWENTY_API_KEY="${KEY:-test-key}" \
    node "${SCRIPT}" "$@" 2>&1
}

EMPTY='{"objects":[{"id":"p1","nameSingular":"person","fieldsList":[{"name":"name"}]}],"navItems":[{"id":"n-people","targetObjectMetadataId":"p1","userWorkspaceId":null}]}'

printf '\n== provision-esc-tour-progress.cjs\n'

begin "dry run is the default and writes nothing"
setup_scratch; start_fake "${EMPTY}"
out="$(provision)"; rc=$?
calls="$(cat "${SCRATCH}/calls.log")"
assert_exit 0 "${rc}" && assert_contains "${out}" "createObject=true" \
  && assert_contains "${out}" "dry run" && assert_not_contains "${calls}" "create" && pass
stop_fake; teardown_scratch

begin "apply creates the object, every field nullable, and removes ONLY its sidebar entry"
setup_scratch; start_fake "${EMPTY}"
out="$(provision --apply)"; rc=$?
calls="$(cat "${SCRATCH}/calls.log")"
nav="$(node -e 'console.log(JSON.stringify(require(process.argv[1])))' "${SCRATCH}/state.json")"
assert_exit 0 "${rc}" && assert_contains "${calls}" "createObject escTourProgress" \
  && assert_contains "${calls}" "createField workspaceMemberId TEXT nullable=true" \
  && assert_contains "${calls}" "createField completedAt DATE_TIME nullable=true" \
  && assert_contains "${calls}" "createField endReason TEXT nullable=true" \
  && assert_contains "${calls}" "createField seenChapterVersions TEXT nullable=true" \
  && assert_contains "${calls}" "createField replayRequested BOOLEAN nullable=true" \
  && assert_contains "${calls}" "deleteNav" && assert_not_contains "${calls}" "n-people" \
  && assert_contains "${out}" "provisioned and verified" && pass
stop_fake; teardown_scratch

begin "a second apply changes nothing"
setup_scratch; start_fake "${EMPTY}"
provision --apply >/dev/null
: > "${SCRATCH}/calls.log"
out="$(provision --apply)"; rc=$?
calls="$(cat "${SCRATCH}/calls.log")"
assert_exit 0 "${rc}" && assert_contains "${out}" "createObject=false createFields=[] removeNavItems=0" \
  && [ -z "${calls}" ] && pass || { [ -n "${calls}" ] && fail "second apply wrote: ${calls}"; }
stop_fake; teardown_scratch

begin "a half-provisioned object gets only its missing fields, and a personal sidebar entry is kept"
setup_scratch
start_fake '{"objects":[{"id":"t1","nameSingular":"escTourProgress","fieldsList":[{"name":"name"},{"name":"workspaceMemberId"},{"name":"outcome"}]}],"navItems":[{"id":"n-ws","targetObjectMetadataId":"t1","userWorkspaceId":null},{"id":"n-mine","targetObjectMetadataId":"t1","userWorkspaceId":"uw-1"}]}'
out="$(provision --apply)"; rc=$?
calls="$(cat "${SCRATCH}/calls.log")"
assert_exit 0 "${rc}" && assert_not_contains "${calls}" "createObject" \
  && assert_not_contains "${calls}" "createField workspaceMemberId" \
  && assert_contains "${calls}" "createField lastStepId" \
  && assert_contains "${calls}" "deleteNav n-ws" && assert_not_contains "${calls}" "n-mine" && pass
stop_fake; teardown_scratch

# Amended 2026-10-09 (RM #22315/#22316): this instance was first provisioned with eight
# fields and then got `team`; the five fields added for replay and the drop-out report are
# now missing from it too. What this test exists to hold is unchanged — only the missing
# fields are created, never one that exists.
NEW_FIELDS="lastChapter,endReason,endedAt,seenChapterVersions,replayRequested"

begin "the instance provisioned on 2026-10-08 gets team plus the replay and report fields, nothing else"
setup_scratch
start_fake '{"objects":[{"id":"t1","nameSingular":"escTourProgress","fieldsList":[{"name":"name"},{"name":"workspaceMemberId"},{"name":"outcome"},{"name":"lastStepId"},{"name":"lastStepIndex"},{"name":"furthestStepIndex"},{"name":"totalSteps"},{"name":"scriptVersion"},{"name":"completedAt"}]}],"navItems":[]}'
out="$(provision --apply)"; rc=$?
calls="$(cat "${SCRATCH}/calls.log")"
assert_exit 0 "${rc}" && assert_contains "${out}" "createFields=[team,${NEW_FIELDS}]" \
  && assert_contains "${calls}" "createField team TEXT nullable=true" \
  && [ "$(grep -c createField "${SCRATCH}/calls.log")" = 6 ] \
  && assert_contains "${out}" "provisioned and verified" && pass \
  || fail "expected exactly six createFields (team + ${NEW_FIELDS}): ${calls}"
stop_fake; teardown_scratch

begin "the instance as live since tour4 (nine fields) gets exactly the five new ones"
setup_scratch
start_fake '{"objects":[{"id":"t1","nameSingular":"escTourProgress","fieldsList":[{"name":"name"},{"name":"workspaceMemberId"},{"name":"outcome"},{"name":"lastStepId"},{"name":"lastStepIndex"},{"name":"furthestStepIndex"},{"name":"totalSteps"},{"name":"scriptVersion"},{"name":"completedAt"},{"name":"team"}]}],"navItems":[]}'
out="$(provision --apply)"; rc=$?
calls="$(cat "${SCRATCH}/calls.log")"
assert_exit 0 "${rc}" && assert_contains "${out}" "createFields=[${NEW_FIELDS}]" \
  && assert_not_contains "${calls}" "createField team" \
  && [ "$(grep -c createField "${SCRATCH}/calls.log")" = 5 ] \
  && assert_contains "${out}" "provisioned and verified" && pass \
  || fail "expected exactly the five new createFields: ${calls}"
stop_fake; teardown_scratch

begin "a key without data-model rights fails LOUDLY with the API's reason, non-zero"
setup_scratch; start_fake "${EMPTY}" FAKE_REFUSE=1
out="$(provision --apply)"; rc=$?
assert_exit 1 "${rc}" && assert_contains "${out}" "FAILED" \
  && assert_contains "${out}" "missing DATA_MODEL permission" && pass
stop_fake; teardown_scratch

begin "a wrong key fails non-zero, even on a dry run"
setup_scratch; start_fake "${EMPTY}"
out="$(KEY=wrong provision)"; rc=$?
assert_exit 1 "${rc}" && assert_contains "${out}" "Unauthenticated" && pass
stop_fake; teardown_scratch

begin "piped on stdin (how DEPLOY.md runs it) it still RUNS — dry run and --apply"
setup_scratch; start_fake "${EMPTY}"
url="http://127.0.0.1:$(cat "${SCRATCH}/port")"
out="$(TWENTY_URL="${url}" TWENTY_API_KEY=test-key node - < "${SCRIPT}" 2>&1)"; rc=$?
assert_exit 0 "${rc}" && assert_contains "${out}" "dry run" || true
out="$(TWENTY_URL="${url}" TWENTY_API_KEY=test-key node - --apply < "${SCRIPT}" 2>&1)"; rc=$?
assert_exit 0 "${rc}" && assert_contains "${out}" "provisioned and verified" && pass
stop_fake; teardown_scratch

begin "piped on stdin with no env, it is refused — not a silent exit 0"
out="$(env -u TWENTY_URL -u TWENTY_API_KEY node - < "${SCRIPT}" 2>&1)"; rc=$?
assert_exit 2 "${rc}" && assert_contains "${out}" "required" && pass

begin "missing TWENTY_URL / TWENTY_API_KEY is refused before any request"
out="$(env -u TWENTY_URL -u TWENTY_API_KEY node "${SCRIPT}" 2>&1)"; rc=$?
assert_exit 2 "${rc}" && assert_contains "${out}" "required" && pass

summary
