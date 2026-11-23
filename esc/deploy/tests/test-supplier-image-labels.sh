#!/usr/bin/env bash

source "$(dirname "$0")/harness.sh"

setup_scratch
trap teardown_scratch EXIT
mkdir -p "${SCRATCH}/checkout/esc" "${SCRATCH}/copied-esc"
cp "${REPO_DIR}/esc/esc-supplier/upgrade.sh" "${SCRATCH}/upgrade.sh"
git -C "${SCRATCH}/checkout" init -q &&
  git -C "${SCRATCH}/checkout" -c user.name=Test -c user.email=test@example.com \
    -c core.hooksPath=/dev/null -c commit.gpgsign=false commit -q --allow-empty -m fixture || exit 1
revision=$(git -C "${SCRATCH}/checkout" rev-parse HEAD) || exit 1

# Stop as soon as the upgrade calls Docker so it never reaches deployment.
cat > "${SCRATCH}/bin/docker" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$@" > "${DOCKER_STUB_STATE}/build-args"
exit 42
STUB
chmod +x "${SCRATCH}/bin/docker"

check_build() {
  local context="$1" forwarded="$2" expected="$3" tag="$4" version="$5"
  local rc=0 args
  BUILD_DIR="$context" IMAGE_REVISION="$forwarded" bash "${SCRATCH}/upgrade.sh" "$tag" || rc=$?
  args="$(cat "${DOCKER_STUB_STATE}/build-args")"
  assert_exit 42 "$rc" &&
    assert_contains "$args" $'\nTAG='"$tag"$'\n' &&
    assert_contains "$args" $'\nIMAGE_VERSION='"$version"$'\n' &&
    assert_contains "$args" $'\nIMAGE_REVISION='"$expected"$'\n' && pass
}

begin 'supplier upgrade uses the build checkout commit and strips the tag prefix'
check_build "${SCRATCH}/checkout/esc" '' "$revision" v2.60.3 2.60.3

begin 'supplier upgrade accepts a forwarded full commit for a copied context'
check_build "${SCRATCH}/copied-esc" "$revision" "$revision" 2.60.3 2.60.3

begin 'supplier upgrade leaves the revision empty if unavailable'
check_build "${SCRATCH}/copied-esc" '' '' v2.60.3 2.60.3

begin 'supplier upgrade leaves the revision empty for an abbreviated commit'
check_build "${SCRATCH}/copied-esc" "${revision:0:8}" '' v2.60.3 2.60.3

begin 'supplier Dockerfile sets the fork labels and consumes both metadata arguments'
dockerfile="$(cat "${REPO_DIR}/esc/esc-supplier/Dockerfile")"
dockerfile="${dockerfile#*$'\nFROM '}"
assert_contains "$dockerfile" 'org.opencontainers.image.source="https://github.com/eMobility-Innovations/twenty"' &&
  assert_contains "$dockerfile" 'org.opencontainers.image.url="https://github.com/twentyhq/twenty"' &&
  assert_contains "$dockerfile" 'org.opencontainers.image.version="${IMAGE_VERSION}"' &&
  assert_contains "$dockerfile" 'org.opencontainers.image.revision="${IMAGE_REVISION}"' && pass

summary
