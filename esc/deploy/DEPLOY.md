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

---

## 2026-09-22 — the wizard's table, and the migration step the entrypoint will never run

Redmine [#19873](https://redmine.fiszu.com/issues/19873). Added after a preflight found that the
self-onboarding wizard would have shipped **dead on arrival** with no boot-time symptom.

**The fact this section exists for:** the image entrypoint runs `yarn database:init:prod` — the only
code path in the server that executes TypeORM migrations — **only when the `core` schema is
absent.** On CT175 it is not. Every other boot runs `yarn command:prod upgrade`, which builds its
sequence purely from `@RegisteredInstanceCommand` / `@RegisteredWorkspaceCommand` bundles and never
reaches TypeORM. Measured on production 2026-09-22: `core._typeorm_migrations` held 182 rows topping
out at `1775909335324`, and `to_regclass('core."escOnboarding"')` was `NULL`.

So the table now ships as a fast instance command as well as a legacy migration:
`2.0.0_AddEscOnboardingFastInstanceCommand_1790000100000`. `command:prod upgrade` runs it, the
entrypoint already calls that, and both copies emit the same DDL.

### Numbered step of any deploy that carries the wizard

1. Bring the new image up as usual — `docker compose up -d`, never `down`
   (`twenty-ingest-app-1` shares `twenty-esc_default`).
2. Wait for `/healthz` to return 200 through the public hostname.
3. **Assert the schema. A deploy is not done until this exits 0:**

   ```sh
   DOCKER='sudo docker' /root/twenty-esc/esc/deploy/assert-esc-schema.sh
   ```

   It asserts two things, because either alone can lie: that `core."escOnboarding"` exists, and
   that the instance command is recorded `completed` in `core."upgradeMigration"` with a NULL
   `workspaceId`. A table that exists without that row was created by something other than the
   upgrade path, and that is a finding, not a pass.

4. If it fails, do **not** call the deploy done. Run the upgrade explicitly and re-assert:

   ```sh
   sudo docker exec twenty-esc-server-1 yarn command:prod upgrade
   DOCKER='sudo docker' /root/twenty-esc/esc/deploy/assert-esc-schema.sh
   ```

**Never** `npx nx run twenty-server:database:migrate:prod` on a deployed box: `nx` is absent from
the production image, so it attempts a network fetch. The in-container form is
`yarn database:migrate:prod`.

### What is proven, and what is not

**Proven 2026-09-22, against a real Postgres 16** — `esc/deploy/prove-esc-ddl.ts`, which imports the
shipped classes rather than a retyped copy of their SQL:

```sh
docker run -d --rm --name esc-ddl-proof -e POSTGRES_PASSWORD=proof -p 55432:5432 postgres:16
cd packages/twenty-server && \
  PGURL=postgres://postgres:proof@127.0.0.1:55432 npx tsx ../../esc/deploy/prove-esc-ddl.ts
docker stop esc-ddl-proof
```

Both copies of the DDL execute on a database that already has a `core` schema, produce an identical
column and index set, tolerate being run after each other and twice over, and `down()` removes the
table and is safe to repeat. The script exits 1 when the two copies diverge — verified by changing
one column type and watching it fail, then restoring it. Before this, neither copy had ever run
against any database anywhere.

**NOT proven:** that `yarn command:prod upgrade`, inside the real image, reaches the command on a
database carrying CT175's `core."upgradeMigration"` rows. The unit suite asserts the command is in
the sequence and sorts after the cursor production is parked on, but the sequence being walked in
the running image is a different claim. That belongs to the boot smoke test against a restored
production dump — next step 4 of
[the preflight handover](../../docs/handovers/2026-09-22_cutover-incident-and-preflight.md) — and it
must be done before the cutover, not after.

---

## 2026-09-22b — the two gates that were missing, and what they were proven against

Redmine [#19873](https://redmine.fiszu.com/issues/19873), preflight blockers 6 and 7.

### Boot smoke test — `esc/deploy/boot-smoke-test.sh`

Nothing used to boot the image before it was deployed. `build-source-image.sh` inspects a
filesystem; `/healthz` is never asked. That is how a Nest DI fault shipped on 2026-09-21 behind
five green checks.

The smoke test starts throwaway Postgres and Redis, boots the image with **production's key set**
(`smoke.env.template`, placeholder values — what shapes the provider graph is which keys are SET),
asserts `/healthz`, then reproduces **CT175's actual state** — `core` schema present,
`escOnboarding` dropped, the command's `upgradeMigration` row deleted — and asserts
`command:prod upgrade` puts the table back and records itself `completed`. No production dump
needed. It refuses to run on a host where `twenty-esc-server-1` exists.

**Proven to FAIL on the pre-fix image**, on CT140, 2026-09-22:

```
$ ESC_SMOKE_BOOT_TIMEOUT=120 ./boot-smoke-test.sh twenty-esc-src:v2.0.0-esc1
ERROR [ExceptionHandler] UnknownDependenciesException [Error]: Nest can't resolve
dependencies of the c790a9fe90dd379d1eec5 (?). Please make sure that the argument
PermissionsService at index [0] is available in the EscOnboardingModule module.
SMOKE FAILED: the container exited before it served
SCRIPT_RC=1
```

That is the outage, caught by the gate that did not exist when it happened.

**NOT yet proven to PASS.** That needs a source image built from the trunk, which has not been
built. A gate seen only to fail is half a gate — do the positive control before trusting it.

### Behavioural enterprise check — `esc/deploy/verify-esc-enterprise-behaviour.sh`

The critic's point stands: option B regex-injects `return true;` onto the signature line of the
compiled file, option A's `nest build` pretty-prints, so **the two routes produce different
compiled text for identical semantics and no grep can verify both**. Two checks were wrong because
of it, in opposite directions, and both are now replaced by this one:

| Where | Was | Now |
|---|---|---|
| `scripts/verify-esc-image.sh:28` | grepped `isValid() { return true;` — **fails on a correct source image** | runs the probe in the running container |
| `esc/deploy/build-source-image.sh` | grepped the whole file for `return true` — a string upstream ships twice, so it **could not fail** | runs the probe against the built image |

`enterprise-behaviour-probe.cjs` executes the four methods inside the image with `--network none`,
so the answer owes nothing to a licensing server and an unpatched `getSubscriptionStatus()` cannot
reach one. It prints one canonical `ESC_ENTERPRISE_VERDICT:` line; matching the JSON is a trap,
because `isValid` appears both at the top level and inside `reportsEnterpriseValid`.

Both directions measured 2026-09-22:

```
production  twenty-esc-sso:v2.0.0-ssrf1  (on CT175, --rm --network none --memory 512m)
  ESC_ENTERPRISE_VERDICT: isValid=true hasValidEnterpriseValidityToken=true licenceIsValid=true subscriptionActive=true
  getLicenseInfo → licensee "ESC Self-Hosted", subscriptionId "self-hosted-esc", expires 2036-09-19

pre-fix     twenty-esc-src:v2.0.0-esc1   (on CT140)
  ESC_ENTERPRISE_VERDICT: isValid=true hasValidEnterpriseValidityToken=false licenceIsValid=false subscriptionActive=false
  exit 1
```

The second line is **blocker 5 measured on the real image** rather than inferred from a diff:
three of the four methods report invalid, which is the "enterprise key no longer valid" banner in
front of every user. It also confirms the licence constants now in the source overlay match what
production actually returns.

`build-source-image.sh` now runs the boot smoke test before it calls an image good. `SKIP_BOOT_SMOKE=1`
exists and says loudly, by name, that the image was not booted.

### Where the build host's checkout is — and a correction to a correction

`/root/twenty-esc-src` on CT140 **does exist** and is the build checkout.

An earlier revision of this section claimed it did not, and that was wrong. The probe behind the
claim was `pangolin ssh … -- 'cd /root/twenty-esc-src && …'`, run as the login user, who cannot
read `/root`: the `cd` failed, the `&&` short-circuited, and the fallback branch printed
"NO CHECKOUT". `ls -d /root/*twenty*` failed the same way a moment later, because the shell that
expands the glob is the login user's, not root's — an unexpanded literal path, not an empty
directory.

**Anything touching `/root` on a CT goes inside `sudo sh -c '…'`**, glob and all, or it reports the
absence of a thing that is there. Two separate conclusions in this file came from that one trap.
