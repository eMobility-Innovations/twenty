#!/usr/bin/env bash
# Covers esc/deploy/verify-esc-enterprise-behaviour.sh — the check that replaced two
# greps, one of which could not fail and one of which failed on correct input.
set -uo pipefail
. "$(dirname "$0")/harness.sh"

SCRIPT="${DEPLOY_DIR}/verify-esc-enterprise-behaviour.sh"

ALL_TRUE='ESC_ENTERPRISE_VERDICT: isValid=true hasValidEnterpriseValidityToken=true licenceIsValid=true subscriptionActive=true'
# What the pre-fix source image actually printed on CT140, 2026-09-22.
PRE_FIX='ESC_ENTERPRISE_VERDICT: isValid=true hasValidEnterpriseValidityToken=false licenceIsValid=false subscriptionActive=false'

printf '\n== verify-esc-enterprise-behaviour.sh\n'

begin "a fully patched image passes, exit 0"
setup_scratch
stub_setline run_output "${ALL_TRUE}"
out="$("${SCRIPT}" some-image:tag 2>&1)"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "reports enterprise valid on all four" && pass
teardown_scratch

begin "the pre-fix image's real verdict fails, exit 1"
setup_scratch
stub_setline run_output "${PRE_FIX}"
out="$("${SCRIPT}" some-image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "does NOT report enterprise as valid" && pass
teardown_scratch

# The regression that matters: three of the four methods reporting invalid is the
# banner in front of every user, and the old grep-based check passed on exactly that.
begin "only hasValidEnterpriseValidityToken false is still a failure"
setup_scratch
stub_setline run_output 'ESC_ENTERPRISE_VERDICT: isValid=true hasValidEnterpriseValidityToken=false licenceIsValid=true subscriptionActive=true'
out="$("${SCRIPT}" some-image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && pass
teardown_scratch

begin "a probe that produced no verdict line fails rather than passing"
setup_scratch
stub_setline run_output '{"error":"could not load the service: boom"}'
out="$("${SCRIPT}" some-image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "no verdict" && pass
teardown_scratch

begin "empty probe output fails"
setup_scratch
stub_set run_output ''
out="$("${SCRIPT}" some-image:tag 2>&1)"; rc=$?
assert_exit 1 $rc && pass
teardown_scratch

printf '\n== --compare\n'

begin "two images that agree and are both valid pass"
setup_scratch
stub_setline run_output "${ALL_TRUE}"
out="$("${SCRIPT}" --compare image-a:1 image-b:1 2>&1)"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "both images report enterprise valid, identically" && pass
teardown_scratch

# The whole point of --compare: option B is option A's rollback, so a difference
# between them is a finding even when one of them is fine.
begin "two images that disagree fail, and say which is which"
setup_scratch
stub_setline "run_output.image-a:1" "${ALL_TRUE}"
stub_setline "run_output.image-b:1" "${PRE_FIX}"
out="$("${SCRIPT}" --compare image-a:1 image-b:1 2>&1)"; rc=$?
assert_exit 1 $rc \
  && assert_contains "${out}" "THE TWO IMAGES DISAGREE" \
  && assert_contains "${out}" "image-a:1" \
  && assert_contains "${out}" "image-b:1" \
  && pass
teardown_scratch

# Agreement is not correctness. Two unpatched images agree perfectly.
begin "two images that agree on the WRONG answer still fail"
setup_scratch
stub_setline run_output "${PRE_FIX}"
out="$("${SCRIPT}" --compare image-a:1 image-b:1 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "agree on the WRONG answer" && pass
teardown_scratch

begin "--compare with a missing second image argument is a usage error"
setup_scratch
out="$("${SCRIPT}" --compare only-one:1 2>&1)"; rc=$?
assert_exit 2 $rc && pass
teardown_scratch

begin "no arguments at all is a usage error, not a pass"
setup_scratch
out="$("${SCRIPT}" 2>&1)"; rc=$?
assert_exit 2 $rc && pass
teardown_scratch

summary
