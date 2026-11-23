#!/usr/bin/env bash
# Gate for the supplier CRM's Twenty Apps (esc/esc-supplier/apps/*), run by the repo's ./verify.sh.
# The module contract it enforces is esc/esc-supplier/AGENTS.md.
#
# Usage: esc/esc-supplier/check-apps.sh [APPS_DIR]
#
# Always runs (no dependencies needed):
#   - apps/core exists; every other directory under apps/ is a module;
#   - each app pins twenty, twenty-sdk, twenty-client-sdk and twenty-ui to ONE exact version,
#     and every app pins the SAME version (one server, one SDK);
#   - every identifier an app declares in src/constants/universal-identifiers.ts is a UUID v4
#     and unique across ALL apps (a changed or reused one is a delete + create on apply,
#     dropping that object's data);
#   - dependency direction: core references only its own identifiers; a module references only
#     its own and the core identifiers it lists in src/constants/core-identifiers.ts, each of
#     which must still exist in core. A module never references another module;
#   - object names (nameSingular / namePlural) are unique across all apps;
#   - no app carries .github/workflows (Actions are off for the org).
# Runs per app when that app's node_modules is present:
#   - typecheck, unit tests and `twenty app build`.
set -euo pipefail

APPS_DIR="${1:-$(cd "$(dirname "$0")" && pwd)/apps}"

python3 - "$APPS_DIR" <<'PY'
import json, pathlib, re, sys

apps_dir = pathlib.Path(sys.argv[1])
errors = []
UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
UUID_V4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
CONSTANT = re.compile(r"export const (\w+)\s*=\s*'([^']*)'")
PACKAGES = ("twenty", "twenty-sdk", "twenty-client-sdk", "twenty-ui")


def declared(path):
    if not path.exists():
        return {}
    return {value: name for name, value in CONSTANT.findall(path.read_text()) if UUID.fullmatch(value)}


def source_uuids(app):
    found = {}
    for file in (app / "src").rglob("*.ts*"):
        if "__tests__" in file.parts:
            continue
        for value in UUID.findall(file.read_text()):
            found.setdefault(value.lower(), file.relative_to(app))
    return found


apps = sorted(p for p in apps_dir.iterdir() if p.is_dir() and not p.name.startswith("."))
names = [p.name for p in apps]
if "core" not in names:
    errors.append(f"{apps_dir}/core is missing: every module depends on the core app")

owner = {}          # identifier -> app that declares it
own = {}            # app -> {identifier}
versions = {}       # app -> pinned version
object_names = {}   # nameSingular/namePlural -> app
for app in apps:
    pkg = json.loads((app / "package.json").read_text())
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    pinned = {name: deps.get(name) for name in PACKAGES}
    missing = [name for name, version in pinned.items() if version is None]
    if missing:
        errors.append(f"{app.name}: not pinned at all: {', '.join(missing)}")
    found = {v for v in pinned.values() if v is not None}
    if len(found) > 1 or any(not re.fullmatch(r"\d+\.\d+\.\d+", v) for v in found):
        errors.append(f"{app.name}: twenty packages must share one exact version, found {pinned}")
    elif found:
        versions[app.name] = found.pop()

    constants = app / "src/constants/universal-identifiers.ts"
    # A list, not a dict: two constants holding one value must both be seen.
    mine = [(value, name) for name, value in CONSTANT.findall(constants.read_text())
            if UUID.fullmatch(value) or name.endswith("_UNIVERSAL_IDENTIFIER")] if constants.exists() else []
    if not mine:
        errors.append(f"{app.name}: src/constants/universal-identifiers.ts declares no identifier")
    own[app.name] = {value for value, _ in mine}
    for value, name in mine:
        if not UUID_V4.match(value):
            errors.append(f"{app.name}: {name} is not a UUID v4: {value}")
        if value in owner:
            errors.append(f"{app.name}: {name} reuses an identifier declared by {owner[value]}")
        owner[value] = app.name

    for file in (app / "src").rglob("*.ts*"):
        if "__tests__" in file.parts:
            continue
        for match in re.findall(r"name(?:Singular|Plural):\s*'([^']+)'", file.read_text()):
            if match in object_names and object_names[match] != app.name:
                errors.append(f"{app.name}: object name '{match}' is already used by {object_names[match]}")
            object_names.setdefault(match, app.name)

    if (app / ".github" / "workflows").exists():
        errors.append(f"{app.name}: .github/workflows is present; Actions are off for the org")

if len(set(versions.values())) > 1:
    errors.append(f"apps pin different twenty versions (one server): {versions}")

core_ids = own.get("core", set())
for app in apps:
    allowed = set(own[app.name])
    if app.name != "core":
        refs = declared(app / "src/constants/core-identifiers.ts")
        for value, name in refs.items():
            if value not in core_ids:
                where = owner.get(value)
                why = f"declared by module {where}" if where else "not declared by core (renamed or removed?)"
                errors.append(f"{app.name}: core-identifiers.ts {name} = {value} is {why}")
        allowed |= set(refs) & core_ids
    for value, file in source_uuids(app).items():
        if value in allowed:
            continue
        if value in owner:
            errors.append(f"{app.name}: {file} references {value} owned by {owner[value]}; "
                          + ("core never references a module" if app.name == "core"
                             else "list core identifiers in src/constants/core-identifiers.ts; never reference another module"))
        else:
            errors.append(f"{app.name}: {file} has identifier {value} not declared in src/constants/")

if errors:
    print("supplier-apps: FAILED", file=sys.stderr)
    for error in errors:
        print(f"    {error}", file=sys.stderr)
    sys.exit(1)
print(f"supplier-apps: {len(apps)} app(s) {names}, pin {sorted(set(versions.values()))}, "
      f"{len(owner)} identifier(s), dependency direction sound.")
PY

run_yarn() {
  # Node 25+ no longer ships Corepack, so a plain `yarn` may be missing.
  if command -v yarn >/dev/null 2>&1; then
    yarn "$@"
  else
    npx -y corepack@0.34.0 yarn "$@"
  fi
}

for app in "$APPS_DIR"/*/; do
  app="${app%/}"
  if [ -d "$app/node_modules" ]; then
    (cd "$app" && run_yarn typecheck && run_yarn test && run_yarn twenty app build)
    echo "supplier-apps: $(basename "$app"): typecheck, unit tests and build passed."
  else
    echo "supplier-apps: SKIPPED typecheck/test/build for $(basename "$app") — node_modules is absent." >&2
    echo "supplier-apps:   THIS RUN DID NOT BUILD IT. Run 'yarn install' there (or" >&2
    echo "supplier-apps:   'npx corepack yarn install') and re-run ./verify.sh to prove it." >&2
  fi
done
