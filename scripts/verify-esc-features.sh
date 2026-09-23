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
PRIVATE_IP_UTIL="${APP_DIR}/packages/twenty-server/src/engine/core-modules/secure-http-client/utils/is-private-ip.util.ts"
PATCH_CJS="${APP_DIR}/esc/deploy/patch-enterprise.cjs"
TWENTY_DOCKERFILE="${APP_DIR}/packages/twenty-docker/twenty/Dockerfile"

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
    #
    # 🔧 FIXED 2026-09-21. This used to grep the whole method body for the name
    # `hasValidEnterpriseValidityToken`, and the patched method EXPLAINS ITSELF in a
    # comment — "Upstream returned `this.hasValidEnterpriseValidityToken()`, which is
    # false ...". So the check read a correctly patched file as unpatched, FAILED, and
    # because esc-apply.sh runs this verifier, THE OVERLAY APPLY ITSELF EXITED NON-ZERO.
    # A source build following the documented path would have aborted. Grep counts
    # comments; strip them before asking whether the code calls anything.
    ISVALID_CODE="$(printf '%s\n' "${ISVALID_BODY}" | sed 's://.*::')"

    if printf '%s\n' "${ISVALID_CODE}" | grep -q "hasValidEnterpriseValidityToken"; then
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

    # ── PARITY WITH THE COMPILED PATCH, DERIVED — NOT A HARD-CODED LIST ──────
    #
    # ADDED 2026-09-22. Until then this script checked isValid() and nothing else,
    # while esc/deploy/patch-enterprise.cjs overrides FOUR methods on the compiled
    # image and says in its own header why one is not enough: the frontend reads
    # getSubscriptionStatus() and getLicenseInfo(). A source build overriding only
    # isValid() puts the "enterprise key no longer valid" banner in front of every
    # user, and reports PASS while doing it.
    #
    # Option B (the compiled patch) is this fork's stated rollback for option A (the
    # source build), so the two must be provably equivalent. The method list is READ
    # OUT OF the compiled patch rather than written down here, so adding a fifth
    # method there cannot leave this check silently behind.
    if [ ! -f "${PATCH_CJS}" ]; then
        check_fail "esc/deploy/patch-enterprise.cjs not found — cannot derive the method list the source overlay must match"
    else
        PATCHED_METHODS="$(grep -oE '\$1(async )?[A-Za-z]+\(\)' "${PATCH_CJS}" \
            | sed -E 's/^\$1(async )?//; s/\(\)$//' | sort -u)"

        if [ -z "${PATCHED_METHODS}" ]; then
            check_fail "could not read any patched method name out of patch-enterprise.cjs — the extraction is broken, not the patch"
        else
            for METHOD in ${PATCHED_METHODS}; do
                # Two traps, both hit while writing this check:
                #  - `async getLicenseInfo(` does not contain `  getLicenseInfo(`, so a
                #    plain substring match reads two of the four methods as MISSING.
                #  - a multi-line signature such as `getSubscriptionStatus(): Promise<{`
                #    closes with `  } | null> {`, so an end anchor of /^  \}/ stops
                #    before the body and reports an overridden method as not overridden.
                # Hence: anchor the declaration, and end only on a line that is exactly
                # two spaces and a brace.
                METHOD_BODY="$(awk -v m="${METHOD}" '$0 ~ "^  (async )?" m "\\(" {f=1} f{print} f&&/^  \}$/{exit}' "${PLAN_SVC}")"

                if [ -z "${METHOD_BODY}" ]; then
                    check_fail "${METHOD}() is patched on the compiled image but is MISSING from the source overlay"
                elif printf '%s\n' "${METHOD_BODY}" | grep -q "ESC OVERLAY PATCH"; then
                    check_pass "${METHOD}() is overridden in the source overlay too"
                else
                    check_fail "${METHOD}() is patched on the compiled image but NOT overridden in the source overlay — a source build will diverge from production here"
                fi
            done
        fi
    fi
fi

echo ""
echo "2. SSRF allowlist (ESC_SSRF_ALLOWED_HOSTS)"

# ADDED 2026-09-21, and the gap it closes was real: until then the SSRF allowlist
# existed ONLY as a compiled patch (esc/deploy/patch-ssrf-allowlist.cjs), applied to
# the official image. A SOURCE build of this fork therefore shipped WITHOUT it, and
# the failure is quiet — one workflow stops working with "Request to internal IP
# address ... is not allowed" and nothing else looks wrong. Moving CT175 to a source
# build is exactly when that would have bitten.
if [ ! -f "${PRIVATE_IP_UTIL}" ]; then
    check_fail "is-private-ip.util.ts not found at expected path (upstream may have moved it — update esc/overlay/ and PATCH_MANIFEST.md)"
else
    if grep -q "ESC_SSRF_ALLOWED_HOSTS" "${PRIVATE_IP_UTIL}"; then
        check_pass "isPrivateIp consults ESC_SSRF_ALLOWED_HOSTS"
    else
        check_fail "isPrivateIp does NOT consult ESC_SSRF_ALLOWED_HOSTS — the allowlist is absent (re-apply overlay)"
    fi

    # The allowlist must be exact-match. A CIDR or prefix check here would re-open the
    # whole estate, so its absence is part of the contract, not a detail.
    if grep -q "\.includes(addr)" "${PRIVATE_IP_UTIL}"; then
        check_pass "allowlist is exact-match on the address"
    else
        check_fail "allowlist is not an exact-match .includes(addr) test — refusing to assume it is safe"
    fi

    if grep -q "ESC OVERLAY PATCH" "${PRIVATE_IP_UTIL}"; then
        check_pass "ESC patch marker comment present"
    else
        check_warn "ESC patch marker comment missing (cosmetic, not functional)"
    fi
fi

echo ""
echo "3. Base image pinned by digest"

# ADDED 2026-09-22. Upstream uses the moving tag `node:24-alpine`. Production
# (twenty-esc-sso:v2.0.0-ssrf1) runs Node v24.15.0; a source build of the same fork
# three days later picked up v24.21.0 from that tag. An image that cannot be rebuilt
# identically has no rollback worth the name, and nobody is told when the runtime
# moves underneath them.
if [ ! -f "${TWENTY_DOCKERFILE}" ]; then
    check_fail "packages/twenty-docker/twenty/Dockerfile not found (upstream may have moved it — update esc/overlay/ and PATCH_MANIFEST.md)"
else
    FROM_TOTAL="$(grep -cE '^FROM node:' "${TWENTY_DOCKERFILE}" || true)"
    FROM_PINNED="$(grep -cE '^FROM node:[0-9]+\.[0-9]+\.[0-9]+-alpine@sha256:[0-9a-f]{64}' "${TWENTY_DOCKERFILE}" || true)"

    if [ "${FROM_TOTAL}" = "0" ]; then
        check_fail "no 'FROM node:' line found at all — the Dockerfile is not the one this check was written for"
    elif [ "${FROM_PINNED}" = "${FROM_TOTAL}" ]; then
        check_pass "all ${FROM_TOTAL} node base images pinned to an exact version and digest"
    else
        check_fail "${FROM_PINNED} of ${FROM_TOTAL} node base images are pinned — a moving tag means the image cannot be rebuilt identically"
        grep -nE '^FROM node:' "${TWENTY_DOCKERFILE}" | grep -vE '@sha256:[0-9a-f]{64}' | sed 's/^/       /'
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
