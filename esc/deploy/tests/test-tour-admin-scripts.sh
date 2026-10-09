#!/usr/bin/env bash
# Covers the two admin scripts that read and write tour progress ROWS through the data API:
# report-esc-tour-progress.cjs (RM #22316, read-only) and request-esc-tour-replay.cjs
# (RM #22315, writes `replayRequested`), against a fake /graphql endpoint.
set -uo pipefail
. "$(dirname "$0")/harness.sh"

REPORT="${DEPLOY_DIR}/report-esc-tour-progress.cjs"
REPLAY="${DEPLOY_DIR}/request-esc-tour-replay.cjs"
FAKE="${TEST_ROOT}/fake-data-server.cjs"

if ! command -v node >/dev/null 2>&1; then
  printf '\n== tour admin scripts\n  SKIPPED — no node on PATH. THIS RUN DID NOT CHECK THE REPORT OR THE REPLAY REQUEST.\n' >&2
  exit 0
fi

FAKE_PID=""

start_fake() { # rows-json [extra env assignments...]
  printf '{"rows":%s}' "$1" > "${SCRATCH}/state.json"
  : > "${SCRATCH}/calls.log"
  rm -f "${SCRATCH}/port"
  shift
  env FAKE_STATE="${SCRATCH}/state.json" FAKE_LOG="${SCRATCH}/calls.log" \
    FAKE_PORT_FILE="${SCRATCH}/port" "$@" node "${FAKE}" &
  FAKE_PID=$!
  for _ in $(seq 1 50); do [ -s "${SCRATCH}/port" ] && break; sleep 0.1; done
}

stop_fake() { [ -n "${FAKE_PID}" ] && kill "${FAKE_PID}" 2>/dev/null; wait "${FAKE_PID}" 2>/dev/null; FAKE_PID=""; }

call() { # script args...
  local script="$1"; shift
  TWENTY_URL="http://127.0.0.1:$(cat "${SCRATCH}/port")" TWENTY_API_KEY="${KEY:-test-key}" \
    node "${script}" "$@" 2>&1
}

replay_flags() { node -e 'const s=require(process.argv[1]);console.log(s.rows.map(r=>`${r.id}=${r.replayRequested===true}`).join(" "))' "${SCRATCH}/state.json"; }

OLD='2020-01-01T00:00:00.000Z'
FUTURE='2099-01-01T00:00:00.000Z'
ROWS='[
 {"id":"r1","name":"Ann","workspaceMemberId":"m1","outcome":"notStarted","updatedAt":"'"${OLD}"'"},
 {"id":"r2","name":"Bob","workspaceMemberId":"m2","outcome":"completed","endReason":"finished","updatedAt":"'"${OLD}"'"},
 {"id":"r3","name":"Cat","workspaceMemberId":"m3","outcome":"dismissed","endReason":"closed","lastChapter":"The left panel","lastStepId":"left-panel-tasks","updatedAt":"'"${OLD}"'"},
 {"id":"r4","name":"Dan","workspaceMemberId":"m4","outcome":"dismissed","endReason":"stranded","lastChapter":"A list of records","lastStepId":"people-list","updatedAt":"'"${OLD}"'"},
 {"id":"r5","name":"Eve","workspaceMemberId":"m5","outcome":"inProgress","lastChapter":"The left panel","lastStepId":"left-panel-tasks","updatedAt":"'"${OLD}"'"},
 {"id":"r6","name":"Fay","workspaceMemberId":"m6","outcome":"inProgress","lastChapter":"Where you are","lastStepId":"welcome","updatedAt":"'"${FUTURE}"'"},
 {"id":"r7","name":"Gus","workspaceMemberId":"m7","outcome":"dismissed","updatedAt":"'"${OLD}"'"}
]'

printf '\n== report-esc-tour-progress.cjs\n'

begin "sorts every person into what happened to their last run"
setup_scratch; start_fake "${ROWS}"
out="$(call "${REPORT}" --json)"; rc=$?
counts="$(printf '%s' "${out}" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.stringify(JSON.parse(d).counts)))')"
assert_exit 0 "${rc}" \
  && assert_contains "${counts}" '"never opened":1' && assert_contains "${counts}" '"finished":1' \
  && assert_contains "${counts}" '"closed early":2' && assert_contains "${counts}" '"stranded":1' \
  && assert_contains "${counts}" '"left mid-run":1' && assert_contains "${counts}" '"on it now":1' && pass
stop_fake; teardown_scratch

begin "names where people stopped, most common first, and keeps a stranded tour out of it"
setup_scratch; start_fake "${ROWS}"
out="$(call "${REPORT}")"; rc=$?
first="$(printf '%s\n' "${out}" | grep -A1 'Where people stopped' | tail -1)"
assert_exit 0 "${rc}" && assert_contains "${first}" "2  The left panel › left-panel-tasks" \
  && assert_contains "${out}" "(chapter not recorded) › (no step)" \
  && assert_not_contains "${out}" "people-list" && pass
stop_fake; teardown_scratch

