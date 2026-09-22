#!/usr/bin/env bash
#
# Build the ESC Twenty image from SOURCE (option A).
#
# WHY THIS EXISTS, AND WHY IT REPLACES OPTION B
# Option B (esc/deploy/Dockerfile.option-b) builds a thin image on top of the official
# release and rewrites the COMPILED files. It is fast, and it cannot carry a single line
# of new application code — a new NestJS module has to be compiled and registered, and
# there is nothing sane to patch it into. The self-onboarding wizard (Redmine #19873) is
# the first thing this fork adds that option B cannot ship, so CT175 moves to a source
# build. Option B stays in the tree as the rollback.
#
# WHERE TO RUN IT: NOT on CT175. Measured 2026-09-21, CT175 has 8 GB of RAM, 8 cores and
# 21 GB free while running production Postgres, Redis and two CRM stacks; the frontend
# build alone asks for an 8 GB Node heap. Build on a box with room — CT140 has 16 GB and
# 1.2 TB free — and move the image over.
#
#   ./esc/deploy/build-source-image.sh --tag twenty-esc-src:v2.0.0-esc1
#
# Options:
#   --tag <image:tag>   Required. What to call the result.
#   --app-version <v>   Baked into the image as APP_VERSION. Default: the v* tag at HEAD,
#                       else the short SHA.
#   --server-base-url   REACT_APP_SERVER_BASE_URL. Default empty, which is what the
#                       official image ships and what CT175 runs today — the frontend
#                       then derives the API URL from window.location.
#   --skip-apply        Do not run esc/esc-apply.sh (the tree is already overlaid).
#   --memory <size>     Hard cap on the build container's memory, e.g. 9g. Default 9g.
#                       THIS IS A GUARD ON THE HOST, NOT A TUNING KNOB. The frontend
#                       step asks Node for an 8 GB heap, and every candidate build host
#                       we have also runs something people depend on — CT140 runs
#                       GitLab, which is the whole org's CI. Without a cap, a build that
#                       wants more than the box has takes the host's OOM killer with it
#                       and the thing that dies is whatever else was resident. With a
#                       cap the BUILD fails instead, which is the outcome you want.
#                       Pass 0 to disable, and mean it.

set -euo pipefail

cd "$(dirname "$0")/../.."
REPO_ROOT="$(pwd)"

IMAGE_TAG=""
APP_VERSION=""
SERVER_BASE_URL=""
RUN_APPLY=true
MEMORY_CAP="9g"

while [ $# -gt 0 ]; do
  case "$1" in
    --tag)             IMAGE_TAG="$2"; shift 2 ;;
    --app-version)     APP_VERSION="$2"; shift 2 ;;
    --server-base-url) SERVER_BASE_URL="$2"; shift 2 ;;
    --skip-apply)      RUN_APPLY=false; shift ;;
    --memory)          MEMORY_CAP="$2"; shift 2 ;;
    --help|-h)         sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$IMAGE_TAG" ]; then
  echo "build-source-image: --tag is required" >&2
  exit 1
fi

if [ -z "$APP_VERSION" ]; then
  APP_VERSION="$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD)"
fi

echo "==> Building ${IMAGE_TAG}"
echo "    repo        : ${REPO_ROOT}"
echo "    commit      : $(git rev-parse HEAD)"
echo "    branch      : $(git rev-parse --abbrev-ref HEAD)"
echo "    APP_VERSION : ${APP_VERSION}"

# A dirty tree means the image cannot be reproduced from any commit, which is the whole
# problem this script exists to end. Refuse rather than build something untraceable.
# The overlay's own writes are expected, so this runs BEFORE esc-apply.sh.
if [ -n "$(git status --porcelain)" ]; then
  echo "build-source-image: the working tree is dirty. An image built from it cannot be" >&2
  echo "build-source-image:   traced to a commit, which is the exact failure this script" >&2
  echo "build-source-image:   exists to end. Commit or stash first." >&2
  git status --short >&2
  exit 1
fi

if [ "$RUN_APPLY" = true ]; then
  echo "==> Applying the ESC overlay"
  ./esc/esc-apply.sh
fi

echo "==> docker build (target: twenty)"
# BuildKit is not required by this Dockerfile and CT140 has no buildx plugin, so the
# legacy builder is selected explicitly rather than left to a deprecation warning.
MEMORY_ARGS=()
if [ "${MEMORY_CAP}" != "0" ]; then
  MEMORY_ARGS=(--memory "${MEMORY_CAP}" --memory-swap "${MEMORY_CAP}")
  echo "    memory cap  : ${MEMORY_CAP} (the build dies before the host does)"
fi

DOCKER_BUILDKIT=0 docker build \
  "${MEMORY_ARGS[@]}" \
  --target twenty \
  -f packages/twenty-docker/twenty/Dockerfile \
  --build-arg "APP_VERSION=${APP_VERSION}" \
  --build-arg "REACT_APP_SERVER_BASE_URL=${SERVER_BASE_URL}" \
  -t "${IMAGE_TAG}" \
  .

echo "==> Checking the built image carries every ESC feature"
# The image is the only thing that matters here. A source tree that passes and an image
# that does not is precisely the silent failure both patches are prone to.
CID="$(docker create "${IMAGE_TAG}")"
trap 'docker rm -f "${CID}" >/dev/null 2>&1 || true' EXIT

DIST=/app/packages/twenty-server/dist
FAIL=0

