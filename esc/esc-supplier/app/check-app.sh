#!/usr/bin/env bash
# Gate for the ESC Supplier Hub app (esc/esc-supplier/app), run by the repo's ./verify.sh.
#
# Usage: esc/esc-supplier/app/check-app.sh [APP_DIR]
#
# Always runs (no dependencies needed):
#   - twenty, twenty-sdk, twenty-client-sdk and twenty-ui are pinned to ONE exact version;
#     a mixed set builds against one SDK and deploys with another;
#   - every universal identifier is a valid, unique UUID v4; a changed or duplicated one
#     makes `twenty app apply` delete an object and create a new one, dropping its data;
#   - the app carries no .github/workflows (Actions are off for the org).
# Runs when the app's node_modules is present:
#   - typecheck, unit tests and `twenty app build`.
set -euo pipefail

APP_DIR="${1:-$(cd "$(dirname "$0")" && pwd)}"

python3 - "$APP_DIR" <<'PY'
import json, pathlib, re, sys

app = pathlib.Path(sys.argv[1])
errors = []

pkg = json.loads((app / "package.json").read_text())
deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
pinned = {name: deps.get(name) for name in ("twenty", "twenty-sdk", "twenty-client-sdk", "twenty-ui")}
missing = [name for name, version in pinned.items() if version is None]
if missing:
    errors.append(f"not pinned at all: {', '.join(missing)}")
versions = {version for version in pinned.values() if version is not None}
if len(versions) > 1 or any(not re.fullmatch(r"\d+\.\d+\.\d+", v) for v in versions):
    errors.append(f"twenty packages must share one exact version, found {pinned}")

uuid_v4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
seen = {}
constants = (app / "src/constants/universal-identifiers.ts").read_text()
for name, value in re.findall(r"export const (\w+_UNIVERSAL_IDENTIFIER)\s*=\s*'([^']*)'", constants):
    if not uuid_v4.match(value):
        errors.append(f"{name} is not a UUID v4: {value}")
    if value in seen:
        errors.append(f"{name} reuses the identifier of {seen[value]}")
    seen[value] = name

if (app / ".github" / "workflows").exists():
    errors.append(".github/workflows is present; Actions are off for the org")

if errors:
    print("supplier-app: FAILED", file=sys.stderr)
    for error in errors:
        print(f"    {error}", file=sys.stderr)
    sys.exit(1)
print(f"supplier-app: pins {sorted(versions)} and {len(seen)} identifier(s) are sound.")
PY

run_yarn() {
  # Node 25+ no longer ships Corepack, so a plain `yarn` may be missing.
  if command -v yarn >/dev/null 2>&1; then
    yarn "$@"
  else
    npx -y corepack@0.34.0 yarn "$@"
  fi
}

if [ -d "$APP_DIR/node_modules" ]; then
  (
    cd "$APP_DIR"
    run_yarn typecheck
    run_yarn test
    run_yarn twenty app build
  )
  echo "supplier-app: typecheck, unit tests and build passed."
else
  echo "supplier-app: SKIPPED typecheck/test/build — $APP_DIR/node_modules is absent." >&2
  echo "supplier-app:   THIS RUN DID NOT BUILD THE APP. Run 'yarn install' there (or" >&2
  echo "supplier-app:   'npx corepack yarn install') and re-run ./verify.sh to prove it." >&2
fi
