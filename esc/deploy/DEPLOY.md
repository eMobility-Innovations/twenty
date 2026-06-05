# SSO enterprise-bypass — DEPLOYED (2026-06-05, CT 175 twenty-esc)

Two patch routes exist in this overlay:
- **Option A (source overlay)** — `esc/overlay/.../enterprise-plan.service.ts` (isValid->true),
  applied by `esc/esc-apply.sh`, then a full image build. Upgrade-resilient, but heavy build.
- **Option B (compiled patch, DEPLOYED)** — `esc/deploy/Dockerfile.option-b`. Thin image
  `FROM twentycrm/twenty:v2.0.0` that patches the compiled `isValid()`. Fast, no monorepo build.

## What was deployed
- Built `twenty-esc-sso:v2.0.0` on CT 175 from `esc/deploy/Dockerfile.option-b`.
- `/root/twenty-esc/docker-compose.yml`: `server` + `worker` image swapped
  `twentycrm/twenty:v2.0.0` -> `twenty-esc-sso:v2.0.0` (compose backed up to `docker-compose.yml.bak.*`).
- `docker compose up -d server worker` — server Healthy (200), worker started, clean logs.
- Verified live: `isValid() { return true; }` in the running container; image = twenty-esc-sso:v2.0.0.

## Rollback
- Restore `/root/twenty-esc/docker-compose.yml.bak.<ts>` (back to `twentycrm/twenty:v2.0.0`) and
  `docker compose up -d server worker`. The official image is untouched.

## Remaining (Keycloak wiring — needs the Twenty admin UI)
1. Create a Twenty OIDC client in Keycloak `fiszu` realm (CT 171). Redirect URI: Twenty's OIDC
   callback (confirm path, e.g. `https://esc.crm.fiszu.com/auth/oidc/callback`).
2. In Twenty: Settings -> Security -> New SSO -> OIDC; enter Keycloak issuer + client id/secret.
3. Test login + JIT provisioning.
NOTE: `esc.crm.fiszu.com` is already behind Pangolin+Keycloak ForwardAuth (proxy-level). Decide
whether to relax that for the app once Twenty-native SSO is live, to avoid double login.
