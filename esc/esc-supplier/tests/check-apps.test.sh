#!/usr/bin/env bash
# Proves check-apps.sh refuses what it claims to refuse: each case builds a copy of apps/
# (core plus a fixture module that relates to a core object), breaks one rule and expects
# a non-zero exit. Run by ./verify.sh before check-apps.sh.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
CHECK="$HERE/check-apps.sh"

uuid() { python3 -c 'import uuid; print(uuid.uuid4())'; }
CORE_OBJECT="$(uuid)"
MOD_APP="$(uuid)"; MOD_ROLE="$(uuid)"; MOD_OBJECT="$(uuid)"; MOD_FIELD="$(uuid)"

fresh_copy() {
  rm -rf "$WORK/apps"
  mkdir -p "$WORK/apps/core/src/constants" "$WORK/apps/core/src/objects"
  cp "$HERE/apps/core/package.json" "$WORK/apps/core/"
  cp "$HERE/apps/core/src/constants/universal-identifiers.ts" "$WORK/apps/core/src/constants/"
  echo "export const SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER = '$CORE_OBJECT';" \
    >> "$WORK/apps/core/src/constants/universal-identifiers.ts"
  printf "import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';\nexport default { nameSingular: 'supplier', namePlural: 'suppliers' };\n" \
    > "$WORK/apps/core/src/objects/supplier.object.ts"

  local mod="$WORK/apps/fixture"
  mkdir -p "$mod/src/constants" "$mod/src/objects"
  sed 's/"name": "[^"]*"/"name": "esc-supplier-fixture"/' "$HERE/apps/core/package.json" > "$mod/package.json"
  cat > "$mod/src/constants/universal-identifiers.ts" <<EOF
export const APPLICATION_UNIVERSAL_IDENTIFIER = '$MOD_APP';
export const DEFAULT_ROLE_UNIVERSAL_IDENTIFIER = '$MOD_ROLE';
export const FIXTURE_OBJECT_UNIVERSAL_IDENTIFIER = '$MOD_OBJECT';
export const SUPPLIER_ON_FIXTURE_FIELD_UNIVERSAL_IDENTIFIER = '$MOD_FIELD';
EOF
  echo "export const SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER = '$CORE_OBJECT';" > "$mod/src/constants/core-identifiers.ts"
  printf "export default { nameSingular: 'supplierFixture', namePlural: 'supplierFixtures' };\n" \
    > "$mod/src/objects/fixture.object.ts"
}

ACC_APP="$(uuid)"; ACC_ROLE="$(uuid)"; ACC_DEFAULT_ROLE="$(uuid)"

add_access() {
  # The third class above the modules: roles for people only. Declares its own
  # application and role; lists the identifiers it uses in module-identifiers.ts.
  local acc="$WORK/apps/access"
  mkdir -p "$acc/src/constants" "$acc/src/roles"
  sed 's/"name": "[^"]*"/"name": "esc-supplier-access"/' "$HERE/apps/core/package.json" > "$acc/package.json"
  cat > "$acc/src/constants/universal-identifiers.ts" <<EOF
export const APPLICATION_UNIVERSAL_IDENTIFIER = '$ACC_APP';
export const ROLE_UNIVERSAL_IDENTIFIER = '$ACC_ROLE';
export const DEFAULT_ROLE_UNIVERSAL_IDENTIFIER = '$ACC_DEFAULT_ROLE';
EOF
  cat > "$acc/src/constants/module-identifiers.ts" <<EOF
// app: core
export const SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER = '$CORE_OBJECT';
// app: fixture
export const FIXTURE_OBJECT_UNIVERSAL_IDENTIFIER = '$MOD_OBJECT';
export const SUPPLIER_ON_FIXTURE_FIELD_UNIVERSAL_IDENTIFIER = '$MOD_FIELD';
EOF
  printf "import { defineApplication } from 'twenty-sdk';\nimport { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';\nexport default defineApplication({ universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER, displayName: 'ESC Supplier - Access' });\n" \
    > "$acc/src/application.ts"
  printf "import { defineRole } from 'twenty-sdk';\nimport { ROLE_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';\nimport { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER, FIXTURE_OBJECT_UNIVERSAL_IDENTIFIER, SUPPLIER_ON_FIXTURE_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/module-identifiers';\nexport default defineRole({ universalIdentifier: ROLE_UNIVERSAL_IDENTIFIER, displayName: 'ESC Supplier - Admin', objectAccesses: [{ object: { universalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } }, { object: { universalIdentifier: FIXTURE_OBJECT_UNIVERSAL_IDENTIFIER }, field: { universalIdentifier: SUPPLIER_ON_FIXTURE_FIELD_UNIVERSAL_IDENTIFIER } }] });\n" \
    > "$acc/src/roles/admin.role.ts"
  # The default function role every app carries (the build wires it into the manifest).
  printf "import { defineApplicationRole } from 'twenty-sdk';\nimport { DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';\nexport default defineApplicationRole({ universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER, label: 'default function role' });\n" \
    > "$acc/src/default-role.ts"
}

