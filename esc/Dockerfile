# esc/Dockerfile
#
# ESC custom Twenty image: official upstream image + the enterprise-bypass patch
# applied to the compiled server. Tagged twenty-esc-sso:<version>.
#
# Build args let esc-upgrade.sh rebuild against a newer upstream in one command:
#   docker build --build-arg TWENTY_VERSION=v2.1.0 -t twenty-esc-sso:v2.1.0 esc/
#
# The build FAILS if patch-enterprise.cjs cannot apply all 4 patches (upstream
# drift tripwire) — see esc/patch-enterprise.cjs and esc/PATCH_MANIFEST.md.

ARG TWENTY_VERSION=v2.0.0
FROM twentycrm/twenty:${TWENTY_VERSION}
USER root
COPY patch-enterprise.cjs /tmp/patch-enterprise.cjs
RUN node /tmp/patch-enterprise.cjs && rm /tmp/patch-enterprise.cjs
