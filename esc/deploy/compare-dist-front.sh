#!/usr/bin/env bash
#
# Compares the built FRONTEND between two images, before a swap.
#
#   ./esc/deploy/compare-dist-front.sh <reference-image> <candidate-image>
#
# WHY: every other check in this directory is server-side, and `/healthz`
# (health.controller.ts) never renders a component. So the server can boot green,
# the compose healthcheck can pass, the boot smoke test can pass — and the CRM can
# still serve a broken bundle to every user. The preflight critic found that nobody
# had opened `dist/front` at all: production carries 22.9 MB across 921 files with a
# 2494-byte index.html, and no gate had ever looked at it.
#
# WHAT IT DOES NOT DO: assert the two frontends are identical. They are not, and
# should not be. Asset filenames carry content hashes, so any real change moves
# hundreds of paths; a diff demanding equality would fire on every correct build and
# be switched off within a week.
#
# It asserts the bundle has not COLLAPSED — that the candidate is recognisably a
# built frontend of the same shape as the reference — and prints the numbers so a
# human can see what moved. The thresholds are deliberately wide. A frontend that
# failed to build does not come out 20% smaller; it comes out empty, or without an
# index.html, or with a handful of files instead of nine hundred.
set -euo pipefail

REFERENCE="${1:-}"
CANDIDATE="${2:-}"
DOCKER="${DOCKER:-docker}"

# Beyond this, the bundle has not "changed", it has broken.
TOLERANCE_PERCENT="${ESC_FRONT_TOLERANCE_PERCENT:-25}"

# Below this, index.html is not a page. Production's is 2494 bytes.
MIN_INDEX_BYTES="${ESC_FRONT_MIN_INDEX_BYTES:-500}"

FRONT_PATH=/app/packages/twenty-server/dist/front
WORK=""

cleanup() {
  local rc=$?
  [ -n "${WORK}" ] && rm -rf "${WORK}"
  return $rc
}
trap cleanup EXIT INT TERM

die() { printf '\ncompare-dist-front: %s\n' "$1" >&2; exit 1; }

extract() { # image, destination
  local image="$1" dest="$2" cid
  cid="$($DOCKER create "${image}")" || die "cannot create a container from ${image}"

  mkdir -p "${dest}"
  # docker cp writes the directory itself into dest, so dest/front is the tree.
  if ! $DOCKER cp "${cid}:${FRONT_PATH}" "${dest}/" >/dev/null 2>&1; then
    $DOCKER rm -f "${cid}" >/dev/null 2>&1 || true
    die "${image} has no ${FRONT_PATH} — it is not a complete server image"
  fi

  $DOCKER rm -f "${cid}" >/dev/null 2>&1 || true
}

measure() { # tree -> "files bytes index_bytes"
  local tree="$1" files bytes index_bytes
  files="$(find "${tree}" -type f | wc -l | tr -d ' ')"
  bytes="$(find "${tree}" -type f -exec wc -c {} + | awk 'END{print $1}')"
  # BSD and GNU wc disagree on the total line when there is exactly one file.
  [ "${files}" = "1" ] && bytes="$(find "${tree}" -type f -exec wc -c {} + | awk '{print $1}' | head -1)"
  index_bytes=0
  [ -f "${tree}/index.html" ] && index_bytes="$(wc -c < "${tree}/index.html" | tr -d ' ')"

  printf '%s %s %s\n' "${files}" "${bytes}" "${index_bytes}"
}

within_tolerance() { # reference, candidate
  local ref="$1" cand="$2" low high
  [ "${ref}" -eq 0 ] && return 1
  low=$(( ref * (100 - TOLERANCE_PERCENT) / 100 ))
  high=$(( ref * (100 + TOLERANCE_PERCENT) / 100 ))
  [ "${cand}" -ge "${low}" ] && [ "${cand}" -le "${high}" ]
}

[ -n "${REFERENCE}" ] && [ -n "${CANDIDATE}" ] ||
  { echo "usage: $0 <reference-image> <candidate-image>" >&2; exit 2; }

WORK="$(mktemp -d)"

echo "==> extracting ${FRONT_PATH}"
extract "${REFERENCE}" "${WORK}/ref"
extract "${CANDIDATE}" "${WORK}/cand"

read -r REF_FILES REF_BYTES REF_INDEX <<EOF
$(measure "${WORK}/ref/front")
EOF
read -r CAND_FILES CAND_BYTES CAND_INDEX <<EOF
$(measure "${WORK}/cand/front")
EOF

printf '\n%-14s %10s %14s %12s\n' "" "files" "bytes" "index.html"
printf '%-14s %10s %14s %12s\n' "reference" "${REF_FILES}" "${REF_BYTES}" "${REF_INDEX}"
printf '%-14s %10s %14s %12s\n' "candidate" "${CAND_FILES}" "${CAND_BYTES}" "${CAND_INDEX}"
printf '\n  reference : %s\n  candidate : %s\n' "${REFERENCE}" "${CANDIDATE}"

# What moved, by top-level entry — enough to see a missing asset directory without
# drowning in hashed filenames.
echo
echo "==> top-level entries (file counts)"
for tree in ref cand; do
  printf '  %s:\n' "${tree}"
  ( cd "${WORK}/${tree}/front" && for entry in *; do
      if [ -d "${entry}" ]; then
        printf '    %-24s %s file(s)\n' "${entry}/" "$(find "${entry}" -type f | wc -l | tr -d ' ')"
      else
        printf '    %-24s %s bytes\n' "${entry}" "$(wc -c < "${entry}" | tr -d ' ')"
      fi
    done )
done

FAIL=0

echo
if [ "${CAND_INDEX}" -lt "${MIN_INDEX_BYTES}" ]; then
  echo "  FAIL index.html is ${CAND_INDEX} bytes (floor ${MIN_INDEX_BYTES}) — that is not a page"
  FAIL=1
else
  echo "  ok — index.html is ${CAND_INDEX} bytes"
fi

if within_tolerance "${REF_FILES}" "${CAND_FILES}"; then
  echo "  ok — ${CAND_FILES} files, within ${TOLERANCE_PERCENT}% of the reference's ${REF_FILES}"
else
  echo "  FAIL ${CAND_FILES} files against the reference's ${REF_FILES} — outside ${TOLERANCE_PERCENT}%, so the bundle did not merely change"
  FAIL=1
fi

if within_tolerance "${REF_BYTES}" "${CAND_BYTES}"; then
  echo "  ok — ${CAND_BYTES} bytes, within ${TOLERANCE_PERCENT}% of the reference's ${REF_BYTES}"
else
  echo "  FAIL ${CAND_BYTES} bytes against the reference's ${REF_BYTES} — outside ${TOLERANCE_PERCENT}%"
  FAIL=1
fi

echo
if [ "${FAIL}" -ne 0 ]; then
  echo "compare-dist-front: DO NOT SWAP. The candidate's frontend is not the same shape as the reference's." >&2
  exit 1
fi

echo "compare-dist-front: the candidate's frontend is the same shape as the reference's."
echo "  This is a collapse check, not proof the UI works. A human still has to open the"
echo "  new image on a spare port before the swap — no banner, SSO in, Settings > Security."
