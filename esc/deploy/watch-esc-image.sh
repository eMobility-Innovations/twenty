#!/usr/bin/env bash
# Check on startup and every container start; systemd reconnects a lost event stream.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CONTAINER="${CONTAINER:-twenty-esc-server-1}"
DOCKER="${DOCKER:-docker}"
VERIFY="${VERIFY:-$HERE/verify-esc-image.sh}"
ALERT_CLIENT="${ALERT_CLIENT:-$HERE/alert_client.py}"
SPOOL_DIR="${SPOOL_DIR:-/var/lib/twenty-esc-image-watch/alert-spool}"
RETRY_GAP_S="${RETRY_GAP_S:-10}"
ENTITY="${ENTITY:-$(python3 "$ALERT_CLIENT" --print-pinned-host 2>/dev/null || hostname -s)}"
ENTITY="${ENTITY:-$(hostname -s)}"
UNMEASURED="$SPOOL_DIR/cannot-measure.active"

alert() {
  local fingerprint="$1" state="$2"
  shift 2
  python3 "$ALERT_CLIENT" --owner-repo eMobility-Innovations/twenty \
    --service twenty-esc-image-watch --entity "$ENTITY" --spool-dir "$SPOOL_DIR" \
    --runbook esc/deploy/DEPLOY.md --fingerprint "twenty-esc-image-watch:$fingerprint" \
    --title "Running-image verification: $CONTAINER" --body "$BODY" --state "$state" "$@"
}

report_result() {
  if [ "$1" -eq 3 ]; then
    mkdir -p "$SPOOL_DIR" && touch "$UNMEASURED"
    alert cannot-measure fire --severity routine
    return
  fi
  if [ -f "$UNMEASURED" ]; then
    alert cannot-measure clear && rm -f "$UNMEASURED"
  fi
  case "$1" in
    0) alert bad-running-image clear ;;
    1) alert bad-running-image fire --severity major --page ;;
  esac
}

check_once() {
  local output rc attempt
  for attempt in 0 1 2 3; do
    output="$(CONTAINER="$CONTAINER" DOCKER="$DOCKER" bash "$VERIFY" 2>&1)"; rc=$?
    [ "$rc" -eq 3 ] && [ "$attempt" -lt 3 ] || break
    sleep "$RETRY_GAP_S"
  done
  # An unexpected verifier failure cannot establish image correctness.
  case "$rc" in 0|1|3) ;; *) rc=3 ;; esac
  printf '%s\n' "$output"
  BODY="$(printf '%s\n' "$output" | tail -n 40)"
  report_result "$rc"
  return "$rc"
}

case "${1:-}" in
  --once) check_once; exit $? ;;
  '') ;;
  *) echo "Usage: $0 [--once]" >&2; exit 2 ;;
esac
check_once
# Word splitting intentionally supports DOCKER='sudo docker', as the verifier does.
$DOCKER events --filter type=container --filter event=start \
  --filter container="$CONTAINER" --format '{{.ID}}' |
  while IFS= read -r event; do check_once; done
echo "Docker event stream ended for $CONTAINER" >&2
exit 1