begin "--names lists the people in each group"
setup_scratch; start_fake "${ROWS}"
out="$(call "${REPORT}" --names)"; rc=$?
assert_exit 0 "${rc}" && assert_contains "${out}" "Cat, Gus" && pass
stop_fake; teardown_scratch

begin "reads every page"
setup_scratch; start_fake "${ROWS}" FAKE_PAGE_SIZE=2
out="$(call "${REPORT}")"; rc=$?
assert_exit 0 "${rc}" && assert_contains "${out}" "7 people" && pass
stop_fake; teardown_scratch

begin "refuses a page that claims more and gives no cursor, rather than reporting a short read"
setup_scratch; start_fake "${ROWS}" FAKE_PAGE_SIZE=2 FAKE_NO_CURSOR=1
out="$(call "${REPORT}")"; rc=$?
assert_exit 1 "${rc}" && assert_contains "${out}" "refusing a short read" && pass
stop_fake; teardown_scratch

begin "a refused key fails loudly"
setup_scratch; start_fake "${ROWS}"
out="$(KEY=wrong call "${REPORT}")"; rc=$?
assert_exit 1 "${rc}" && assert_contains "${out}" "Unauthenticated" && pass
stop_fake; teardown_scratch

begin "it never writes"
setup_scratch; start_fake "${ROWS}"
call "${REPORT}" --names >/dev/null
assert_not_contains "$(cat "${SCRATCH}/calls.log")" "update" && pass
stop_fake; teardown_scratch

printf '\n== request-esc-tour-replay.cjs\n'

begin "dry run is the default, names who would change, and writes nothing"
setup_scratch; start_fake "${ROWS}"
out="$(call "${REPLAY}" --member m3)"; rc=$?
assert_exit 0 "${rc}" && assert_contains "${out}" "request a replay for 1 person" \
  && assert_contains "${out}" "Cat  m3" && assert_contains "${out}" "dry run" \
  && assert_not_contains "$(cat "${SCRATCH}/calls.log")" "update" && pass
stop_fake; teardown_scratch

begin "--member --apply flags exactly that person and verifies it"
setup_scratch; start_fake "${ROWS}"
out="$(call "${REPLAY}" --member m3 --member m5 --apply)"; rc=$?
flags="$(replay_flags)"
assert_exit 0 "${rc}" && assert_contains "${out}" "2 row(s) updated and verified" \
  && assert_contains "${flags}" "r3=true" && assert_contains "${flags}" "r5=true" \
  && assert_contains "${flags}" "r1=false" && assert_contains "${flags}" "r2=false" && pass
stop_fake; teardown_scratch

begin "--everyone --apply flags every row"
setup_scratch; start_fake "${ROWS}"
out="$(call "${REPLAY}" --everyone --apply)"; rc=$?
assert_exit 0 "${rc}" && assert_contains "${out}" "7 row(s)" && assert_not_contains "$(replay_flags)" "=false" && pass
stop_fake; teardown_scratch

begin "--clear undoes a request"
setup_scratch; start_fake "${ROWS}"
call "${REPLAY}" --member m3 --apply >/dev/null
out="$(call "${REPLAY}" --member m3 --clear --apply)"; rc=$?
assert_exit 0 "${rc}" && assert_contains "$(replay_flags)" "r3=false" && pass
stop_fake; teardown_scratch

begin "an already-flagged person is not written again"
setup_scratch; start_fake "${ROWS}"
call "${REPLAY}" --member m3 --apply >/dev/null
: > "${SCRATCH}/calls.log"
out="$(call "${REPLAY}" --member m3 --apply)"; rc=$?
assert_exit 0 "${rc}" && assert_contains "${out}" "for 0 people" \
  && assert_not_contains "$(cat "${SCRATCH}/calls.log")" "update" && pass
stop_fake; teardown_scratch

begin "a member id that matches nobody is an error, and nothing is written"
setup_scratch; start_fake "${ROWS}"
out="$(call "${REPLAY}" --member m3 --member nobody --apply)"; rc=$?
assert_exit 1 "${rc}" && assert_contains "${out}" "no progress row for: nobody" \
  && assert_not_contains "$(cat "${SCRATCH}/calls.log")" "update" && pass
stop_fake; teardown_scratch

begin "asks for exactly one of --member and --everyone"
setup_scratch; start_fake "${ROWS}"
out_none="$(call "${REPLAY}" --apply)"; rc_none=$?
out_both="$(call "${REPLAY}" --everyone --member m3 --apply)"; rc_both=$?
assert_exit 1 "${rc_none}" && assert_exit 1 "${rc_both}" \
  && assert_contains "${out_none}" "exactly one" && assert_contains "${out_both}" "exactly one" \
  && assert_not_contains "$(cat "${SCRATCH}/calls.log")" "update" && pass
stop_fake; teardown_scratch

begin "a write the server swallows fails the read-back"
setup_scratch; start_fake "${ROWS}" FAKE_IGNORE_UPDATES=1
out="$(call "${REPLAY}" --member m3 --apply)"; rc=$?
assert_exit 1 "${rc}" && assert_contains "${out}" "did not change" && pass
stop_fake; teardown_scratch

summary
