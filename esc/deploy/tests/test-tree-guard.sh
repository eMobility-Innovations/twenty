#!/usr/bin/env bash
# Covers esc/deploy/lib/assert-tree-accounted-for.sh — the guard that decides whether a
# build is traceable to a commit. It used to refuse on ANY dirty path, which meant
# build-source-image.sh could not run twice in the same checkout: esc-apply.sh overlays
# files into the tree, and the second run saw its own writes.
#
# Runs against throwaway git repositories, so nothing here touches the real checkout.
set -uo pipefail
. "$(dirname "$0")/harness.sh"

SCRIPT="${DEPLOY_DIR}/lib/assert-tree-accounted-for.sh"

# A miniature repo with an overlay owning one upstream file.
make_repo() {
  local root="${SCRATCH}/repo"
  mkdir -p "${root}/esc/overlay/packages/app" "${root}/packages/app" "${root}/docs"

  printf 'upstream\n'          > "${root}/packages/app/service.ts"
  printf 'patched by the esc overlay\n' > "${root}/esc/overlay/packages/app/service.ts"
  printf 'readme\n'            > "${root}/docs/README.md"

  git -C "${root}" init -q
  git -C "${root}" config user.email test@example.com
  git -C "${root}" config user.name Test
  git -C "${root}" add -A
  git -C "${root}" commit -q -m init

  printf '%s' "${root}"
}

apply_overlay() { # repo
  cp "$1/esc/overlay/packages/app/service.ts" "$1/packages/app/service.ts"
}

printf '\n== assert-tree-accounted-for.sh\n'

begin "a clean tree passes, exit 0"
setup_scratch
repo="$(make_repo)"
out="$("${SCRIPT}" "${repo}" 2>&1)"; rc=$?
assert_exit 0 $rc && pass
teardown_scratch

# The regression this guard exists for: a second build in the same checkout.
begin "a tree carrying only the overlay's own writes passes"
setup_scratch
repo="$(make_repo)"; apply_overlay "${repo}"
out="$("${SCRIPT}" "${repo}" 2>&1)"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "expected" && pass
teardown_scratch

begin "and it says which paths it accounted for, rather than staying silent"
setup_scratch
repo="$(make_repo)"; apply_overlay "${repo}"
out="$("${SCRIPT}" "${repo}" 2>&1)"; rc=$?
assert_exit 0 $rc && assert_contains "${out}" "packages/app/service.ts" && pass
teardown_scratch

# The intent the narrowing must not lose: an untraceable image is still refused.
begin "an unrelated modified file is refused, exit 1"
setup_scratch
repo="$(make_repo)"
printf 'local hack\n' >> "${repo}/docs/README.md"
out="$("${SCRIPT}" "${repo}" 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "docs/README.md" && pass
teardown_scratch

begin "an unrelated file is refused even alongside the overlay's own writes"
setup_scratch
repo="$(make_repo)"; apply_overlay "${repo}"
printf 'local hack\n' >> "${repo}/docs/README.md"
out="$("${SCRIPT}" "${repo}" 2>&1)"; rc=$?
assert_exit 1 $rc \
  && assert_contains "${out}" "docs/README.md" \
  && assert_not_contains "${out}" "       packages/app/service.ts" \
  && pass
teardown_scratch

# An untracked file is just as untraceable as a modified one.
begin "an untracked file is refused"
setup_scratch
repo="$(make_repo)"
printf 'scratch\n' > "${repo}/packages/app/scratch.ts"
out="$("${SCRIPT}" "${repo}" 2>&1)"; rc=$?
assert_exit 1 $rc && assert_contains "${out}" "scratch.ts" && pass
teardown_scratch

begin "a staged change is refused"
setup_scratch
repo="$(make_repo)"
printf 'staged\n' >> "${repo}/docs/README.md"
git -C "${repo}" add docs/README.md
out="$("${SCRIPT}" "${repo}" 2>&1)"; rc=$?
assert_exit 1 $rc && pass
teardown_scratch

# Derived, not listed: a new overlay file needs no edit to the guard.
begin "a fourth overlay file is accounted for without editing the guard"
setup_scratch
repo="$(make_repo)"
mkdir -p "${repo}/esc/overlay/packages/other"
printf 'patched\n' > "${repo}/esc/overlay/packages/other/thing.ts"
mkdir -p "${repo}/packages/other"
printf 'upstream\n' > "${repo}/packages/other/thing.ts"
git -C "${repo}" add -A && git -C "${repo}" commit -q -m overlay-grows
cp "${repo}/esc/overlay/packages/other/thing.ts" "${repo}/packages/other/thing.ts"
out="$("${SCRIPT}" "${repo}" 2>&1)"; rc=$?
assert_exit 0 $rc && pass
teardown_scratch

begin "a repo with no overlay directory is an error, not a pass"
setup_scratch
repo="$(make_repo)"
rm -rf "${repo}/esc/overlay"
out="$("${SCRIPT}" "${repo}" 2>&1)"; rc=$?
assert_exit 2 $rc && assert_contains "${out}" "no overlay" && pass
teardown_scratch

summary