check_in_image() { # description, path, needle
  # The file is read WHOLE into a variable before it is searched, and that is not
  # style. `docker cp … | tar -xO | grep -q` looks obvious and is wrong under
  # `set -o pipefail`: grep -q exits the moment it matches, tar gets SIGPIPE, and
  # pipefail hands the pipeline that non-zero status. The check then reports FAIL on
  # an image that HAS the feature — and it only does so when the needle appears EARLY
  # in a LARGE file, so it looks like a real finding rather than a bug. Measured
  # 2026-09-21: this reported "FAIL enterprise gate bypassed" on an image whose
  # compiled enterprise-plan.service.js contains `return true;` three times.
  #
  # A false NEGATIVE on a deploy check is the expensive direction. Read it all.
  local extracted
  extracted="$(docker cp "${CID}:$2" - 2>/dev/null | tar -xO 2>/dev/null || true)"

  if [ -z "${extracted}" ]; then
    echo "  FAIL $1 (file not present in the image: $2)"
    FAIL=$((FAIL + 1))
    return
  fi

  if printf '%s' "${extracted}" | grep -q "$3"; then
    echo "  PASS $1"
  else
    echo "  FAIL $1"
    FAIL=$((FAIL + 1))
  fi
}

# 🔧 REPLACED 2026-09-22. This used to be:
#
#   check_in_image "enterprise gate bypassed" …/enterprise-plan.service.js "return true"
#
# and it COULD NOT FAIL. `return true` appears in that compiled file twice in upstream
# code alone, so the check passed on any image — including one with no enterprise patch
# at all. It was the build's most important check and it asserted nothing. (The day
# before, the same function had the opposite bug: a pipefail/SIGPIPE false NEGATIVE,
# fixed in PR #21. The check has now been wrong in both directions.)
#
# There is no grep that can replace it, and that is not a limitation of this script.
# Option B regex-injects `return true;` onto the signature line of the compiled file;
# option A builds from source and `nest build` pretty-prints. The two routes produce
# DIFFERENT COMPILED TEXT FOR IDENTICAL SEMANTICS. Any anchor tight enough to prove
# option B fails on a correct option A image, and any anchor loose enough to accept
# both accepts an unpatched image too.
#
# So the image is asked what it returns. The probe runs the four enterprise methods
# inside the image with --network none, so the answer owes nothing to a licensing
# server and an unpatched getSubscriptionStatus() cannot reach one.
ENTERPRISE_PROBE="${REPO_ROOT}/esc/deploy/enterprise-behaviour-probe.cjs"
ALL_VALID='ESC_ENTERPRISE_VERDICT: isValid=true hasValidEnterpriseValidityToken=true licenceIsValid=true subscriptionActive=true'

if [ ! -f "${ENTERPRISE_PROBE}" ]; then
  echo "  FAIL enterprise behaviour probe missing at ${ENTERPRISE_PROBE}"
  FAIL=$((FAIL + 1))
else
  ENTERPRISE_REPORT="$(docker run --rm -i --network none --memory 512m \
    --entrypoint node "${IMAGE_TAG}" - < "${ENTERPRISE_PROBE}" 2>/dev/null || true)"
  ENTERPRISE_VERDICT="$(printf '%s\n' "${ENTERPRISE_REPORT}" | grep '^ESC_ENTERPRISE_VERDICT:' || true)"

  if [ "${ENTERPRISE_VERDICT}" = "${ALL_VALID}" ]; then
    echo "  PASS enterprise reports valid on all four methods (executed, not grepped)"
  else
    echo "  FAIL enterprise does NOT report valid on all four methods"
    [ -n "${ENTERPRISE_REPORT}" ] && printf '%s\n' "${ENTERPRISE_REPORT}" | sed 's/^/       /'
    FAIL=$((FAIL + 1))
  fi
fi

check_in_image "SSRF allowlist present" \
  "${DIST}/engine/core-modules/secure-http-client/utils/is-private-ip.util.js" \
  "ESC_SSRF_ALLOWED_HOSTS"

check_in_image "onboarding wizard module compiled in" \
  "${DIST}/engine/core-modules/esc-onboarding/esc-onboarding.module.js" \
  "EscOnboardingModule"

if [ "${FAIL}" -gt 0 ]; then
  echo "build-source-image: the image is MISSING ${FAIL} ESC feature(s). Do not deploy it." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# AND NOW BOOT IT. Everything above this line inspects a filesystem; none of it
# starts a server. That is exactly how a Nest DI fault shipped on 2026-09-21 with
# five green checks behind it and took the CRM down for 16h41m.
# ---------------------------------------------------------------------------
BOOT_SMOKE="${REPO_ROOT}/esc/deploy/boot-smoke-test.sh"

if [ "${SKIP_BOOT_SMOKE:-0}" = "1" ]; then
  echo
  echo "build-source-image: SKIPPED the boot smoke test (SKIP_BOOT_SMOKE=1)." >&2
  echo "build-source-image:   THIS IMAGE HAS NOT BEEN BOOTED. It is not deployable on" >&2
  echo "build-source-image:   the strength of this run. A skip nobody can see is how a" >&2
  echo "build-source-image:   gate becomes a green-looking absence of one." >&2
elif [ ! -x "${BOOT_SMOKE}" ]; then
  echo "build-source-image: boot-smoke-test.sh missing or not executable at ${BOOT_SMOKE}" >&2
  exit 1
else
  echo
  echo "==> Booting ${IMAGE_TAG} before calling it good"
  "${BOOT_SMOKE}" "${IMAGE_TAG}" || {
    echo "build-source-image: the image does not boot. Do not deploy it." >&2
    exit 1
  }
fi

echo
echo "==> Built and checked: ${IMAGE_TAG}"
echo "    Move it to the target host and load it:"
echo "      docker save ${IMAGE_TAG} | gzip | ssh <host> 'gunzip | docker load'"
echo "    Then point /root/twenty-esc/docker-compose.yml at it, keeping the previous"
echo "    image tag on the box so a rollback is one edit and a restart."
