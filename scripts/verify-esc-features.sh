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
NAV_OTHER_SECTION="${APP_DIR}/packages/twenty-front/src/modules/navigation/components/NavigationDrawerOtherSection.tsx"
TOUR_LAUNCHER="${APP_DIR}/packages/twenty-front/src/modules/esc-tour/components/EscTourNavigationDrawerItem.tsx"
TOUR_STEPS="${APP_DIR}/packages/twenty-front/src/modules/esc-tour/constants/escTourSteps.ts"

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
echo "3. Guided tour (Tour button in the sidebar)"

# ADDED 2026-09-23, and until now this file had NO Category-3 section at all — it verified
# the two server patches and stopped, while Category 3 in scripts/PATCH_MANIFEST.md is a
# whole feature living in one overlaid upstream file.
#
# The gap that leaves open is the documented upstream-upgrade step: copy a fresh upstream
# NavigationDrawerOtherSection.tsx into esc/overlay/ and re-apply. That deletes the Tour
# button outright, and EVERY source-side gate stays green while it does — the tour module
# still compiles, its unit tests still pass (they render the launcher directly), and
# nothing else in the tree references it. The first sign would be a user asking where the
# Tour button went.
#
# The overlay touches exactly ONE upstream file on purpose, so exactly one file has to be
# checked. What is checked in it is DERIVED, not written down: every '@/esc-tour/...'
# import that file makes must also be RENDERED in it, and the module it names must exist
# in the applied tree. Deriving matters because this section's contents have already
# grown once — the tour's overlay had to move OUT of AnimatedExpandableContainer, which
# unmounts its children when somebody collapses "Other" — and a hand-written list of
# component names would have quietly stopped covering the new one.
#
# Import AND render, both, because an import left behind with no JSX beside it is exactly
# the shape a careless three-way merge takes, and it compiles.
if [ ! -f "${NAV_OTHER_SECTION}" ]; then
    check_fail "NavigationDrawerOtherSection.tsx not found at expected path (upstream may have moved it — update esc/overlay/ and PATCH_MANIFEST.md)"
else
    # The module path is matched rather than the import statement, because a long import
    # is the one prettier may wrap across lines while the path itself never splits. The
    # component's name is its file's basename — one component per file, named after it, is
    # the convention this whole tree follows.
    # `|| true` is load-bearing under `set -o pipefail`: no match means grep exits 1, which
    # would kill this script outright — and "the file imports nothing from the tour" is the
    # single most important thing this section has to be able to REPORT.
    TOUR_IMPORTS="$(grep -oE "'@/esc-tour/[A-Za-z0-9/_-]+'" "${NAV_OTHER_SECTION}" \
        | tr -d "'" | sort -u || true)"

    if [ -z "${TOUR_IMPORTS}" ]; then
        check_fail "NavigationDrawerOtherSection imports NOTHING from @/esc-tour — there is NO Tour button, and no tour (this is what re-copying a fresh upstream file does)"
    fi

    for TOUR_MODULE in ${TOUR_IMPORTS}; do
        TOUR_COMPONENT="$(basename "${TOUR_MODULE}")"
        # Both extensions, because the alias resolves either and a section that one day
        # imports a hook or a constant from the module must not read as a missing file.
        TOUR_MODULE_BASE="${APP_DIR}/packages/twenty-front/src/modules/${TOUR_MODULE#@/}"
        TOUR_MODULE_FILE="${TOUR_MODULE_BASE}.tsx"

        if [ ! -f "${TOUR_MODULE_FILE}" ] && [ -f "${TOUR_MODULE_BASE}.ts" ]; then
            TOUR_MODULE_FILE="${TOUR_MODULE_BASE}.ts"
        fi

        if [ ! -f "${TOUR_MODULE_FILE}" ]; then
            check_fail "${TOUR_MODULE} is imported but ${TOUR_MODULE_BASE#"${APP_DIR}"/}.tsx|.ts does not exist — esc/new/ was not copied into the tree"
        elif [ "${TOUR_MODULE#@/esc-tour/components/}" != "${TOUR_MODULE}" ]; then
            # Under components/, so it is a component and the question is whether it is
            # RENDERED. Asking that of a hook would be a false alarm, hence the split.
            if grep -q "<${TOUR_COMPONENT}" "${NAV_OTHER_SECTION}"; then
                check_pass "${TOUR_COMPONENT} is imported AND rendered by the sidebar section"
            else
                check_fail "${TOUR_COMPONENT} is imported by NavigationDrawerOtherSection but never rendered — it compiles, and it does nothing"
            fi
        elif [ "$(grep -c "${TOUR_COMPONENT}" "${NAV_OTHER_SECTION}")" -gt 1 ]; then
            # Not a component, so it is used by being called or read. More than one
            # occurrence, because the import line itself carries the name — matching once
            # would be the check agreeing with its own premise.
            check_pass "${TOUR_COMPONENT} is imported AND used by the sidebar section"
        else
            check_fail "${TOUR_COMPONENT} is imported by NavigationDrawerOtherSection but never used"
        fi
    done

    # Derivation alone cannot say the LAUNCHER is there: a file importing nothing from the
    # tour satisfies "every tour import is rendered" vacuously. The Tour button is the
    # deliverable, so it is named.
    if printf '%s\n' "${TOUR_IMPORTS}" | grep -q '/EscTourNavigationDrawerItem$'; then
        check_pass "the sidebar section carries the tour LAUNCHER (the Tour button itself)"
    else
        check_fail "NavigationDrawerOtherSection does not import EscTourNavigationDrawerItem — whatever else it carries, there is NO Tour button in the sidebar"
    fi

    if grep -q "ESC:" "${NAV_OTHER_SECTION}"; then
        check_pass "ESC patch marker comment present"
    else
        check_warn "ESC patch marker comment missing (cosmetic, not functional)"
    fi
