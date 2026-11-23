# twenty-esc-supplier image: upstream Twenty + the enterprise-gate bypass esc.crm runs
# (esc/deploy/patch-enterprise.cjs) plus patch-fresh-token.cjs for the guard method newer
# Twenty uses on /auth/oidc/*. Without both, Keycloak OIDC SSO is refused on self-hosted.
# No SSRF patch: upstream's OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS (docker-compose.yml) covers it.
# Each patch exits non-zero if its anchor is missing, failing the BUILD.
# Build from the repository root, with tag set to the upstream image tag:
#   docker build --build-arg TAG="$tag" --build-arg IMAGE_VERSION="${tag#v}" \
#     --build-arg IMAGE_REVISION="$(git rev-parse --verify HEAD 2>/dev/null || true)" \
#     -f esc/esc-supplier/Dockerfile -t "twenty-esc-supplier-sso:$tag" esc/
# (upgrade.sh does this for you.)
ARG TAG=v2.60.3
FROM twentycrm/twenty:${TAG}
ARG IMAGE_VERSION
ARG IMAGE_REVISION
LABEL org.opencontainers.image.source="https://github.com/eMobility-Innovations/twenty" \
      org.opencontainers.image.url="https://github.com/twentyhq/twenty" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${IMAGE_REVISION}"
USER root
COPY deploy/patch-enterprise.cjs esc-supplier/patch-fresh-token.cjs /tmp/
RUN node /tmp/patch-enterprise.cjs && node /tmp/patch-fresh-token.cjs && rm /tmp/patch-*.cjs
USER 1000
