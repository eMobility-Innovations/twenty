#!/usr/bin/env bash
# Covers esc/deploy/dependency-floor-probe.cjs and its use by scripts/verify-esc-image.sh.
# The probe is executed for real (local node) against fixture node_modules trees; the
# verifier runs unmodified behind a docker stub that runs the floor probe locally.
set -uo pipefail
. "$(dirname "$0")/harness.sh"

PROBE="${DEPLOY_DIR}/dependency-floor-probe.cjs"
VERIFY="${REPO_DIR}/scripts/verify-esc-image.sh"

pkg() { # dir name version
  mkdir -p "$1"
  printf '{"name":"%s","version":"%s"}\n' "$2" "$3" > "$1/package.json"
}

good_tree() { # root
  pkg "$1/node_modules/tar" tar 7.5.23
  pkg "$1/node_modules/proxy-addr" proxy-addr 2.0.8
  pkg "$1/node_modules/@mapbox/node-pre-gyp" @mapbox/node-pre-gyp 1.0.11
  pkg "$1/node_modules/@mapbox/node-pre-gyp/node_modules/tar" tar 7.5.23
  pkg "$1/node_modules/axios/node_modules/form-data" form-data 4.0.5
  pkg "$1/node_modules/postcss" postcss 8.5.33
}

probe() { ESC_FLOOR_ROOTS="$1/node_modules" node - < "${PROBE}" 2>&1; }

printf '\n== dependency-floor-probe.cjs\n'

begin "a tree at or above every floor reports ok"
setup_scratch
good_tree "${SCRATCH}/app"
out="$(probe "${SCRATCH}/app")"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "ESC_DEP_FLOOR_VERDICT: ok" && assert_not_contains "${out}" "ESC_DEP_FLOOR_BELOW" && pass
teardown_scratch

begin "a NESTED tar 6.2.1 (the deps2 miss) is reported with its path"
setup_scratch
good_tree "${SCRATCH}/app"
pkg "${SCRATCH}/app/node_modules/node-gyp/node_modules/tar" tar 6.2.1
out="$(probe "${SCRATCH}/app")"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "ESC_DEP_FLOOR_VERDICT: below=1" \
  && assert_contains "${out}" "tar@6.2.1 ${SCRATCH}/app/node_modules/node-gyp/node_modules/tar" && pass
teardown_scratch

begin "a scoped package below its floor is reported"
setup_scratch
good_tree "${SCRATCH}/app"
pkg "${SCRATCH}/app/node_modules/@nyariv/sandboxjs" @nyariv/sandboxjs 0.8.25
out="$(probe "${SCRATCH}/app")"
assert_contains "${out}" "@nyariv/sandboxjs@0.8.25" && assert_contains "${out}" "below=1" && pass
teardown_scratch

begin "a patch-level comparison is numeric (7.5.9 < 7.5.19)"
setup_scratch
pkg "${SCRATCH}/app/node_modules/tar" tar 7.5.9
out="$(probe "${SCRATCH}/app")"
assert_contains "${out}" "tar@7.5.9" && pass
teardown_scratch

begin "postcss 8.5.6 (the deps3 image, CVE-2026-45623) is reported below its floor"
setup_scratch
good_tree "${SCRATCH}/app"
pkg "${SCRATCH}/app/node_modules/postcss" postcss 8.5.6
out="$(probe "${SCRATCH}/app")"
assert_contains "${out}" "postcss@8.5.6" && assert_contains "${out}" "below=1" && pass
teardown_scratch

# --- the verifier -----------------------------------------------------------

# A docker stub that answers inspect, runs the floor probe locally against
# FLOOR_FIXTURE, answers the enterprise probe as valid and every other exec as success.
floor_stub() {
  cat > "${SCRATCH}/bin/docker" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  inspect) echo true ;;
  exec)
    case "$*" in
      *'node -'*)
        script="$(cat)"
        if grep -q ESC_DEP_FLOOR_VERDICT <<<"${script}"; then
          printf '%s' "${script}" | ESC_FLOOR_ROOTS="${FLOOR_FIXTURE}/node_modules" node -
        else
          echo 'ESC_ENTERPRISE_VERDICT: isValid=true hasValidEnterpriseValidityToken=true licenceIsValid=true subscriptionActive=true'
        fi ;;
      *APP_VERSION*) printf '2.0.0' ;;
      *) exit 0 ;;
    esac ;;
  *) exit 0 ;;
esac
STUB
  chmod +x "${SCRATCH}/bin/docker"
}

begin "verify-esc-image FAILS (exit 1) on an image carrying a nested tar 6.2.1"
setup_scratch; floor_stub
good_tree "${SCRATCH}/app"
pkg "${SCRATCH}/app/node_modules/cacache/node_modules/tar" tar 6.2.1
out="$(FLOOR_FIXTURE="${SCRATCH}/app" "${VERIFY}" 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "FAIL packages below their security floor" && assert_contains "${out}" "tar@6.2.1" && pass
teardown_scratch

begin "verify-esc-image PASSES the floor check on a clean image"
setup_scratch; floor_stub
good_tree "${SCRATCH}/app"
out="$(FLOOR_FIXTURE="${SCRATCH}/app" "${VERIFY}" 2>&1)"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "PASS no package below its security floor" && pass
teardown_scratch

begin "a floor probe that prints no verdict is CANNOT MEASURE (exit 3), never a pass"
setup_scratch; floor_stub
sed -i.bak 's|ESC_FLOOR_ROOTS=|NODE_OPTIONS=--bogus-flag ESC_FLOOR_ROOTS=|' "${SCRATCH}/bin/docker"
good_tree "${SCRATCH}/app"
out="$(FLOOR_FIXTURE="${SCRATCH}/app" "${VERIFY}" 2>&1)"; rc=$?
assert_exit 3 $rc && assert_contains "${out}" "dependency floor probe did not complete" && pass
teardown_scratch

summary
