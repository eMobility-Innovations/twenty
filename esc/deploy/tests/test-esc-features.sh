#!/usr/bin/env bash
# Covers scripts/verify-esc-features.sh — the source-side verifier that runs on the
# build path, inside esc-apply.sh. A false FAIL here once aborted the overlay apply,
# and a too-narrow check once let three of four enterprise methods go unpatched.
#
# It runs against a FIXTURE tree rather than the repo, so each case can shape the
# applied files without touching the working copy.
set -uo pipefail
. "$(dirname "$0")/harness.sh"

SCRIPT="${REPO_DIR}/scripts/verify-esc-features.sh"

PLAN_REL=packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts
IP_REL=packages/twenty-server/src/engine/core-modules/secure-http-client/utils/is-private-ip.util.ts
DOCKERFILE_REL=packages/twenty-docker/twenty/Dockerfile
NAV_REL=packages/twenty-front/src/modules/navigation/components/NavigationDrawerOtherSection.tsx
TOUR_REL=packages/twenty-front/src/modules/esc-tour

# A fixture APP_DIR whose files are the OVERLAY's, i.e. a correctly applied tree.
# verify-esc-features.sh derives APP_DIR from its own location, so the script is copied
# in alongside a scripts/ directory, exactly as it sits in the repo.
make_applied_tree() {
  local root="${SCRATCH}/tree"
  mkdir -p "${root}/scripts" "${root}/esc/deploy" \
           "${root}/$(dirname "${PLAN_REL}")" \
           "${root}/$(dirname "${IP_REL}")" \
           "${root}/$(dirname "${DOCKERFILE_REL}")" \
           "${root}/$(dirname "${NAV_REL}")" \
           "${root}/$(dirname "${TOUR_REL}")"

  cp "${REPO_DIR}/scripts/verify-esc-features.sh" "${root}/scripts/"
  cp "${REPO_DIR}/esc/deploy/patch-enterprise.cjs" "${root}/esc/deploy/"
  cp "${REPO_DIR}/esc/overlay/${PLAN_REL}"       "${root}/${PLAN_REL}"
  cp "${REPO_DIR}/esc/overlay/${IP_REL}"         "${root}/${IP_REL}"
  cp "${REPO_DIR}/esc/overlay/${DOCKERFILE_REL}" "${root}/${DOCKERFILE_REL}"

  # Category 3 — the tour. The fixture has to be a tree esc-apply.sh could have PRODUCED,
  # so both halves of the overlay go in: the one overlaid upstream file from esc/overlay/,
  # and the whole added module from esc/new/. Without them a "correctly applied overlay"
  # fixture is not one, and the happy-path cases fail for a reason that has nothing to do
  # with what they are testing — which is exactly what happened when Category 3 landed.
  cp "${REPO_DIR}/esc/overlay/${NAV_REL}" "${root}/${NAV_REL}"
  cp -R "${REPO_DIR}/esc/new/${TOUR_REL}" "${root}/$(dirname "${TOUR_REL}")/"

  printf '%s' "${root}"
}

run_verifier() { "${1}/scripts/verify-esc-features.sh" 2>&1; }

printf '\n== verify-esc-features.sh\n'

begin "a correctly applied overlay passes everything, exit 0"
setup_scratch
tree="$(make_applied_tree)"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "All ESC features verified" && pass
teardown_scratch

# The blocker-5 regression. patch-enterprise.cjs patches four methods; the overlay used
# to override one. The list is DERIVED from the cjs, so this must catch any of the four.
begin "an overlay missing one of the four enterprise overrides fails"
setup_scratch
tree="$(make_applied_tree)"
python3 - "${tree}/${PLAN_REL}" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
i = s.index('  async getSubscriptionStatus()')
j = s.index('ESC OVERLAY PATCH', i)
open(p, 'w').write(s[:j] + '(override removed)' + s[j + len('ESC OVERLAY PATCH'):])
PY
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "getSubscriptionStatus() is patched on the compiled image but NOT overridden" && pass
teardown_scratch