expect_refusal() {
  local label="$1"
  if "$CHECK" "$WORK/apps" >/dev/null 2>&1; then
    echo "check-apps.test: FAILED — '$label' was accepted" >&2
    exit 1
  fi
  echo "check-apps.test: '$label' refused — good."
}

fresh_copy
"$CHECK" "$WORK/apps" >/dev/null 2>&1 || { echo "check-apps.test: the unmodified apps were refused:" >&2; "$CHECK" "$WORK/apps" >&2 || true; exit 1; }
echo "check-apps.test: core + a module relating to core accepted — good."

fresh_copy
sed -i 's/"twenty-sdk": "[^"]*"/"twenty-sdk": "2.59.0"/' "$WORK/apps/core/package.json"
expect_refusal "mixed twenty package versions inside one app"

fresh_copy
sed -i 's/"twenty-ui": "[^"]*"/"twenty-ui": "^2.60.0"/' "$WORK/apps/core/package.json"
expect_refusal "a range instead of an exact pin"

fresh_copy
sed -i 's/"\(twenty[a-z-]*\)": "[0-9.]*"/"\1": "2.59.0"/g' "$WORK/apps/fixture/package.json"
expect_refusal "two apps pinning different twenty versions"

fresh_copy
sed -i "0,/_UNIVERSAL_IDENTIFIER = '[^']*'/s//_UNIVERSAL_IDENTIFIER = '00000000-0000-0000-0000-000000000000'/" \
  "$WORK/apps/core/src/constants/universal-identifiers.ts"
expect_refusal "an identifier that is not a UUID v4"

fresh_copy
first="$(grep -o "'[0-9a-f-]\{36\}'" "$WORK/apps/core/src/constants/universal-identifiers.ts" | head -1)"
echo "export const DUPLICATE_UNIVERSAL_IDENTIFIER = ${first};" >> "$WORK/apps/core/src/constants/universal-identifiers.ts"
expect_refusal "a duplicated identifier inside one app"

fresh_copy
echo "export const STOLEN_UNIVERSAL_IDENTIFIER = ${first};" >> "$WORK/apps/fixture/src/constants/universal-identifiers.ts"
expect_refusal "a module redeclaring a core identifier as its own"

fresh_copy
echo "export const X = '$MOD_OBJECT';" >> "$WORK/apps/core/src/objects/supplier.object.ts"
expect_refusal "core referencing a module"

fresh_copy
echo "export const GONE_UNIVERSAL_IDENTIFIER = '$(uuid)';" >> "$WORK/apps/fixture/src/constants/core-identifiers.ts"
expect_refusal "a module listing a core identifier core no longer declares"

fresh_copy
cp -r "$WORK/apps/fixture" "$WORK/apps/other"
sed -i "s/'[0-9a-f-]\{36\}'/'PLACEHOLDER'/" "$WORK/apps/other/src/constants/universal-identifiers.ts"
while grep -q PLACEHOLDER "$WORK/apps/other/src/constants/universal-identifiers.ts"; do
  sed -i "0,/PLACEHOLDER/s//$(uuid)/" "$WORK/apps/other/src/constants/universal-identifiers.ts"
done
sed -i "s/supplierFixture/supplierOther/g; s/esc-supplier-fixture/esc-supplier-other/" \
  "$WORK/apps/other/src/objects/fixture.object.ts" "$WORK/apps/other/package.json"
