#!/usr/bin/env bash
# Covers esc/deploy/enterprise-behaviour-probe.cjs against fake services standing in for
# a patched image, an unpatched one, and the several ways a real service misbehaves.
#
# The probe is the thing two deploy gates now trust instead of a grep, so its verdict
# logic is worth more than the wrappers around it.
set -uo pipefail
. "$(dirname "$0")/harness.sh"

PROBE="${DEPLOY_DIR}/enterprise-behaviour-probe.cjs"
ALL_TRUE='ESC_ENTERPRISE_VERDICT: isValid=true hasValidEnterpriseValidityToken=true licenceIsValid=true subscriptionActive=true'

if ! command -v node >/dev/null 2>&1; then
  printf '\n== enterprise-behaviour-probe.cjs\n  SKIPPED — no node on PATH. THIS RUN DID NOT CHECK THE PROBE.\n' >&2
  exit 0
fi

# Writes a fake enterprise-plan.service.js and runs the probe against it.
probe_with() { # body-of-class
  local f="${SCRATCH}/service.js"
  cat > "${f}" <<JS
class EnterprisePlanService {
$1
}
module.exports = { EnterprisePlanService };
JS
  ESC_PROBE_SERVICE_PATH="${f}" node "${PROBE}" 2>&1
}

printf '\n== enterprise-behaviour-probe.cjs\n'

# What production's patched image does.
begin "a fully patched service yields an all-true verdict"
setup_scratch
out="$(probe_with "
  isValid() { return true; }
  hasValidEnterpriseValidityToken() { return true; }
  async getLicenseInfo() { return { isValid: true, licensee: 'ESC Self-Hosted', expiresAt: new Date(), subscriptionId: 'self-hosted-esc' }; }
  async getSubscriptionStatus() { return { status: 'active', licensee: 'ESC Self-Hosted' }; }
")"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "${ALL_TRUE}" && pass
teardown_scratch

# What the pre-fix source image did: isValid patched, the other three upstream.
begin "isValid alone patched reproduces the pre-fix verdict exactly"
setup_scratch
out="$(probe_with "
  isValid() { return true; }
  hasValidEnterpriseValidityToken() { return false; }
  async getLicenseInfo() { return { isValid: false, licensee: null, expiresAt: null, subscriptionId: null }; }
  async getSubscriptionStatus() { return null; }
")"; rc=$?
assert_exit 0 $rc \
  && assert_contains "${out}" 'ESC_ENTERPRISE_VERDICT: isValid=true hasValidEnterpriseValidityToken=false licenceIsValid=false subscriptionActive=false' \
  && pass
teardown_scratch

# A method that throws must read as not-valid, never as valid.
begin "a method that throws is recorded and counts as invalid"
setup_scratch
out="$(probe_with "
  isValid() { throw new Error('boom'); }
  hasValidEnterpriseValidityToken() { return true; }
  async getLicenseInfo() { return { isValid: true }; }
  async getSubscriptionStatus() { return { status: 'active' }; }
")"; rc=$?
assert_exit 0 $rc \
  && assert_contains "${out}" "threw: boom" \
  && assert_contains "${out}" "isValid=false" \
  && pass
teardown_scratch

begin "a rejected promise counts as invalid rather than crashing the probe"
setup_scratch
out="$(probe_with "
  isValid() { return true; }
  hasValidEnterpriseValidityToken() { return true; }
  async getLicenseInfo() { throw new Error('no db'); }
  async getSubscriptionStatus() { return { status: 'active' }; }
")"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "licenceIsValid=false" && pass
teardown_scratch

# getSubscriptionStatus returning null is upstream's behaviour when the licensing API is
# unreachable, which is exactly what --network none guarantees.
begin "a null subscription counts as inactive"
setup_scratch
out="$(probe_with "
  isValid() { return true; }
  hasValidEnterpriseValidityToken() { return true; }
  async getLicenseInfo() { return { isValid: true }; }
  async getSubscriptionStatus() { return null; }
")"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "subscriptionActive=false" && pass
teardown_scratch

# A status of anything other than 'active' is not active. `trialing` is the plausible one.
begin "a non-active subscription status counts as inactive"
setup_scratch
out="$(probe_with "
  isValid() { return true; }
  hasValidEnterpriseValidityToken() { return true; }
  async getLicenseInfo() { return { isValid: true }; }
  async getSubscriptionStatus() { return { status: 'trialing' }; }
")"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "subscriptionActive=false" && pass
teardown_scratch

# Truthiness is not enough: only exactly true may count as valid.
begin "a truthy non-true value does not count as valid"
setup_scratch
out="$(probe_with "
  isValid() { return 1; }
  hasValidEnterpriseValidityToken() { return 'yes'; }
  async getLicenseInfo() { return { isValid: 'true' }; }
  async getSubscriptionStatus() { return { status: 'active' }; }
")"; rc=$?
assert_exit 0 $rc \
  && assert_contains "${out}" "isValid=false" \
  && assert_contains "${out}" "hasValidEnterpriseValidityToken=false" \
  && assert_contains "${out}" "licenceIsValid=false" \
  && pass
teardown_scratch

begin "an unloadable service exits 3 and says why, rather than printing a verdict"
setup_scratch
out="$(ESC_PROBE_SERVICE_PATH="${SCRATCH}/nope.js" node "${PROBE}" 2>&1)"; rc=$?
assert_exit 3 $rc \
  && assert_contains "${out}" "could not load the service" \
  && assert_not_contains "${out}" "ESC_ENTERPRISE_VERDICT" \
  && pass
teardown_scratch

# The verdict line is what both wrappers match on, so its exact shape is a contract.
begin "the verdict line lists the four keys in a fixed order"
setup_scratch
out="$(probe_with "
  isValid() { return true; }
  hasValidEnterpriseValidityToken() { return true; }
  async getLicenseInfo() { return { isValid: true }; }
  async getSubscriptionStatus() { return { status: 'active' }; }
")"
assert_contains "${out}" "${ALL_TRUE}" && pass
teardown_scratch

# The report is read by humans too, so the raw values must survive alongside the verdict.
begin "the raw method results are reported, not just the verdict"
setup_scratch
out="$(probe_with "
  isValid() { return true; }
  hasValidEnterpriseValidityToken() { return true; }
  async getLicenseInfo() { return { isValid: true, licensee: 'ESC Self-Hosted' }; }
  async getSubscriptionStatus() { return { status: 'active' }; }
")"
assert_contains "${out}" '"licensee": "ESC Self-Hosted"' && pass
teardown_scratch

summary
