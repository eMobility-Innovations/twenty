#!/usr/bin/env bash
set -uo pipefail
SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/watch-esc-image.sh"
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "FAIL $1: want $2 got $3"; fi; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export VERIFY="$TMP/verify" ALERT_CLIENT="$TMP/client.py" ENTITY=test-host
export SPOOL_DIR="$TMP/spool" RETRY_GAP_S=0 CASE_DIR="$TMP"
cat > "$VERIFY" <<'SH'
echo verify >> "$CASE_DIR/calls"
echo "verification output"
exit "$(cat "$CASE_DIR/code")"
SH
cat > "$ALERT_CLIENT" <<'PY'
import json, os, sys
with open(os.environ['CASE_DIR'] + '/alerts', 'a') as log:
    log.write(json.dumps(sys.argv[1:]) + '\n')
PY
has() { python3 - "$TMP/alerts" "$@" <<'PY'
import json, sys
calls = [json.loads(line) for line in open(sys.argv[1])]
print(sum(all(arg in call for arg in sys.argv[2:]) for call in calls))
PY
}
for code in 0 1 3; do
  echo "$code" > "$TMP/code"
  : > "$TMP/calls"; : > "$TMP/alerts"
  bash "$SCRIPT" --once > "$TMP/output" 2>&1; rc=$?
  check "exit $code" "$code" "$rc"
  if [ "$code" = 0 ]; then
    check 'healthy call count' 1 "$(wc -l < "$TMP/alerts" | tr -d ' ')"
    check 'healthy clears bad image' 1 "$(has --state clear twenty-esc-image-watch:bad-running-image)"
  elif [ "$code" = 1 ]; then
    check 'bad image pages' 1 "$(has --state fire --severity major --page twenty-esc-image-watch:bad-running-image)"
  else
    check 'four verify attempts' 4 "$(wc -l < "$TMP/calls" | tr -d ' ')"
    check 'unmeasurable fires' 1 "$(has --state fire --severity routine twenty-esc-image-watch:cannot-measure)"
    check 'unmeasurable does not fire bad image' 0 "$(has --state fire twenty-esc-image-watch:bad-running-image)"
  fi
done
echo 0 > "$TMP/code"
: > "$TMP/alerts"
bash "$SCRIPT" --once > "$TMP/output" 2>&1
check 'recovery exit' 0 "$?"
check 'recovery clears cannot measure' 1 "$(has --state clear twenty-esc-image-watch:cannot-measure)"
# Behaves like Docker 29.9.2 on CT175 (measured 2026-10-27): events.Message has no
# top-level ID, so `--format '{{.ID}}'` exits at once and the watch never sees a start.
cat > "$TMP/docker" <<'SH'
printf '%s\n' "$*" > "$CASE_DIR/events"
case "$*" in *'{{.ID}}'*)
  echo 'Error parsing format: template: :1:2: executing "" at <.ID>: can'"'"'t evaluate field ID in type *events.Message' >&2
  exit 1 ;;
esac
echo started-container
exit 0
SH
chmod +x "$TMP/docker"
: > "$TMP/calls"; : > "$TMP/alerts"
DOCKER="$TMP/docker" bash "$SCRIPT" > "$TMP/output" 2>&1; rc=$?
check 'event stream ending is failure even on exit zero' 1 "$rc"
check 'startup plus start event checks' 2 "$(wc -l < "$TMP/calls" | tr -d ' ')"
check 'both checks report healthy' 2 "$(has --state clear twenty-esc-image-watch:bad-running-image)"
check 'container start filters' 'events --filter type=container --filter event=start --filter container=twenty-esc-server-1 --format {{.Actor.ID}}' "$(cat "$TMP/events")"
printf '%s test(s), %s failed\n' "$((PASS+FAIL))" "$FAIL"
[ "$FAIL" -eq 0 ]
