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

### Where the build checkouts on CT140 are — and a correction to a correction

CT140 has **two** checkouts and both exist. Verified 2026-09-23 with `sudo`:

- `/root/twenty-esc-src` — the SOURCE-build checkout (option A, `build-source-image.sh`).
- `/root/twenty-tour-src` — the FRONT-only build checkout, used by the tour deploy below.

An earlier revision of this section claimed `/root/twenty-esc-src` did not exist, and that was
wrong. The probe behind the claim was `pangolin ssh … -- 'cd /root/twenty-esc-src && …'`, run as
the login user, who cannot read `/root`: the `cd` failed, the `&&` short-circuited, and the
fallback branch printed "NO CHECKOUT". `ls -d /root/*twenty*` failed the same way a moment later,
because the shell that expands the glob is the login user's, not root's — an unexpanded literal
path, not an empty directory.

**Anything touching `/root` on a CT goes inside `sudo sh -c '…'`**, glob and all, or it reports the
absence of a thing that is there. Two separate conclusions in this file came from that one trap.

---

## 2026-09-22c — the Tour button, and a front-only way to ship it

Redmine [#19873](https://redmine.fiszu.com/issues/19873). The stored-state onboarding wizard
was replaced, by operator decision on 2026-09-22, with a **Tour** entry in the CRM sidebar
that anybody can press at any time. No table, no per-person flags, no record of who has taken
it. See `scripts/PATCH_MANIFEST.md`, Category 3, for what the patch is and why.

### The delivery route, and why it is not a source build

The change is entirely in the frontend, so only the frontend is rebuilt:

```
esc/deploy/build-front-layer.sh <base-image> <new-tag>
esc/deploy/Dockerfile.front-layer     # FROM <ESC image>; COPY build -> dist/front
```

**The server binary is not recompiled.** It is inherited from the base image, which means:

- the Nest dependency-injection fault that took the CRM down for 16h41m on 2026-09-21 cannot
  be reintroduced by this image — the server in it is the one already running;
- the enterprise bypass and the SSRF allowlist, both compiled server patches, come along
  untouched rather than being re-applied and re-verified.

Two measured facts make it sound:

- `git diff v2.0.0..HEAD -- packages/twenty-front` is **empty**. The fork has never changed
  the frontend, so a rebuild from this tree is the bundle production already serves plus the
  tour.
- The server serves the front as plain static files (`ServeStaticModule`, rootPath
  `dist/front`). No asset manifest, no integrity check, no CSP pinning script hashes.

### Numbered step of the deploy

Run on the **build host**, never CT175 — the script refuses if `twenty-esc-server-1` is on
the host, because the frontend build alone asks for an 8 GB Node heap.

1. Read the API base URL off the running container rather than trusting a note:

   ```sh
   sudo docker inspect twenty-esc-server-1 \
     --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E 'REACT_APP_SERVER_BASE_URL|SERVER_URL'
   ```

   Measured 2026-09-22: `REACT_APP_SERVER_BASE_URL` is **empty**, and `SERVER_URL` is
   `https://esc.crm.fiszu.com`. The browser gets the API host at runtime from `window._env_`,
   which the image entrypoint writes from `SERVER_URL`; the value compiled into the bundle is
   only the fallback underneath it. So the rebuild bakes in the same **empty** value.
   Baking a URL in where production has none is a difference from production that nothing in
   the image would report.

2. Build the frontend on the **build host** (CT140), where there is heap to spare. The build
   checkout there is **`/root/twenty-tour-src`** — it exists, do not re-clone it; `git pull`
   it first so you are building the commit you think you are:

   ```sh
   cd /root/twenty-tour-src && git pull
   REACT_APP_SERVER_BASE_URL= ./esc/deploy/build-front-layer.sh --front-only
   tar -C packages/twenty-front -czf twenty-front-build.tar.gz build
   ```

   Then carry that tarball to **the host that holds the base image** and build the layer
   there. Today that host is CT175 and only CT175: `twenty-esc-sso:v2.0.0-ssrf1` exists in
   its local docker store, in no registry, and in no saved tarball. The layer build is one
   `COPY` — it needs no heap and is safe on a production box in a way the frontend build is
   not:

   ```sh
   FRONT_BUILD_DIR=/root/twenty-front-build/build DOCKER='sudo docker' \
     ./esc/deploy/build-front-layer.sh --layer-only \
       twenty-esc-sso:v2.0.0-ssrf1 twenty-esc-sso:v2.0.0-tour1
   ```

   That split is forced by the image having no home. When the fork's images reach a
   registry, both halves run on the build host and CT175 only pulls.

3. **Save the image off the build host before it goes anywhere.** The fork's images live in
   exactly one place today — a host's local docker store — and on 2026-09-22 two of them went
   missing from CT175 with no attribution, which made the documented one-step rollback inert
   and forced a full rebuild. Until there is a registry, a tarball is the rollback:

   ```sh
   sudo docker save twenty-esc-sso:v2.0.0-tour1 | gzip > twenty-esc-sso_v2.0.0-tour1.tar.gz
   ```

4. **Point the compose file at the new tag — this is the step that actually deploys it, and
   it is the one most often missed.** `docker compose up -d` on an unedited file re-creates
   the containers on the OLD image and looks completely successful. On CT175, in
   `/root/twenty-esc/docker-compose.yml`, the image tag appears **twice**:

   | Line | Service | What it must read after the edit |
   |------|---------|----------------------------------|
   | 4 | `server` | `image: twenty-esc-sso:v2.0.0-tour1` |
   | 42 | `worker` | `image: twenty-esc-sso:v2.0.0-tour1` |

   Line numbers measured 2026-09-22; treat them as where to look, not as gospel — confirm
   with the grep below, which must print exactly two lines and they must match.

   ```sh
   sudo cp /root/twenty-esc/docker-compose.yml \
           /root/twenty-esc/docker-compose.yml.bak.$(date +%F-%H%M)
   sudo sed -i 's|twenty-esc-sso:v2.0.0-ssrf1|twenty-esc-sso:v2.0.0-tour1|g' \
           /root/twenty-esc/docker-compose.yml
   grep -n 'image: twenty-esc-sso' /root/twenty-esc/docker-compose.yml
   ```

   **Both, not one.** The worker is a separate container from the same image. Leaving the
   worker on the old tag gives you two different builds in one stack — the frontend is
   served by `server`, so the tour would appear and everything would look right, while the
   worker runs code from a different image with nothing reporting the split.

5. Cut over with `docker compose up -d`, **never `down`** — `twenty-ingest-app-1` shares
   the `twenty-esc_default` network, and `down` removes that network and takes the ingest
   service out with it.

   ```sh
   cd /root/twenty-esc && sudo docker compose up -d
   sudo docker inspect twenty-esc-server-1 twenty-esc-worker-1 --format '{{.Config.Image}}'
   ```

   The `inspect` proves the running containers picked the new tag up. Two identical lines
   reading `twenty-esc-sso:v2.0.0-tour1`, or step 4 did not take.

6. Assert, in this order. A deploy is not done until all three exit 0:

   ```sh
   ./scripts/verify-esc-tour.sh --container twenty-esc-server-1
   CONTAINER=twenty-esc-server-1 ./scripts/verify-esc-image.sh
   curl -sf -o /dev/null -w '%{http_code}\n' https://esc.crm.fiszu.com/healthz
   ```

   The second one is not ceremony: a layer built over a bare `twentycrm/twenty:v2.0.0`
   instead of an ESC image produces a healthy container that has silently lost the enterprise
   bypass and the SSRF allowlist, and only that check says so.

7. **Open the CRM in a browser and click Tour.** Every check above proves the tour is
   *present*. None of them proves it *runs* — nothing that greps a bundle can. This step is
   the proof, and the deploy is not finished without it.

### Rollback

The image to go back to is **`twenty-esc-sso:v2.0.0-ssrf1`** — the one production ran before the
tour. It is saved on **CT175** at:

```
/root/rollback_twenty-esc-sso_v2.0.0-ssrf1.tar.gz     314 MB, gzip-verified
```

That tarball exists because on 2026-09-22 two of this fork's images went missing from CT175's
local docker store with no attribution, which made the documented one-step rollback inert and
forced a full rebuild. Until the fork's images live in a registry, the tarball IS the rollback.

Rolling back is the same two moves as steps 4 and 5, in reverse:

```sh
# only if the tag is no longer in the local store — check first
sudo docker image inspect twenty-esc-sso:v2.0.0-ssrf1 >/dev/null 2>&1 \
  || gunzip -c /root/rollback_twenty-esc-sso_v2.0.0-ssrf1.tar.gz | sudo docker load

sudo sed -i 's|twenty-esc-sso:v2.0.0-tour1|twenty-esc-sso:v2.0.0-ssrf1|g' \
        /root/twenty-esc/docker-compose.yml
grep -n 'image: twenty-esc-sso' /root/twenty-esc/docker-compose.yml   # two lines, 4 and 42

cd /root/twenty-esc && sudo docker compose up -d                      # never `down`
sudo docker inspect twenty-esc-server-1 twenty-esc-worker-1 --format '{{.Config.Image}}'
CONTAINER=twenty-esc-server-1 ./scripts/verify-esc-image.sh
```

Both lines 4 and 42, again — a rollback that moves only the server leaves the stack split the
same way a half-done deploy does. The last check proves the enterprise bypass and the SSRF
allowlist are back, which is the thing a rollback to the wrong image would quietly lose.

## 2026-10-07 — saved tour progress (RM #22314)

The tour now saves where each person is, so it follows them across devices and an admin can
see who has finished it. It is stored in a **Twenty custom object, `escTourProgress`** — data in
the workspace schema Twenty manages, NOT a table of ours. That is the whole reason it is
shippable: the 2026-09-22 decision (RM #19873 journal 36187) dropped `core."escOnboarding"`
because a fork migration never runs on an existing instance. A custom object needs no
migration and no server rebuild, so delivery is still the front-only layer above.

### One extra step, BEFORE the image swap

Create the object once, with a key that has data-model rights. Dry run first — it prints the
plan and writes nothing.

**Done on CT175 on 2026-10-08** with the key twenty-ingest already holds (`TWENTY_API_KEY` in
`/root/twenty-ingest/.env` — there is no separate admin key; `TWENTY_ADMIN_API_KEY` appears only
in an old runbook). It printed `provisioned and verified` and removed 1 sidebar entry. Re-running
is only needed on a NEW instance.

The script is NOT on CT175 — `/root/twenty-tour-src` is a CT140 checkout (an earlier revision of
this section pointed at it on CT175, where it does not exist). Pipe it from a checkout of trunk
on your own machine; the key is read on the box and goes in through the environment, never the
command line:

```sh
# from a local checkout of emobility-unity. Inside the server container (it has node),
# against its own port — not the SSO edge. Drop --apply for the plan-only dry run.
git show origin/emobility-unity:esc/deploy/provision-esc-tour-progress.cjs \
  | pangolin ssh esc-blades-ct175.ssh "sudo sh -c 'export TWENTY_API_KEY=\"\$(grep -m1 ^TWENTY_API_KEY= /root/twenty-ingest/.env | cut -d= -f2-)\";
      docker exec -i -e TWENTY_URL=http://localhost:3000 -e TWENTY_API_KEY twenty-esc-server-1 node - --apply'"
```

If the `.env` value is quoted, strip the quotes with `sed`, never `tr -d "\"\x27"` — inside
double quotes that also deletes the letters `x`, `2` and `7`, and the server answers a bare
`Internal Server Error` (a JSON parse error on the mangled token in its log). Measured 2026-10-08.

It must end with `ESC_TOUR_PROGRESS: provisioned and verified`. It is idempotent — a second
`--apply` writes nothing. It also **removes the sidebar entry Twenty adds for every new
object**, for everyone (`object-metadata.service.ts:515`); only workspace-level entries that
target this object's id are removed, never a personal one.

### Order does not matter for safety, only for usefulness

The frontend **fails soft**: if the object is not there, or a role cannot write it, saved
progress turns itself off for that page load with ONE console warning
(`[esc-tour] saved progress is off for this page load: …`) and the tour runs exactly as before,
resuming from the tab's own sessionStorage. So a swap before provisioning breaks nothing — it
just records nothing until the object exists.

### Proving it works

1. As yourself, click Tour, go a few steps, close the tab.
2. Open the CRM in another browser and click Tour — it resumes at that step.
3. Settings → Data model → Tour progress (or `/objects/escTourProgresses`): your row shows
   `inProgress`, `lastStepId`, `furthestStepIndex`. Finish the tour; it reads `completed` with a
   `completedAt`.

### Rollback

Swap the image back as above. The object can stay — nothing reads it but the tour. To remove
it entirely: Settings → Data model → Tour progress → deactivate, then delete.

## 2026-10-08 — team chapters and the customer page (RM #22317)

The tour now asks "Which team are you in?" (Sales or Customer service) and adds a chapter on
that team's day before "Getting around". The answer is remembered in the browser and on the
person's progress row (`team`). Chapter 4 (one customer page) is now actually walked: the
tour reads the first customer's id off the People list it is standing on. Copy and the facts
behind it: `esc-tour/constants/escTourTeamSteps.ts`.

### Before the image swap: re-run the provisioner

The tour's lookup asks for the new `team` field. Run the provisioner with `--apply` exactly as
in the section above — it is idempotent and, on an instance provisioned on 2026-10-08, creates
`team` and nothing else (`plan: … createFields=[team]`). Swapping first is not dangerous, but
the lookup fails on the missing field and saved progress switches itself off until it exists.

### Then the front-only swap

Same procedure as 2026-09-22c, from the trunk merge commit, with the base and tags of the
day: base `twenty-esc-sso:v2.0.0-tour2` (the running image; its tarball on CT175 is the
rollback), new tag `twenty-esc-sso:v2.0.0-tour4`. (`tour3` was started for #22314 alone and
abandoned so the CRM restarts once for both changes; no `tour3` image exists.)

`scripts/verify-esc-tour.sh` now also reads `escTourTeamSteps.ts`, so the lists the team
chapters walk into (opportunities, callbackCampaigns, interactions, repairs) are checked
against the live workspace too.

### Proving it

Click Tour, pick a team, walk to the end: the team chapter appears before "Getting around",
and chapter 4 opens a real customer. Reload, click Tour: your team is pre-selected. The
progress row (`/objects/escTourProgresses`) shows `team`.

### Done on CT175 on 2026-10-08

- Provisioner re-run first: `createFields=[team]`, read back.
- Front built on CT140 from `bd39b307` (the PR #38 merge), `EXIT=0`, team copy in the bundle;
  tarball sha256 `492c0260…5e2e98`, identical on CT140, this machine and CT175.
- CT175 has no git checkout of the fork (`/root/twenty-tour-src` there is NOT a repository).
  The layer step needs `esc/` and `scripts/` from the same commit, so they were shipped as
  `git archive bd39b307 esc scripts` into `/root/twenty-tour4-src` (`COMMIT` file records it).
- `--layer-only` on `tour2` → `tour4`: 4/4 image checks; rollback tarball
  `/root/twenty-esc-sso_v2.0.0-tour4.tar.gz` read back (45 entries, 340M).
- Compose backup `/root/twenty-esc/docker-compose.yml.bak-pre-tour4-20261008`; lines 4 and 42
  → `tour4`; `docker compose up -d`. Server `healthy`, worker `running`, 0 restarts each.
- `verify-esc-tour.sh --container` 4/4, `verify-esc-image.sh` 2/2 (enterprise valid on all four
  methods, SSRF allowlist active), `verify-esc-tour.sh --anchors-only` 8/8, public `/healthz` 200.
- NOT yet done: the browser click under "Proving it". Rollback if it fails: lines 4 and 42 back
  to `tour2` (or restore the compose backup), `docker compose up -d`.