"$CHECK" "$WORK/apps" >/dev/null 2>&1 || { echo "check-apps.test: two independent modules were refused" >&2; exit 1; }
echo "export const X = '$MOD_OBJECT';" >> "$WORK/apps/other/src/objects/fixture.object.ts"
expect_refusal "a module referencing another module"

fresh_copy
echo "export const Y = '$(uuid)';" >> "$WORK/apps/fixture/src/objects/fixture.object.ts"
expect_refusal "an identifier used in source but not declared in src/constants/"

fresh_copy
sed -i "s/supplierFixtures/suppliers/" "$WORK/apps/fixture/src/objects/fixture.object.ts"
expect_refusal "an object name already used by another app"

fresh_copy
rm -rf "$WORK/apps/core"
expect_refusal "no core app"

fresh_copy
mkdir -p "$WORK/apps/fixture/.github/workflows"
expect_refusal "a .github/workflows directory"

fresh_copy
add_access
"$CHECK" "$WORK/apps" >/dev/null 2>&1 || { echo "check-apps.test: core + a module + access were refused:" >&2; "$CHECK" "$WORK/apps" >&2 || true; exit 1; }
echo "check-apps.test: core + a module + the access app accepted — good."

fresh_copy
add_access
echo "export const X = defineObject({});" >> "$WORK/apps/access/src/roles/admin.role.ts"
expect_refusal "access calling defineObject (roles only)"

fresh_copy
add_access
echo "export const Y = defineField({});" >> "$WORK/apps/access/src/roles/admin.role.ts"
expect_refusal "access calling defineField (roles only)"

fresh_copy
add_access
echo "export const Z = defineView({});" >> "$WORK/apps/access/src/roles/admin.role.ts"
expect_refusal "access calling defineView (roles only)"

fresh_copy
add_access
echo "export const N = { nameSingular: 'accessRoleThing' };" >> "$WORK/apps/access/src/roles/admin.role.ts"
expect_refusal "access carrying a nameSingular (no objects in access)"

fresh_copy
add_access
sed -i "1i export const EARLY_SUPPLIER_UNIVERSAL_IDENTIFIER = '$CORE_OBJECT';" "$WORK/apps/access/src/constants/module-identifiers.ts"
expect_refusal "a module-identifiers entry before any '// app:' line"

fresh_copy
add_access
printf '\n// app: ghost\nexport const GHOST_OBJECT_UNIVERSAL_IDENTIFIER = %s;\n' "'$CORE_OBJECT'" \
  >> "$WORK/apps/access/src/constants/module-identifiers.ts"
expect_refusal "a module-identifiers section naming an app that does not exist"

fresh_copy
add_access
printf '\n// app: access\nexport const SELF_UNIVERSAL_IDENTIFIER = %s;\n' "'$ACC_ROLE'" \
  >> "$WORK/apps/access/src/constants/module-identifiers.ts"
expect_refusal "a module-identifiers section naming access itself"

fresh_copy
add_access
sed -i "s/= '$MOD_OBJECT';/= '$CORE_OBJECT';/" "$WORK/apps/access/src/constants/module-identifiers.ts"
expect_refusal "a module-identifiers entry the named app no longer declares"

fresh_copy
add_access
echo "export const STOLEN_APPLICATION_UNIVERSAL_IDENTIFIER = '$MOD_APP';" >> "$WORK/apps/access/src/roles/admin.role.ts"
expect_refusal "access referencing a fixture identifier it does not list"

fresh_copy
add_access
echo "export const X = '$ACC_APP';" >> "$WORK/apps/core/src/objects/supplier.object.ts"
expect_refusal "core referencing an access identifier (nothing references access)"

fresh_copy
add_access
echo "export const Y = '$ACC_ROLE';" >> "$WORK/apps/fixture/src/objects/fixture.object.ts"
expect_refusal "a module referencing an access identifier (nothing references access)"

fresh_copy
add_access
echo "export const SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER = '$CORE_OBJECT';" > "$WORK/apps/access/src/constants/core-identifiers.ts"
expect_refusal "access with its own core-identifiers list"