# Drift-proofing: the point of deriving the list is that adding a FIFTH method to the
# compiled patch fails the verifier until the overlay matches.
begin "a fifth method added to the compiled patch fails until the overlay matches"
setup_scratch
tree="$(make_applied_tree)"
python3 - "${tree}/esc/deploy/patch-enterprise.cjs" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
extra = "  [/(\\n\\s*)hasValidSignedEnterpriseKey\\(\\)\\s*\\{/, '$1hasValidSignedEnterpriseKey() { return true;'],\n"
s = s.replace("];\nlet applied = 0;", extra + "];\nlet applied = 0;", 1)
open(p, 'w').write(s)
PY
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "hasValidSignedEnterpriseKey() is patched" && pass
teardown_scratch

# The trap that made this check report a correctly overridden method as missing: a
# multi-line signature closes with `  } | null> {`, which a loose /^  }/ end anchor
# matches. getSubscriptionStatus is exactly that shape, so a pass here is the guard.
begin "a multi-line method signature is still read correctly"
setup_scratch
tree="$(make_applied_tree)"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "getSubscriptionStatus() is overridden in the source overlay too" && pass
teardown_scratch

# The other trap: `async getLicenseInfo(` does not contain `  getLicenseInfo(`.
begin "an async method is still read correctly"
setup_scratch
tree="$(make_applied_tree)"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "getLicenseInfo() is overridden in the source overlay too" && pass
teardown_scratch

begin "an unapplied isValid() fails the SSO gate check"
setup_scratch
tree="$(make_applied_tree)"
cp "${REPO_DIR}/${PLAN_REL}" "${tree}/${PLAN_REL}"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "SSO gate NOT bypassed" && pass
teardown_scratch

# A false FAIL here aborted an overlay apply once, because the check grepped the whole
# method body for a name that the patch's own explanatory comment mentions.
begin "a comment naming hasValidEnterpriseValidityToken does not cause a false FAIL"
setup_scratch
tree="$(make_applied_tree)"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "upstream token-based isValid() body removed" && pass
teardown_scratch

begin "a missing patch-enterprise.cjs fails rather than skipping the parity check"
setup_scratch
tree="$(make_applied_tree)"
rm "${tree}/esc/deploy/patch-enterprise.cjs"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "cannot derive the method list" && pass
teardown_scratch

printf '\n== the SSRF allowlist half\n'

begin "an unapplied is-private-ip util fails"
setup_scratch
tree="$(make_applied_tree)"
cp "${REPO_DIR}/${IP_REL}" "${tree}/${IP_REL}"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "allowlist is absent" && pass
teardown_scratch

# The allowlist must be exact-match. A CIDR or prefix test would re-open the estate, so
# its absence is part of the contract rather than a detail.
begin "an allowlist that is not exact-match fails"
setup_scratch
tree="$(make_applied_tree)"
sed -i.bak 's/\.includes(addr)/.some((h) => addr.startsWith(h))/' "${tree}/${IP_REL}"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "not an exact-match" && pass
teardown_scratch

printf '\n== the base-image digest pin\n'

begin "all three FROM lines pinned passes"
setup_scratch
tree="$(make_applied_tree)"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "node base images pinned" && pass
teardown_scratch

begin "upstream's moving tag fails and lists every unpinned line"
setup_scratch
tree="$(make_applied_tree)"
cp "${REPO_DIR}/${DOCKERFILE_REL}" "${tree}/${DOCKERFILE_REL}"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc \
  && assert_contains "${out}" "0 of 3 node base images are pinned" \
  && assert_contains "${out}" "AS common-deps" \
  && assert_contains "${out}" "AS twenty-app-dev" \
  && pass
teardown_scratch

