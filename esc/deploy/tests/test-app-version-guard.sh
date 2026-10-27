#!/usr/bin/env bash
# build-source-image.sh must refuse a non-semver APP_VERSION before it builds anything:
# the server crash-loops on one (2026-10-27, twenty-esc-sso:v2.0.0-nm1 built from a git SHA).
set -uo pipefail
SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/build-source-image.sh"
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "FAIL $1: want $2 got $3"; fi; }

for bad in a855be71 abc 2.0 v1; do
  out="$(bash "$SCRIPT" --tag t:x --app-version "$bad" 2>&1)"; rc=$?
  check "rc for '$bad'" 1 "$rc"
  case "$out" in *"not a semantic version"*) r=yes ;; *) r=no ;; esac
  check "message for '$bad'" yes "$r"
done
# The smoke test must not override the image's baked APP_VERSION (nm1 booted green under the old override).
grep -q '^APP_VERSION=' "$(dirname "$SCRIPT")/smoke.env.template"; check "template sets no APP_VERSION" 1 "$?"
grep -q 'APP_VERSION)=' "$(dirname "$SCRIPT")/boot-smoke-test.sh"; check "smoke strips APP_VERSION" 0 "$?"
VERIFY="$(dirname "$SCRIPT")/../../scripts/verify-esc-image.sh"
grep -q 'APP_VERSION in the running container' "$VERIFY"; check "verify-esc-image checks live APP_VERSION" 0 "$?"
printf '%s test(s), %s failed\n' "$((PASS+FAIL))" "$FAIL"
[ "$FAIL" -eq 0 ]
