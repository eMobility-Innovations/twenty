#!/usr/bin/env bash
# Covers esc/deploy/boot-smoke-test.sh — the gate that did not exist when a Nest DI
# fault took the CRM down for 16h41m behind five green checks.
set -uo pipefail
. "$(dirname "$0")/harness.sh"

SCRIPT="${DEPLOY_DIR}/boot-smoke-test.sh"

# A run where everything goes right: server stays up, /healthz 200, the table exists
# after the fresh install, goes missing when the test drops it, and comes back after
# `command:prod upgrade` with a completed row.
happy_path() {
  stub_setline ps_output 'esc-smoke-server'
  stub_answer healthz '200'
  stub_queue to_regclass 'core."escOnboarding"' 'MISSING' 'core."escOnboarding"'
  stub_answer migration_status 'completed'
}

printf '\n== boot-smoke-test.sh\n'

begin "happy path passes, exit 0"
setup_scratch; happy_path
out="$(ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag 2>&1)"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "SMOKE PASSED" && pass
teardown_scratch

# The single most important refusal in the script. CT175 has 8 GB and runs production
# Postgres, Redis and two CRM stacks; a second CRM server there is how you turn a test
# into an outage.
begin "refuses to run on the production host"
setup_scratch; happy_path
stub_setline ps_output 'twenty-esc-server-1'
out="$(ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "this is CT175" && pass
teardown_scratch

begin "no image argument is a usage error"
setup_scratch
out="$("${SCRIPT}" 2>&1)"; rc=$?
assert_exit 2 $rc && pass
teardown_scratch

# The critic's point: a smoke run whose env differs from production's cannot catch the
# failure class that caused the outage, because a DI fault on the SMTP path boots green
# under the default logger driver.
begin "refuses when a graph-shaping env key is missing from the template"
setup_scratch; happy_path
tmpl="${DEPLOY_DIR}/smoke.env.template"
cp "${tmpl}" "${SCRATCH}/template.bak"
grep -v '^EMAIL_DRIVER=' "${SCRATCH}/template.bak" > "${tmpl}"
out="$(ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag 2>&1)"; rc=$?
cp "${SCRATCH}/template.bak" "${tmpl}"
assert_exit 1 $rc && assert_contains "${out}" "missing EMAIL_DRIVER" && pass
teardown_scratch

# This is the outage, reduced to a test: the container exits before it serves.
begin "a container that dies before serving fails, and says so"
setup_scratch; happy_path
stub_setline ps_output 'something-else'
out="$(ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "exited before it served" && pass
teardown_scratch

begin "a server that never answers /healthz fails on timeout"
setup_scratch; happy_path
stub_answer healthz '000'
out="$(ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "never returned 200" && pass
teardown_scratch

begin "a 500 from /healthz is not a pass"
setup_scratch; happy_path
stub_answer healthz '500'
out="$(ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && pass
teardown_scratch

begin "a fresh install that did not create the table fails"
setup_scratch; happy_path
stub_queue to_regclass 'MISSING'
out="$(ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "absent after a fresh install" && pass
teardown_scratch

# The claim PR #23 could not make: that `command:prod upgrade` inside the real image
# reaches the instance command. If it does not, the wizard ships dead on arrival.
begin "upgrade that leaves the table missing fails — the dead-on-arrival case"
setup_scratch; happy_path
stub_queue to_regclass 'core."escOnboarding"' 'MISSING' 'MISSING'
out="$(ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "not in the executed sequence" && pass
teardown_scratch

begin "upgrade exiting non-zero fails"
setup_scratch; happy_path
stub_set upgrade_rc '1'
out="$(ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "exited non-zero" && pass
teardown_scratch

# A table that exists without the row was created by something other than the upgrade
# path — which is a finding, not a pass.
begin "table present but the command not recorded completed fails"
setup_scratch; happy_path
stub_answer migration_status 'ABSENT'
out="$(ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "something other than the upgrade path" && pass
teardown_scratch

begin "a failed status on the row fails"
setup_scratch; happy_path
stub_answer migration_status 'failed'
out="$(ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && pass
teardown_scratch

begin "a Postgres that never becomes ready fails"
setup_scratch; happy_path
stub_set pg_isready_rc '1'
out="$(ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "never became ready" && pass
teardown_scratch

# Safety: the generated env must point at the throwaway container. A smoke run that
# reached a real database would be worse than no smoke run at all.
begin "the env it generates pins the database to the throwaway container"
setup_scratch; happy_path
out="$(ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag 2>&1)"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "database pinned to esc-smoke-pg" && pass
teardown_scratch

begin "it tears down its containers on success"
setup_scratch; happy_path
ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag >/dev/null 2>&1
assert_contains "$(cat "${DOCKER_STUB_STATE}/calls.log")" "rm -f esc-smoke-server" && pass
teardown_scratch

begin "it tears down its containers on failure too"
setup_scratch; happy_path
stub_answer healthz '000'
ESC_SMOKE_BOOT_TIMEOUT=10 "${SCRIPT}" image:tag >/dev/null 2>&1
assert_contains "$(cat "${DOCKER_STUB_STATE}/calls.log")" "rm -f esc-smoke-server" && pass
teardown_scratch

summary