# One unpinned line out of three is the realistic mistake: someone re-copies the
# upstream file after a sync and re-pins two of them.
begin "one unpinned line out of three fails and names it"
setup_scratch
tree="$(make_applied_tree)"
python3 - "${tree}/${DOCKERFILE_REL}" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
i = s.index('FROM node:24.15.0-alpine@sha256:')
j = s.index(' AS', i)
open(p, 'w').write(s[:i] + 'FROM node:24-alpine' + s[j:])
PY
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "2 of 3 node base images are pinned" && pass
teardown_scratch

# A version tag without a digest is still a moving target: tags can be re-pushed.
begin "an exact version with no digest is not a pin"
setup_scratch
tree="$(make_applied_tree)"
sed -i.bak 's/@sha256:[0-9a-f]*//' "${tree}/${DOCKERFILE_REL}"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "0 of 3" && pass
teardown_scratch

begin "a missing Dockerfile fails rather than passing silently"
setup_scratch
tree="$(make_applied_tree)"
rm "${tree}/${DOCKERFILE_REL}"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "Dockerfile not found" && pass
teardown_scratch

printf '\n== the guided tour (Category 3)\n'

# THE FAILURE THIS WHOLE SECTION EXISTS FOR. PATCH_MANIFEST's documented upstream-upgrade
# step is "copy the fresh upstream file into esc/overlay/ and re-apply the two hunks". Do
# the first half and forget the second and the Tour button is gone, while every other
# source-side gate stays green: the tour module still compiles and its unit tests still
# pass, because they render the launcher directly and never look at the sidebar.
begin "a fresh upstream sidebar section — the tour hunks lost — fails, and says there is no Tour button"
setup_scratch
tree="$(make_applied_tree)"
python3 - "${tree}/${NAV_REL}" <<'PY2'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = '\n'.join(l for l in s.split('\n') if '@/esc-tour/' not in l)
s = re.sub(r'\s*<EscTour[A-Za-z]*\s*/>', '', s)
open(p, 'w').write(s)
PY2
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "there is NO Tour button" && pass
teardown_scratch

# The shape a careless three-way merge takes: the import survives, the JSX does not. It
# compiles, it lints, and it ships a sidebar with no Tour in it.
begin "an import left behind with no JSX beside it fails"
setup_scratch
tree="$(make_applied_tree)"
python3 - "${tree}/${NAV_REL}" <<'PY2'
import re, sys
p = sys.argv[1]; s = open(p).read()
open(p, 'w').write(re.sub(r'\s*<EscTourNavigationDrawerItem\s*/>', '', s))
PY2
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "never rendered" && pass
teardown_scratch

# The overlay applied but esc/new/ not copied: the import points at nothing.
begin "the tour module missing from the applied tree fails"
setup_scratch
tree="$(make_applied_tree)"
rm -rf "${tree}/${TOUR_REL}"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "esc/new/ was not copied" && pass
teardown_scratch

# The launcher's label is the marker scripts/verify-esc-tour.sh greps a BUILT BUNDLE for.
# Renaming it there alone turns the deploy check into a false "the tour is missing", so it
# is caught here instead — at apply time, with the other file named.
begin "renaming the launcher label fails here rather than at deploy time"
setup_scratch
tree="$(make_applied_tree)"
sed -i.bak 's/label="Tour"/label="Guided tour"/' \
  "${tree}/${TOUR_REL}/components/EscTourNavigationDrawerItem.tsx"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "Change both, or neither" && pass
teardown_scratch

# The live anchor-drift check derives its route list from these declarations. A step that
# stops naming its object leaves that check with one fewer route and no way to know.
begin "steps that declare no objectNamePlural fail — the drift check would have nothing to check"
setup_scratch
tree="$(make_applied_tree)"
sed -i.bak "s/objectNamePlural: '[^']*'/objectNamePluralWasRemoved: 1/" \
  "${tree}/${TOUR_REL}/constants/escTourSteps.ts"
out="$(run_verifier "${tree}")"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "would have nothing to check" && pass
teardown_scratch

summary
