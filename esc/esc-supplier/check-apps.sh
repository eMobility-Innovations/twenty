#!/usr/bin/env bash
# Gate for the supplier CRM's Twenty Apps (esc/esc-supplier/apps/*), run by the repo's ./verify.sh.
# The module contract it enforces is esc/esc-supplier/AGENTS.md.
#
# Usage: esc/esc-supplier/check-apps.sh [APPS_DIR]
#
# Always runs (no dependencies needed):
#   - apps/core exists (required) and apps/access is an optional third class above the modules
#     (every other directory under apps/ is a module);
#   - each app pins twenty, twenty-sdk, twenty-client-sdk and twenty-ui to ONE exact version,
#     and every app pins the SAME version (one server, one SDK);
#   - every identifier an app declares in src/constants/universal-identifiers.ts is a UUID v4
#     and unique across ALL apps (a changed or reused one is a delete + create on apply,
#     dropping that object's data);
#   - dependency direction: core references only its own identifiers; a module references only
#     its own and the core identifiers it lists in src/constants/core-identifiers.ts, each of
#     which must still exist in core. A module never references another module;
#   - access holds roles for people only: in access src (outside __tests__) only
#     defineApplication(...), defineApplicationRole(...) (the default function role every app
#     carries) and defineRole(...) may be called and nameSingular/namePlural are refused (no
#     objects, fields or views); it lists the identifiers it uses in
#     src/constants/module-identifiers.ts under one '// app: <name>' section per app (core in
#     '// app: core'); a section for a missing app, for access itself, or an entry the named app
#     does not declare is refused (access never has a core-identifiers.ts);
#   - nothing references access: core or a module referencing an identifier owned by access is refused;
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


def module_identifiers(app, names, own):
    # access's module-identifiers.ts: a '// app: <name>' line opens a section and each
    # 'export const NAME = '<uuid>';'' after it belongs to that section. Returns
    # (valid_values, errors); only entries in a section for a real, non-access app that the
    # named app declares join valid_values.
    path = app / "src/constants/module-identifiers.ts"
    valid = set()
    errors = []
    if not path.exists():
        return valid, errors
    section = None
    for line in path.read_text().splitlines():
        line = line.strip()
        header = re.match(r"//\s*app:\s*(\S+)", line)
        if header:
            section = header.group(1)
            if section == "access":
                errors.append("access: module-identifiers.ts section '// app: access' names access itself")
            elif section not in names:
                errors.append(f"access: module-identifiers.ts section '// app: {section}' names an app that does not exist")
            continue
        const = CONSTANT.search(line)
        if not const:
            continue
        name, value = const.groups()
        if section is None:
            errors.append(f"access: module-identifiers.ts constant {name} is before any '// app:' line")
        elif section in names and section != "access":
            if value not in own.get(section, set()):
                errors.append(f"access: module-identifiers.ts constant {name} = {value} is not declared by {section}; take its section out of access in the same PR")
            else:
                valid.add(value)
    return valid, errors


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

    if app.name == "access":
        if (app / "src/constants/core-identifiers.ts").exists():
            errors.append("access: src/constants/core-identifiers.ts is present; access lists the identifiers "
                          "it uses in module-identifiers.ts (core in the '// app: core' section)")
        for file in (app / "src").rglob("*.ts*"):
            if "__tests__" in file.parts:
                continue
            rel = file.relative_to(app)
            text = file.read_text()
            for call in sorted({c for c in re.findall(r"define\w+\(", text) if c not in ("defineApplication(", "defineApplicationRole(", "defineRole(")}):
                errors.append(f"access: {rel} calls {call[:-1]}(...) but access only calls defineApplication, defineApplicationRole and defineRole")
            for name in sorted(set(re.findall(r"nameSingular|namePlural", text))):
                errors.append(f"access: {rel} has {name}; access holds roles only (no objects, fields or views)")

if len(set(versions.values())) > 1:
    errors.append(f"apps pin different twenty versions (one server): {versions}")

core_ids = own.get("core", set())
for app in apps:
    allowed = set(own[app.name])
    if app.name == "access":
        access_refs, ref_errors = module_identifiers(app, names, own)
        errors.extend(ref_errors)
        allowed |= access_refs
    elif app.name != "core":
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
            other = owner[value]
            if other == "access":
                reason = "nothing references access"
            elif app.name == "core":
                reason = "core never references a module"
            elif app.name == "access":
                reason = "list it in module-identifiers.ts under the owning app's section"
            else:
                reason = "list core identifiers in src/constants/core-identifiers.ts; never reference another module"
            errors.append(f"{app.name}: {file} references {value} owned by {other}; {reason}")
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
