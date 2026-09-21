#!/usr/bin/env bash
#
# ESC Feature Verification Script (Twenty)
#
# Checks that ESC customizations are present in the APPLIED tree after
# esc-apply.sh or an upstream upgrade. Run after upgrading to confirm nothing
# was accidentally reverted.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

PASS=0; FAIL=0; WARN=0
check_pass() { echo -e "  ${GREEN}PASS${NC} $1"; PASS=$((PASS + 1)); }
check_fail() { echo -e "  ${RED}FAIL${NC} $1"; FAIL=$((FAIL + 1)); }
check_warn() { echo -e "  ${YELLOW}WARN${NC} $1"; WARN=$((WARN + 1)); }

PLAN_SVC="${APP_DIR}/packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts"

echo -e "${BOLD}"
echo "  ESC Twenty Feature Verification"
echo "  ==============================="
echo -e "${NC}"

echo "1. Enterprise / SSO unlock"

if [ ! -f "${PLAN_SVC}" ]; then
    check_fail "enterprise-plan.service.ts not found at expected path (upstream may have moved it — update esc/overlay/ and PATCH_MANIFEST.md)"
else
    # Isolate the isValid() method body (from its signature to the next
    # column-2 closing brace) so checks are scoped to that method only.
    # Uses awk (portable: BSD/macOS + GNU) rather than grep -P (GNU-only).
    ISVALID_BODY="$(awk '/isValid\(\): boolean \{/{f=1} f{print} f&&/^  \}/{exit}' "${PLAN_SVC}")"

    # The patched isValid() must unconditionally return true.
    if printf '%s\n' "${ISVALID_BODY}" | grep -q "return true;"; then
        check_pass "isValid() returns true (Enterprise gate bypassed)"
    else
        check_fail "isValid() does NOT return true — SSO gate NOT bypassed (re-apply overlay)"
    fi

    # The upstream token-based body must be gone from isValid().
    if printf '%s\n' "${ISVALID_BODY}" | grep -q "hasValidEnterpriseValidityToken"; then
        check_fail "isValid() still calls hasValidEnterpriseValidityToken() — patch not applied"
    else
        check_pass "upstream token-based isValid() body removed"
    fi

    # The ESC patch marker should be present for traceability.
    if grep -q "ESC OVERLAY PATCH" "${PLAN_SVC}"; then
        check_pass "ESC patch marker comment present"
    else
        check_warn "ESC patch marker comment missing (cosmetic, not functional)"
    fi
fi

echo ""
echo -e "${BOLD}Summary:${NC} ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${YELLOW}${WARN} warnings${NC}"
echo ""

if [ "${FAIL}" -gt 0 ]; then
    echo -e "${RED}Verification FAILED.${NC} See scripts/PATCH_MANIFEST.md to re-apply the patch."
    exit 1
fi
echo -e "${GREEN}All ESC features verified.${NC}"
