#!/usr/bin/env bash
#
# Refuses if the working tree carries changes the ESC overlay does not account for.
#
#   esc/deploy/lib/assert-tree-accounted-for.sh <repo-root>
#
# WHY IT IS ITS OWN FILE: it used to be six lines inline in build-source-image.sh,
# where the only way to test it was to run a 40-minute docker build. Extracted so it
# can be exercised directly — esc/deploy/tests/ does, both ways.
#
# WHAT IT IS FOR: a dirty tree means the image cannot be reproduced from any commit,
# which is the whole problem build-source-image.sh exists to end. But the intent was
# never "no modified files" — esc-apply.sh overlays files INTO the tree, so after one
# build the checkout is dirty by design. The first version refused on any dirty path
# and therefore could not run twice in the same checkout; that bites the next person,
# because a build host's tree is dirty the moment a build finishes.
#
# So: the overlay's own targets are expected, DERIVED from esc/overlay/ rather than
# listed, and everything else still refuses.
set -euo pipefail

REPO_ROOT="${1:-$(pwd)}"
OVERLAY_DIR="${REPO_ROOT}/esc/overlay"

if [ ! -d "${OVERLAY_DIR}" ]; then
  echo "assert-tree-accounted-for: no overlay at ${OVERLAY_DIR}" >&2
  exit 2
fi

# Upstream-relative paths the overlay owns. A fourth overlay file needs no edit here.
EXPECTED="$(cd "${OVERLAY_DIR}" && find . -type f | sed 's|^\./||' | sort)"

# `awk '{print $NF}'` takes the path from a porcelain line. Renames print
# "R  old -> new" and $NF is the new path, which is the one that matters here.
DIRTY="$(cd "${REPO_ROOT}" && git status --porcelain | awk '{print $NF}' | sort)"

UNEXPECTED="$(comm -23 <(printf '%s\n' "${DIRTY}") <(printf '%s\n' "${EXPECTED}") | grep -v '^$' || true)"

if [ -n "${UNEXPECTED}" ]; then
  echo "assert-tree-accounted-for: the working tree carries changes the overlay does not" >&2
  echo "assert-tree-accounted-for:   account for. An image built from it cannot be traced to" >&2
  echo "assert-tree-accounted-for:   a commit. Commit or stash these first:" >&2
  printf '%s\n' "${UNEXPECTED}" | sed 's/^/       /' >&2
  exit 1
fi

if [ -n "${DIRTY}" ]; then
  echo "    overlay-applied paths already in the tree (expected):"
  printf '%s\n' "${DIRTY}" | sed 's/^/      /'
fi
