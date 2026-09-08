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

## ✅ WORKING — SSO via Keycloak confirmed end-to-end (2026-06-07)

Keycloak SSO login into Twenty works (no redirect loop). All moving parts:

| Component | Where | Note |
|---|---|---|
| Enterprise bypass | image `twenty-esc-sso:v2.0.0` (CT 175) | 4-method patch (see patch-enterprise.cjs). Re-apply on every Twenty upgrade. |
| Keycloak OIDC client | realm `fiszu` (CT 171), clientId `twenty-esc` | confidential, redirect `https://esc.crm.fiszu.com/auth/oidc/callback`. Persists. |
| Twenty SSO provider | `core."workspaceSSOIdentityProvider"` (twenty-esc DB) | Active, OIDC, issuer `https://auth.fiszu.com/realms/fiszu`, clientID `twenty-esc`, secret matches Keycloak. Persists (pre-existed). |
| Admin role | `core."roleTarget"` → amir@escooterclinic.co.uk = Admin | needed so the workspace owner sees Workspace settings. Persists. |
| Proxy | `/auth/*` already bypasses Pangolin ForwardAuth | no change needed — callback worked first try. |

### Upgrade procedure (Twenty → new version)
1. Bump `FROM twentycrm/twenty:<new>` in `esc/deploy/Dockerfile.option-b`, rebuild `twenty-esc-sso:<new>` on CT 175 (the patch re-applies; if the `enterprise-plan.service.js` shape changed, `patch-enterprise.cjs` prints which pattern missed — fix the regex).
2. Swap the image tag in `/root/twenty-esc/docker-compose.yml`, `docker compose up -d --force-recreate server worker`.
3. The Keycloak client, SSO provider, and admin role all persist — no need to redo them.

### Rollback
Restore `/root/twenty-esc/docker-compose.yml.bak.*` (→ official `twentycrm/twenty:v2.0.0`) + `docker compose up -d server worker`. (SSO will break — that's the enterprise gate returning — but the instance runs.)

### Note: the "Security" settings nav still doesn't render for admins
SSO works without it (provider lives in the DB). If you later need the in-UI SSO manager, that nav has an extra frontend gate not covered by the backend patch — a follow-up, not a blocker.


---

## 2026-09-09 — SSRF allowlist, and the image now running

Image on CT 175 is **`twenty-esc-sso:v2.0.0-ssrf1`**, built from `esc/deploy/Dockerfile.option-b`,
which now applies TWO compiled patches: the enterprise bypass and
`patch-ssrf-allowlist.cjs`.

**Why the second patch exists.** Twenty's workflow `HTTP_REQUEST` action refuses any host that
resolves to a private address ("Request to internal IP address 192.168.103.175 is not allowed"),
fails closed, and re-checks after DNS. Upstream has no allowlist. C4 (Redmine #14830) needs exactly
one internal endpoint callable from a workflow — `twenty-ingest` on CT 175, which rebuilds ONE
customer's interest profile. The alternative was publishing that endpoint on the public internet,
a larger exposure than naming one host. Authorised by Amir, 2026-09-08.

**What it does.** One short-circuit at the top of `isPrivateIp` — the single predicate BOTH the
hostname check and the post-DNS socket check use. An address named in `ESC_SSRF_ALLOWED_HOSTS` is
treated as public. Unset or empty, the guard is EXACTLY upstream's. Exact match on the address,
never a range: a CIDR would quietly re-open the estate to anyone who can author a workflow.

**Where the value is set.** `/root/twenty-esc/docker-compose.yml`, under `environment:` on BOTH
`server` and `worker` — `ESC_SSRF_ALLOWED_HOSTS: 192.168.103.175`. The worker is the one that
actually executes workflow steps; setting it on the server alone would look right and do nothing.

**Rollback.** `/root/twenty-esc/docker-compose.yml.bak.2026-09-09` restores the previous image and
drops the variable; `docker compose up -d server worker`. The official image is untouched.

**Verify what is RUNNING** (an option-B patch lives only in the image, so an upgrade that rebuilds
from a new upstream tag without the patch scripts produces a healthy container that has silently
lost them):

```bash
CONTAINER=twenty-esc-server-1 ./scripts/verify-esc-image.sh
```

### The workflow that uses it (C4 "Refresh interest profile")

Manual trigger, `availability: SINGLE_RECORD` on `person`; one `HTTP_REQUEST` step:

```
POST http://192.168.103.175:3100/interests/refresh/{{trigger.id}}
header x-refresh-key: <INTERESTS_REFRESH_KEY from /root/twenty-ingest/.env>
```

**`{{trigger.id}}`, NOT `{{trigger.record.id}}`.** The launched record is stored directly as the
trigger step's result, with its fields at the top level and no `record` wrapper
(`workflow-run.workspace-service.ts`, `stepInfos.trigger.result`). The wrapped form silently
resolves to the string `undefined` and the call still goes out — it fails at the far end, not here.

Proven end to end 2026-09-08 23:08 UTC: clicked on a real customer record, profile rewritten,
confirmed in the database rather than from the UI.

**The step cannot be created or edited through the API.** `createWorkflowVersionStep` answers an API
key with `Forbidden resource` and the REST route refuses too ("Updating workflowVersion steps
directly is forbidden"). Both need a signed-in user, so this workflow is maintained in the builder.