fi

if [ ! -f "${TOUR_LAUNCHER}" ]; then
    check_fail "esc-tour module missing from the applied tree at ${TOUR_LAUNCHER#"${APP_DIR}"/} — esc/new/ was not copied, and the import above points at nothing"
else
    check_pass "the esc-tour module is in the applied tree"

    # THE DEPLOY-TIME MARKER, CHECKED AT SOURCE TIME. scripts/verify-esc-tour.sh proves a
    # built image still has a sidebar launcher in it by grepping the bundle for
    # `label:"Tour"` — the launcher's label is a plain string literal, not a lingui macro,
    # so it survives the build verbatim, and upstream ships no "Tour" string anywhere in
    # twenty-front, twenty-ui or twenty-shared (grepped 2026-09-23, zero hits). That makes
    # it the one marker only the sidebar entry emits.
    #
    # Renaming the label is a perfectly reasonable thing to want. It just has to happen in
    # both places at once, so this fails HERE — at apply time, with the other file named —
    # rather than at deploy time as a bundle grep that says the tour is missing when it is
    # not.
    if grep -q 'label="Tour"' "${TOUR_LAUNCHER}"; then
        check_pass "launcher label is \"Tour\", the marker scripts/verify-esc-tour.sh greps for"
    else
        check_fail "launcher label is no longer \"Tour\" — scripts/verify-esc-tour.sh greps the built bundle for label:\"Tour\" and will report the tour missing. Change both, or neither."
    fi
fi

# The live anchor-drift check derives its route list from these declarations rather than
# from the selector strings, which escTourObjectAnchor() computes. If a step stops naming
# its object, that check silently has one fewer route to verify — and a drift check with
# nothing to check is the failure mode it exists to catch, one level up.
if [ ! -f "${TOUR_STEPS}" ]; then
    check_fail "escTourSteps.ts missing from the applied tree — scripts/verify-esc-tour.sh --anchors has no route list to derive"
elif grep -qE "objectNamePlural: '[^']+'" "${TOUR_STEPS}"; then
    check_pass "tour steps declare objectNamePlural ($(grep -cE "objectNamePlural: '[^']+'" "${TOUR_STEPS}") step(s)), so anchor drift is checkable"
else
    check_fail "no tour step declares an objectNamePlural — scripts/verify-esc-tour.sh --anchors would have nothing to check against the live workspace"
fi

echo ""
echo -e "${BOLD}Summary:${NC} ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${YELLOW}${WARN} warnings${NC}"
echo ""

if [ "${FAIL}" -gt 0 ]; then
    echo -e "${RED}Verification FAILED.${NC} See scripts/PATCH_MANIFEST.md to re-apply the patch."
    exit 1
fi
echo -e "${GREEN}All ESC features verified.${NC}"
