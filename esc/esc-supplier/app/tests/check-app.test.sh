#!/usr/bin/env bash
# Proves check-app.sh refuses what it claims to refuse: each case breaks a copy of the
# app's metadata and expects a non-zero exit. Run by ./verify.sh before check-app.sh.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fresh_copy() {
  rm -rf "$WORK/app"
  mkdir -p "$WORK/app/src/constants"
  cp "$HERE/package.json" "$WORK/app/"
  cp "$HERE/src/constants/universal-identifiers.ts" "$WORK/app/src/constants/"
}

expect_refusal() {
  local label="$1"
  if "$HERE/check-app.sh" "$WORK/app" >/dev/null 2>&1; then
    echo "check-app.test: FAILED — '$label' was accepted" >&2
    exit 1
  fi
  echo "check-app.test: '$label' refused — good."
}

fresh_copy
"$HERE/check-app.sh" "$WORK/app" >/dev/null 2>&1 || { echo "check-app.test: the unmodified app was refused" >&2; exit 1; }
echo "check-app.test: unmodified app accepted — good."

fresh_copy
sed -i 's/"twenty-sdk": "[^"]*"/"twenty-sdk": "2.59.0"/' "$WORK/app/package.json"
expect_refusal "mixed twenty package versions"

fresh_copy
sed -i 's/"twenty-ui": "[^"]*"/"twenty-ui": "^2.60.0"/' "$WORK/app/package.json"
expect_refusal "a range instead of an exact pin"

fresh_copy
sed -i "0,/_UNIVERSAL_IDENTIFIER = '[^']*'/s//_UNIVERSAL_IDENTIFIER = 'not-a-uuid'/" "$WORK/app/src/constants/universal-identifiers.ts"
expect_refusal "an identifier that is not a UUID v4"

fresh_copy
first="$(grep -o "'[0-9a-f-]\{36\}'" "$WORK/app/src/constants/universal-identifiers.ts" | head -1)"
echo "export const DUPLICATE_UNIVERSAL_IDENTIFIER = ${first};" >> "$WORK/app/src/constants/universal-identifiers.ts"
expect_refusal "a duplicated identifier"

fresh_copy
mkdir -p "$WORK/app/.github/workflows"
expect_refusal "a .github/workflows directory"
