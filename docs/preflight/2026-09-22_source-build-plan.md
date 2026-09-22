# Source-build preflight — the pre-cutover plan

> Produced by the preflight's synthesis stage from the 20 surviving findings.
> **Read [the critic](./2026-09-22_source-build-critic.md) before following it.** The critic
> found real errors in this plan — notably that its own grep anchors return 0 on a correct
> source image, and that nobody checked the frontend at all.

# PRE-CUTOVER PLAN — twenty-esc source image on CT175

**Scope**: retry of the 2026-09-21 cutover from `twenty-esc-sso:v2.0.0-ssrf1` (option B, compiled patches) to a source-built image (option A, `twenty-esc-src:*`).
**Author's access**: this session was read-only. Every mutating step below is written **for the operator to run** — none of them were run here. Where a step needs a permission this session does not hold, it says so.
**Everything below was re-verified in this session**; where the brief handed me was wrong, §0 says so before anything depends on it.

---

## 0. Three corrections to the brief, made before anything is planned on top of them

**0.1 — The outage was 16h41m, not "about an hour".** Measured on CT175 (BST):

| Time | Event (source) |
|---|---|
| 21 Sep 17:08:58 | compose backed up to `docker-compose.yml.bak.precutover_20260921_160858` (sudo log) |
| 21 Sep 17:23:51 | `curl … http://192.168.103.140:8899/twenty-esc-src.tgz \| gunzip \| docker load` (sudo log) |
| 21 Sep **17:26:27** | `sed -i s/…ssrf1/…esc1/ docker-compose.yml` then `docker compose up -d` (sudo log). Server container `5793e346a0f7…` first appears at this instant. |
| — | **no operator command of any kind on the box for the next 16½ hours** |
| 22 Sep 09:58:44 | `docker logs --tail 40 twenty-esc-server-1` |
| 22 Sep **10:07:29** | last trace of `5793e346a0f7…`; healthy containers created 10:07:21 / 10:07:29 |

`sudo journalctl --since "2026-09-21 17:26" --until "2026-09-22 10:10" | grep "cleaning up dead shim" | grep -c 5793e346a0f7` → **3128**. Total dead-shim cleanups in the same window: 3151. So **99.3% of all container churn on that box for 16h41m was this one container restarting**, roughly every 19 s under `restart: always`.
(The "6,302" in the brief is the count of `shim disconnected` lines, a different event and not attributed to a container. The attributable number is 3,128.)

**0.2 — Nothing alerted, and that is by design, not by accident.** The only automated observer of the CRM is the hourly `check-order-freshness.mjs` on CT175. Its own header, line 31: `Exit codes: 0 = fresh, 1 = probe failed, 2 = stale (alert raised).` Its entrypoint, lines 348–351:

```js
main().catch((err) => {
  console.error(`[order-freshness] PROBE FAILED: ${err.message}`);
  process.exit(1);
});
```

A **probe failure posts nothing** — only *staleness* alerts. 17 consecutive hourly probes logged `PROBE FAILED: Twenty GET /rest/orders -> 502 Bad Gateway` into `/root/twenty-ingest/logs/freshness.log` and woke nobody. This is why an outage that would have been noticed in minutes ran overnight. It is a separate defect from anything in the findings list and it must be fixed in the same change as the cutover (§1.7).

**0.3 — Two claims in the findings are wrong and must not be carried forward.**
- *"`getSubscriptionStatus()` starts making live outbound calls to Twenty's licensing API"* — **false**. `enterprise-plan.service.ts` at v2.0.0, lines 307–321: it calls `refreshKeyPayload()` and then `if (!enterpriseKey || !isDefined(this.cachedKeyPayload)) return null;` **before** the `fetch(statusUrl…)` at line 328. `ENTERPRISE_KEY=self-hosted-esc` is not a JWT, so `cachedKeyPayload` is always null and the method returns `null` without any network call. Likewise `getLicenseInfo()` calls `loadValidityToken()`, which is an `appTokenRepository.findOne()` — a **database** read, not an HTTP request. **The source image introduces no new third-party dependency.** The banner regression (§1.2) is real; the outbound-call claim is not.
- *"a pruner deleted the rollback image today"* — **not established**. There is no docker prune in cron, in `/etc/cron.*`, in any systemd timer, or anywhere under `/root /opt /usr/local`. The only `docker system prune -a` on the box is in `/root/.bash_history`, whose mtime is **2026-05-27** — four months before. `sudo journalctl` retains back to 2026-08-01 and contains **no** sudo-logged `docker rmi` / `prune` in that whole period. What *is* proven is stated in §1.6; **why** the image vanished is an open question (§5.Q4), and the plan is built so the answer does not matter.

---

## 1. Must fix before any retry

Ordered. Every item is a defect I confirmed in this session, with the file and the evidence.

### 1.1 — `PermissionsModule` import (already written, not yet committed) — COMMIT AND PUSH IT

**File**: `packages/twenty-server/src/engine/core-modules/esc-onboarding/esc-onboarding.module.ts`, line 12 (import) and line 23 (imports array). It is the only modification in the working tree (`git status --porcelain` → one `M` line).

I verified the fix is *complete* for this module, not just plausible:
- `PermissionsModule` **does export** `PermissionsService` (`permissions.module.ts:31`). An import that did not export it would have been a second silent failure.
- `SettingsPermissionGuard` is the **only** guard/pipe/filter on either resolver with a constructor dependency. I read all six: `WorkspaceAuthGuard`, `UserAuthGuard`, `NoPermissionGuard`, `ResolverValidationPipe`, `PreventNestToAutoLogGraphqlErrorsFilter` have **no** constructor; `SettingsPermissionGuard` injects `PermissionsService` only.
- Both services' dependencies resolve from this module's imports: `EscOnboardingService` needs the `EscOnboardingEntity` repo (`forFeature` ✓), `EscOnboardingIdentityService` (a provider ✓), `FeatureFlagService` (`FeatureFlagModule` ✓); `EscOnboardingIdentityService` needs the `ConnectedAccountEntity` repo (`forFeature` ✓).
- Both entities are on the default datasource: `core.datasource.ts:45–54` globs `dist/engine/core-modules/**` **and** `dist/engine/metadata-modules/**`, and `typeorm.module.ts:9` registers it with `forRoot` (unnamed), so `forFeature` without a connection name is correct.

**What this does not prove**: that the *whole graph* still compiles. `PermissionsModule` pulls in `WorkspaceCacheModule`, `UserRoleModule`, `RoleTargetModule`, `FeatureFlagModule` — a new edge from `core-modules` into `metadata-modules/permissions`. `core-engine.module.ts` does not import `PermissionsModule` itself (only `EscOnboardingModule`, line 168). I found no cycle by reading, but **no cycle is ever proven by reading**; §2.3 is what proves it.

**Blast radius, verified**: the fault surface is all three processes, not just the API.
`src/command/command.module.ts:12` imports `AppModule`; `src/app.module.ts:61` imports `CoreEngineModule`; `src/queue-worker/queue-worker.module.ts:12` imports `CoreEngineModule` directly. And `entrypoint.sh:19` runs `yarn command:prod cache:flush` **before** line 44's `exec "$@"` (`node dist/main`), so a DI fault kills the container inside the entrypoint, before the app ever listens. *(The failing container was removed at 10:07 and its logs no longer exist, so the exact failing stage is an inference from the entrypoint's order, not a log I read.)*

### 1.2 — The overlay patches 1 of the 4 enterprise methods the production image patches → every user gets an "enterprise key no longer valid" banner

**File**: `esc/overlay/packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts`

Proven by direct diff, not by reading one side:

```
git show v2.0.0:packages/.../enterprise-plan.service.ts > /tmp/e_up.ts
diff -u /tmp/e_up.ts esc/overlay/packages/.../enterprise-plan.service.ts
```
→ **exactly one hunk**, at `isValid()` (upstream line 149–151), replacing `return this.hasValidEnterpriseValidityToken();` with `return true;`. Nothing else is touched.

The running production image patches four (`docker exec twenty-esc-server-1 grep -n … enterprise-plan.service.js`):
```
146:    hasValidEnterpriseValidityToken() { return true;
156:    isValid() { return true;
166:    async getLicenseInfo() { return { isValid: true, licensee: 'ESC Self-Hosted', … };
269:    async getSubscriptionStatus() { return { status: 'active', licensee: 'ESC Self-Hosted', … };
```
`esc/deploy/patch-enterprise.cjs:12–17` applies those four and `:20` exits 1 unless all four land. Its own header, lines 4–6: *"A single isValid() patch is NOT enough."*

**The user-visible chain, verified end to end**:
- `workspace.resolver.ts:314,319,324` exposes `hasValidEnterpriseKey`, `hasValidSignedEnterpriseKey`, `hasValidEnterpriseValidityToken` straight off the service.
- At v2.0.0: `hasValidEnterpriseKey()` = `hasValidSignedEnterpriseKey() || checkLegacyKey()`; `checkLegacyKey()` returns `isDefined(ENTERPRISE_KEY)` → **true** (compose sets `ENTERPRISE_KEY: self-hosted-esc`). `hasValidSignedEnterpriseKey()` = `isDefined(cachedKeyPayload)` → **false** (not a JWT). `hasValidEnterpriseValidityToken()` → **false** (unpatched in the source build).
- `InformationBannerInvalidEnterpriseKey.tsx:24–27` renders when exactly `hasValidEnterpriseKey === true && hasValidSignedEnterpriseKey !== true && hasValidEnterpriseValidityToken !== true`. It is mounted unconditionally at `InformationBannerWrapper.tsx:68`.

**Result on cutover**: SSO keeps working (`enterprise-features-enabled.guard.ts` reads `isValid()` only), and **every signed-in user sees a permanent "Your enterprise key is no longer valid" banner.** It will read as a licence expiry, not as a bad deploy.

**Fix**: add to the overlay an override of `hasValidEnterpriseValidityToken()` returning `true` — that alone clears the banner — plus `getLicenseInfo()` and `getSubscriptionStatus()` returning the same `ESC Self-Hosted` payloads `patch-enterprise.cjs` produces, so the two routes are provably equivalent (option B is the stated rollback; the routes must not diverge).

### 1.3 — `nextStep` is optional but validated as required

**File**: `packages/twenty-server/src/engine/core-modules/esc-onboarding/dtos/advance-esc-onboarding-step.input.ts:15–18`

```ts
@Field(() => String, { nullable: true })
@IsString()
@MaxLength(128)
nextStep?: string;
```

No `@IsOptional()`. `resolver-validation.pipe.ts` calls `validate(object)` with **no options**, so `skipMissingProperties`/`skipUndefinedProperties` are both false and an absent `nextStep` falls through to `isString`. The resolver applies the pipe at `esc-onboarding.resolver.ts:19`. The service is written to expect the field absent (`esc-onboarding.service.ts:105` uses `nextStep ?? null`).

**Effect**: `advanceEscOnboardingStep(input: { completedStep: "<last-step>" })` — the last step of any wizard script — is rejected with `nextStep must be a string`. Only intermediate steps work. The unit suite cannot see it: both specs call the service directly, bypassing the pipe.

**Fix**: add `@IsOptional()` above `@IsString()`, and add a test that pushes an input with `nextStep` omitted **through `ResolverValidationPipe`**.

### 1.4 — `build-source-image.sh` cannot be run a second time in the checkout it dirtied

**File**: `esc/deploy/build-source-image.sh:79–85` (guard) vs `esc/esc-apply.sh:104` (`cp "${src_file}" "${dest_file}"` over tracked upstream files, with no cleanup anywhere).

Measured on the build host **now**:
```
$ cd /root/twenty-esc-src && git status --porcelain
 M packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts
 M packages/twenty-server/src/engine/core-modules/secure-http-client/utils/is-private-ip.util.ts
```
Both are byte-identical to their `esc/overlay/` copies (`cmp -s` → `ENTERPRISE_IDENTICAL_TO_OVERLAY`, `SSRF_IDENTICAL_TO_OVERLAY`). `--skip-apply` does not help: the guard at line 79 runs before the `RUN_APPLY` branch at line 87.

**The next rebuild — the one carrying the fix for yesterday's outage — exits 1 and blames the operator for the script's own writes.**

**Fix (both halves)**: (a) restore the overlay targets in a shell `trap` on exit, or exclude paths that exist under `esc/overlay/` from the guard and say so in the message; (b) §3 step 2 gives the operator the exact one-line cleanup for the tree as it stands today.

### 1.5 — `build-source-image.sh`'s own checks cannot fail

**File**: `esc/deploy/build-source-image.sh:119–157`.

`check_in_image` reads the whole file and runs an **unanchored** `grep -q`. The enterprise needle is the bare string `return true`, which upstream already ships:
```
$ git show v2.0.0:packages/.../enterprise-plan.service.ts | grep -n "return true"
256:      return true;
297:      return true;
```
— inside `refreshValidityToken()` and `reportSeats()`, preserved verbatim through the TypeScript build. So the check prints `PASS enterprise gate bypassed` on a plain `twentycrm/twenty:v2.0.0` with no ESC patch at all. Measured consequence, `/root/twenty-esc-build3.log` on CT140, for the image that is missing three of four patches:
```
  PASS enterprise gate bypassed
  PASS SSRF allowlist present
  PASS onboarding wizard module compiled in
```
The third one passed on the image whose `EscOnboardingModule` could not resolve `PermissionsService`.

The repo already contains the sound form: `scripts/verify-esc-image.sh:27–28` greps the anchored `'isValid() { return true;'`. The build script does not use it.

**Fix**: anchor to the method and assert **all four** — `isValid() { return true;`, `hasValidEnterpriseValidityToken() { return true;`, `getLicenseInfo() { return {`, `getSubscriptionStatus() { return {` — and fail if fewer than four match. **Mutation-test it in both directions**: run the check against `twentycrm/twenty:v2.0.0` (present on both hosts) and require it to **FAIL**. A check nobody has seen go red is not a check.

### 1.6 — The rollback must exist somewhere a deletion cannot reach

What is proven:
- `/root/twenty-esc/docker-compose.yml` pins `image: twenty-esc-sso:v2.0.0-ssrf1` on both `server` (line 4) and `worker` (line 42). There is **no `pull_policy`** and **no `build:` stanza**. That tag exists in no registry.
- The transfer tarball was deleted on the build host at `Sep 21 16:26:11 UTC` — i.e. **17:26:11 BST, sixteen seconds before the cutover command ran**. It was served from a `python3 -m http.server 8899` that was killed 37 s earlier.
- The rollback at 09:58:57 (`cp docker-compose.yml.bak.precutover… docker-compose.yml && docker compose up -d`) **did not restore service**: container `5793e346a0f7…` kept restarting under the *same* id through 10:07:29, i.e. compose never recreated it.
- Recovery required `rm -rf /root/twenty-esc-rollback && git clone` (10:00:55) and a from-scratch rebuild (10:05:14). `/tmp/rb.log` line 5: `v2.0.0: Pulling from twentycrm/twenty` — **the upstream base image had to be fetched from Docker Hub**, so it was not on the box either.
- Today's production image is therefore a **different build**: `twenty-esc-sso:v2.0.0-ssrf1` = `sha256:341c371ebac5…`, created `2026-09-22T10:07:04+01:00`. It was never byte-compared to what it replaced. There are no dangling images, so the pre-21-Sep image is gone.

**Fix, before touching anything (§3 step 1)**: a `docker save` tarball of the running image, held **off CT175** (CT140 has 1.1 TB free, 32 GB used), plus the image id recorded. Registry is the durable answer (§5.Q1) but must not gate this cutover.

### 1.7 — The CRM has no detector that pages

Per §0.2. The failure happened, it recurred overnight undetected, and a `restart: always` on a container that fails at Nest bootstrap is an infinite loop, not a recovery policy.

**Fix, shipped in the same change as the cutover, not as a follow-up**:
- Make `check-order-freshness.mjs` **alert on exit-1** (probe failure), not only on staleness — it already holds the webhook, the channel and the backoff; the `main().catch` at line 348 just needs to route through the same `alert()` path before exiting.
- Add a **restart-ceiling detector**: page when `twenty-esc-server-1` or `twenty-esc-worker-1` restarts more than N times in an hour. Note the asymmetry that made this worse: the `worker` service has **`restart: always` and no `healthcheck`** (compose, lines 42–63), so a worker-only DI fault is invisible to compose *and* to any HTTP probe. The server's healthcheck (`curl --fail http://localhost:3000/healthz`) does not cover it.
- Hold the condition open and watch the detector fire before calling it done.

### 1.8 — Pin the base image

`packages/twenty-docker/twenty/Dockerfile:5` and `:77` are both `FROM node:24-alpine` — a moving tag with no digest. Measured on CT175:

| Image | `NODE_VERSION` |
|---|---|
| `twenty-esc-sso:v2.0.0-ssrf1` (production, inherits upstream) | **24.15.0** |
| `twenty-esc-src:v2.0.0-esc1` (source build, 21 Sep) | **24.21.0** |
| `twentycrm/twenty:v2.0.0` (upstream) | 24.15.0 |

Six patch releases separate the runtime production is proven on from the one the new image carries, and nobody chose it — Docker Hub did, on the build day. A rebuild lands on a third. The script refuses a dirty tree *because an image built from it cannot be traced to a commit*, then leaves the base untraceable.

**Fix**: carry the Dockerfile as a **new entry in `esc/overlay/`** (never edit the upstream path on the trunk), pinning both stages to the version production is already proven on:
```
FROM node:24-alpine@sha256:d1b3b4da11eefd5941e7f0b9cf17783fc99d9c6fc34884a665f40a06dbdfc94f AS common-deps
```
(That is the manifest-list digest for `node:24.15.0-alpine`, resolved from Docker Hub's tag API in this session; `last_pushed 2026-04-16`.) Record the digest in `esc/deploy/DEPLOY.md` and bump it as a deliberate, separately-tested change.
**Order matters**: this adds a third overlay file, so §1.4 must be fixed first or the build guard trips again.

### 1.9 — `esc/deploy/DEPLOY.md` has no migration step, and the only place the step is written names a command the image cannot run

`grep -niE "migrat|database:|escOnboarding" esc/deploy/DEPLOY.md` → **zero matches**. Its headings are: *What was deployed / Rollback / Remaining / WORKING SSO / Upgrade procedure / Rollback / 2026-09-09 SSRF allowlist*. The only written instruction anywhere is `docs/esc-onboarding-wizard.md:84`: `npx nx run twenty-server:database:migrate:prod`. `nx` is not in the production image's `node_modules/.bin` — inside the container that command is a network fetch on a production box.

**Fix**: §3 step 5's exact in-container command becomes a numbered step in `DEPLOY.md`, followed by the assertion in §2.5. Correct `docs/esc-onboarding-wizard.md:84` to the same command.

### 1.10 — Decide the migration mechanism (see §5.Q2) and write it down

This is the defect five of the twenty findings describe. It is real, and I confirmed every link:

- `entrypoint.sh:13–17`: `has_schema=$(psql -tAc "SELECT EXISTS (… schema_name = 'core')")`; `if [ "$has_schema" = "f" ]; then yarn database:init:prod; fi`. Then `:19–21` unconditionally `cache:flush`, `upgrade`, `cache:flush`.
- The **only** TypeORM migration run-site in the server: `grep -rn "runMigrations(" src` → `database/clickHouse/migrations/run-migrations.ts:79,136` (unrelated) and `database/commands/run-instance-commands.command.ts:157`. Reachable only from `database:migrate:prod` = `node dist/command/command run-instance-commands` (`package.json:13`).
- `upgrade.command.ts:115` builds its work from `UpgradeSequenceReaderService.getUpgradeSequence()`, which (`upgrade-sequence-reader.service.ts:37–58`) walks only `@RegisteredInstanceCommand` / `@RegisteredWorkspaceCommand` registry bundles. `UpgradeSequenceRunnerService` contains no `runMigrations`.
- `core.datasource.ts:55–56`: `synchronize: false, migrationsRun: false`.
- **Measured on production**: `SELECT count(*) FROM core._typeorm_migrations` → **182**, newest `AddIsInitialToUpgradeMigration1775909335324`. Repo ships **183** migration files, the extra being `1790000100000-add-esc-onboarding.ts`, which sorts last. `SELECT count(*) FROM information_schema.tables WHERE table_schema='core' AND table_name='escOnboarding'` → **0**. *(Do not use `name ILIKE '%esc%'` to check this — it matches `ChangeAgentDescriptionToText1764672601466` and reads as a false positive.)*

**Severity correction the brief does not make**: `grep -rn "escOnboarding\|EscOnboarding" packages/twenty-front/src` returns **nothing**. No front-end code calls any of these operations. So the missing table breaks **nothing that exists today** — it is a blocker on *the reason for the cutover*, not on the cutover's safety. Say it that way, or the plan optimises the wrong risk.

I verified both candidate mechanisms, so §5.Q2 is a real choice and not a guess:
- **Explicit migrate step** (recommended for this retry): `run-instance-commands` also re-walks the instance commands, but `instance-command-runner.service.ts:39–49` skips any whose last attempt is `completed`. On production all **16** instance-scope rows in `core."upgradeMigration"` are `completed`, so the only work it does is the one pending TypeORM migration. Its `checkWorkspaceVersionSafety` (lines 108–152) compares against the **last** workspace command of `TWENTY_PREVIOUS_VERSIONS`' final entry `1.23.0`; bundles are sorted by timestamp (`upgrade-command-registry.service.ts:148–156`), so that is `UpdateGlobalObjectContextCommandMenuItemsCommand_1780000005000` — which the single ACTIVE workspace has `completed`. **The check passes; `--force` is not needed and must not be used.**
- **Instance command** (upstream-correct, recommended as the follow-up): `TWENTY_CURRENT_VERSION = '2.0.0'` and `TWENTY_CROSS_UPGRADE_SUPPORTED_VERSIONS` = previous + current, so a `@RegisteredInstanceCommand('2.0.0', <ts>)` **would** be picked up and run by the `upgrade` the entrypoint already executes. `2-0-upgrade-version-command.module.ts` exists with empty `providers: []`, ready for it, and it must also be listed in `instance-commands.constant.ts` (whose header says it is generated by `generate:instance-command`).

---

## 2. Must prove before any retry

Nothing here is "the tests passed". Each is a command, on a named host, with a stated green.

### 2.1 — The repo gate, with dependencies present

`verify.sh:79` wraps both code-touching checks in `if [ -d node_modules ]`, and the gate runner's payload never carries `node_modules`, so on the runner this gate proves only *"no GitHub workflows"* and *"overlay paths still exist"* (lines 84–87 print the skip by name, to stderr).

**Run it where it can answer**, on a clone with `yarn install` done:
```bash
./verify.sh
```
Green = `esc-onboarding: typecheck and the wizard suite passed.` — **not** the `SKIPPED` line.

### 2.2 — The build gate must be seen to go red

After the §1.5 fix, on CT140:
```bash
cd /root/twenty-esc-src
# must FAIL — the unpatched upstream image:
./esc/deploy/<the-check-extracted-as-a-script> twentycrm/twenty:v2.0.0 ; echo "exit=$?"
```
Green = **non-zero**. If it exits 0 against the unpatched image, the check is still a no-op and §1.5 is not done.
*(`twentycrm/twenty:v2.0.0` is present on CT175; CT140 will need it pulled — a network fetch on the build host, not on production.)*

### 2.3 — A real boot of the built image — this is the one that was missing

Nothing in the repo boots a Nest container. `build-source-image.sh:113` only `docker create`s the image and `docker cp`s three files out; it never starts it. Both wizard specs use `Test.createTestingModule({ providers: [...] })` with hand-listed mocks, so a missing `imports:` entry is invisible to them **by construction**. The 372 specs under `test/integration/` *do* boot the real graph (`create-app.ts:51–56` imports `AppModule`, `await app.init()` at line 108, and `setup-test.ts` runs it as jest `globalSetup`) — but they need `node_modules`, Postgres, Redis and a reset test DB, none of which the gate runner has. **Do not try to put `test:integration` on the runner**; put the equivalent where the dependencies already are: on the build host, against the built image.

**CT140 has no compose plugin** (`docker compose version` → `docker: unknown command: docker compose`), so this is plain `docker run`. It has 16 GB RAM / 11 GB free and 1.1 TB disk.

```bash
# --- smoke A: EMPTY database. Proves boot + that the migration actually executes. ---
docker network create esc-smoke
docker run -d --name esc-smoke-db --network esc-smoke \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=default postgres:16
docker run -d --name esc-smoke-redis --network esc-smoke redis:7-alpine
until docker exec esc-smoke-db pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done
docker exec esc-smoke-redis redis-cli ping

docker run -d --name esc-smoke-server --network esc-smoke \
  -e NODE_PORT=3000 \
  -e PG_DATABASE_URL=postgres://postgres:smoke@esc-smoke-db:5432/default \
  -e REDIS_URL=redis://esc-smoke-redis:6379 \
  -e SERVER_URL=http://localhost:3000 \
  -e APP_SECRET=smoke-not-a-secret \
  -e STORAGE_TYPE=local \
  -e ENTERPRISE_KEY=self-hosted-esc \
  -e IS_BILLING_ENABLED=false \
  twenty-esc-src:v2.0.0-esc2

# poll up to ~10 min; the empty-DB path runs all 183 migrations first
for i in $(seq 1 120); do
  docker exec esc-smoke-server curl -fsS http://localhost:3000/healthz && break
  sleep 5
done
```
**Green**: `/healthz` answers. **If it does not**, `docker logs esc-smoke-server` carries the Nest message naming the unresolvable provider — that is exactly where yesterday's `UnknownDependenciesException` would have appeared.

Why an empty DB: `entrypoint.sh:13–17` sees no `core` schema, runs `yarn database:init:prod`, and one test then covers three things — the full migration set including `1790000100000` executes **for the first time anywhere**, then `:19–21` run `cache:flush`, which boots `CommandModule → AppModule` (where yesterday's error was thrown), then `node dist/main` serves `/healthz`. `/healthz` is real and anonymous (`health.controller.ts:7 @Controller('healthz')`), and `curl` is in the runtime stage (`Dockerfile:79`).

```bash
# assert the migration actually landed
docker exec esc-smoke-db psql -U postgres -d default -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='core' AND table_name='escOnboarding'"
```
**Green**: `1`.

```bash
# --- smoke B: the WORKER, a separate Nest bootstrap the server test does not cover ---
docker run --rm --name esc-smoke-worker --network esc-smoke \
  -e PG_DATABASE_URL=postgres://postgres:smoke@esc-smoke-db:5432/default \
  -e REDIS_URL=redis://esc-smoke-redis:6379 \
  -e SERVER_URL=http://localhost:3000 -e APP_SECRET=smoke-not-a-secret \
  -e STORAGE_TYPE=local -e ENTERPRISE_KEY=self-hosted-esc -e IS_BILLING_ENABLED=false \
  -e DISABLE_DB_MIGRATIONS=true -e DISABLE_CRON_JOBS_REGISTRATION=true \
  twenty-esc-src:v2.0.0-esc2 yarn worker:prod
```
**Green**: it stays up past Nest bootstrap without an `UnknownDependenciesException`. (`worker:prod` = `node dist/queue-worker/queue-worker`, `package.json:11`; `queue-worker.module.ts:12` imports `CoreEngineModule` directly.) Ctrl-C when it is clearly past init.

### 2.4 — A boot against a **copy of production's database** — the path CT175 actually takes

Smoke A exercises `database:init:prod` on an empty DB. **CT175 does not take that path** — its `core` schema exists, so the entrypoint runs only `upgrade`. Prove the real path:

```bash
# ON CT175 — a read plus one file write; the DB is 159 MB and the box has 21 GB free / 4 GB RAM.
docker exec twenty-esc-db-1 pg_dump -U postgres -d default -Fc -f /tmp/esc-preflight.dump
docker cp twenty-esc-db-1:/tmp/esc-preflight.dump /root/esc-preflight.dump
# move it to CT140, restore into a scratch Postgres there, then repeat smoke A against it
```
**Green**: the server reaches `/healthz`, **and** `SELECT count(*) FROM core._typeorm_migrations` on the restored copy goes 182 → 183 with `AddEscOnboarding1790000100000` present.

> **This is the only step in §2 that touches CT175 at all, and it is a read plus a temp file.** This session cannot run it (read-only). Keep `pg_dump` off the live box's memory budget in mind — 159 MB is trivial, but CT175 has 4 GB available and also hosts `twenty-rc` and `twenty-ingest`.

### 2.5 — Post-deploy assertion, written into `DEPLOY.md`

```bash
docker exec twenty-esc-db-1 psql -U postgres -d default -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='core' AND table_name='escOnboarding'"
```
**Green**: `1`. Anything else and the deploy is not done, whatever `/healthz` says.

### 2.6 — Enterprise parity, proven on the compiled artefact, not the source

```bash
docker exec twenty-esc-server-1 grep -cE \
  "isValid\(\) \{ return true;|hasValidEnterpriseValidityToken\(\) \{ return true;|getLicenseInfo\(\) \{ return \{|getSubscriptionStatus\(\) \{ return \{" \
  /app/packages/twenty-server/dist/engine/core-modules/enterprise/services/enterprise-plan.service.js
```
**Green**: `4`. Run it against the new image **before** the cutover and against the running container **after**. `scripts/verify-esc-image.sh` already does the anchored form for `isValid` — extend it to all four rather than writing a second script.

### 2.7 — A human looks at the app

`/healthz` never touches a React component or an authenticated resolver. After the swap, one signed-in person confirms: **no** invalid-enterprise-key banner, SSO login works, Settings → Security is reachable. That is the only check that covers §1.2.

---

## 3. The cutover itself

Ordered. Every step is for the operator; none was run here.

**Preconditions, all of them:** §1.1–§1.5 and §1.8–§1.9 merged to `origin/emobility-unity`; §2.1, §2.2, §2.3, §2.4 green; §1.6's tarball taken; §1.7's detector live **and seen to fire**.

---

**Step 1 — Make the rollback exist, off the box.** *Before anything else.*
```bash
# CT175
docker image inspect twenty-esc-sso:v2.0.0-ssrf1 --format '{{.Id}}'   # record: sha256:341c371ebac5…
docker save twenty-esc-sso:v2.0.0-ssrf1 | gzip -1 > /root/twenty-esc-ROLLBACK-$(date +%Y%m%d).tgz
ls -la /root/twenty-esc-ROLLBACK-*.tgz        # ~400 MB of the 21 GB free
```
Then **copy it to CT140** (1.1 TB free) and verify the copy's checksum there. **Do not delete either copy until the new image has run a full working day.** The whole failure of 22 Sep 09:58 was that this file did not exist — and it did not exist because the previous cutover deleted its only tarball 16 seconds before it started.
```bash
cp /root/twenty-esc/docker-compose.yml /root/twenty-esc/docker-compose.yml.bak.cutover2_$(date +%Y%m%d_%H%M%S)
```

**Step 2 — Clean the build tree.** (§1.4's fix is in the script by now, but the tree on CT140 is dirty *today*.)
```bash
# CT140
cd /root/twenty-esc-src
git checkout -- \
  packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts \
  packages/twenty-server/src/engine/core-modules/secure-http-client/utils/is-private-ip.util.ts
git fetch origin && git reset --hard origin/emobility-unity
git status --porcelain          # MUST be empty
git rev-parse HEAD              # record this; it is what the image is traceable to
```

**Step 3 — Build, with a NEW tag.**
```bash
cd /root/twenty-esc-src
nohup ./esc/deploy/build-source-image.sh \
  --tag twenty-esc-src:v2.0.0-esc2 --app-version v2.0.0-esc2 \
  > /root/twenty-esc-build4.log 2>&1 &
```
**`esc2`, never `esc1`.** Reusing the tag destroys the ability to say which image ran. Green = the four-way enterprise check and the anchored SSRF/onboarding checks all PASS, **and** §2.3 and §2.4 pass against `esc2`.

**Step 4 — Transfer, and keep the tarball.**
```bash
# CT140
docker save twenty-esc-src:v2.0.0-esc2 | gzip -1 > /root/twenty-esc-src-esc2.tgz
# CT175 pulls it (a short-lived http.server on CT140, as before, or scp)
docker load < /path/to/twenty-esc-src-esc2.tgz
docker images | grep twenty-esc-src          # esc2 present
```
**Do not `rm` the tarball.** On either host. That is the mistake of 21 Sep 17:26:11.

**Step 5 — Apply the migration in a one-shot container, with production still serving the old image.**

This is the sequencing that makes the retry safe: the migration runs in a container that is **not** serving traffic, using the **new** image, against the **real** database. It is therefore simultaneously a DI bootstrap test against production data. If it fails, production is untouched and still healthy on `ssrf1`.

```bash
# CT175 — the new image, the production network and env, NOT the server service
docker run --rm \
  --network twenty-esc_default \
  -e PG_DATABASE_URL="postgres://postgres:${PG_DATABASE_PASSWORD}@db:5432/default" \
  -e REDIS_URL=redis://redis:6379 \
  -e SERVER_URL=https://esc.crm.fiszu.com \
  -e APP_SECRET="${APP_SECRET}" \
  -e STORAGE_TYPE=local -e ENTERPRISE_KEY=self-hosted-esc -e IS_BILLING_ENABLED=false \
  -e DISABLE_DB_MIGRATIONS=true \
  --entrypoint yarn \
  twenty-esc-src:v2.0.0-esc2 database:migrate:prod
```
Notes, all verified: `--entrypoint yarn` bypasses `entrypoint.sh` so nothing else runs. **No `--force`** — the safety check passes on its own (§1.10). **No `--include-slow`** — there are no pending slow commands and you do not want a data migration here. All 16 instance commands are already `completed` and will log `already executed, skipping`.

**Green**: the log ends `Executed 1 legacy migration(s): AddEscOnboarding1790000100000` and `Instance commands completed`. Then run §2.5 → must be `1`.
**Red**: production is still on `ssrf1` and still healthy. Stop. Do not proceed.

**Step 6 — Swap the image.**
```bash
# CT175
cd /root/twenty-esc
sed -i 's|image: twenty-esc-src:v2.0.0-esc1|image: twenty-esc-src:v2.0.0-esc2|g; s|image: twenty-esc-sso:v2.0.0-ssrf1|image: twenty-esc-src:v2.0.0-esc2|g' docker-compose.yml
grep -n 'image:' docker-compose.yml     # both server and worker on esc2
docker compose up -d
```

**Step 7 — Watch it, in this order, and do not walk away.**
```bash
docker compose ps                                 # server → healthy
docker logs -f twenty-esc-server-1                # no UnknownDependenciesException
docker logs -f twenty-esc-worker-1                # the worker has NO healthcheck — read its log
docker exec twenty-esc-server-1 curl -fsS http://localhost:3000/healthz
```
Then §2.5 (table present), §2.6 (four patched methods in the *running* container), §2.7 (a human signs in and confirms no banner + SSO + Settings → Security).
**Hard stop**: if `/healthz` is not green within **10 minutes**, execute the undo. Yesterday's version of this step was 16h41m of nobody looking.

**Step 8 — The one-command undo.** Put this on the box as `/root/twenty-esc/UNDO.sh` **before** step 6, so it is not composed under pressure:
```bash
#!/bin/sh
set -e
cd /root/twenty-esc
docker image inspect twenty-esc-sso:v2.0.0-ssrf1 >/dev/null 2>&1 || \
  gunzip -c /root/twenty-esc-ROLLBACK-<YYYYMMDD>.tgz | docker load
cp docker-compose.yml.bak.cutover2_<TS> docker-compose.yml
docker compose up -d
```
The `docker image inspect || docker load` line is the whole lesson of 22 Sep 09:58: the previous undo assumed the image was there, and it was not.

**What the undo does not reverse**: `core."escOnboarding"` stays. That is deliberate and harmless — the old image has no entity mapped to it and `synchronize:false` means TypeORM never inspects it. Re-applying the migration after a second attempt is then a no-op. Do **not** run the migration's `down()`.

**Step 9 — Only after a full working day clean**: delete nothing. Keep both tarballs and the `ssrf1` image on CT175 until §5.Q1 (a registry) exists.

---

## 4. What we accept

Stated plainly, with no hedging.

1. **The source image runs Node 24.21.0 if §1.8 is not done, or 24.15.0 if it is.** Either way, the runtime changes. §1.8 makes it the version production is already proven on and makes the change reproducible; it does not make the change zero.
2. **The container user changes from `root` to `1000`.** Nobody flagged this. `docker image inspect` → production `"User":"root"` (because `Dockerfile.option-b:15` sets `USER root` and never switches back); the source image and upstream are both `"User":"1000"`. I checked the one persistent path this could break: the `server-local-data` volume at `/var/lib/docker/volumes/twenty-esc_server-local-data/_data` is **entirely uid/gid 1000**, 10 entries, all dated 7 Apr, modes 755/644, 234 KB total. Nothing was written there by root. So the switch is safe and is in fact a *de-privileging* of a container that has been running as root since June. It is recorded here because a delta nobody wrote down is the one that bites.
3. **`APP_VERSION` changes `v2.0.0` → `v2.0.0-esc1`/`-esc2`.** Checked, not assumed: the only enforcement is `use-graphql-error-handler.hook.ts:292–318`, which fires **only** inside an `onValidate` error branch and compares **major** versions via `semver.parse`. `v2.0.0-esc2` is valid semver with major 2. No mismatch. It does change `executedByVersion` in `core."upgradeMigration"` and the version shown in the admin panel.
4. **The wizard is dead code on day one.** `grep -rn escOnboarding packages/twenty-front/src` → nothing. Shipping it proves the backend deploys; it does not put the feature in front of anyone. The feature flag `IS_ESC_ONBOARDING_WIZARD_ENABLED` is absent from `DEFAULT_FEATURE_FLAGS`, `PUBLIC_FEATURE_FLAGS` and the dev seeder, and three tests hold that.
5. **The `@Entity` and the migration will have executed for the first time on this deploy** (smoke A and §2.4 move that first execution to a scratch database, which is the point).
6. **The boot smoke test does not cover**: anything behind authentication (both wizard resolvers, `SettingsPermissionGuard`), the frontend banner of §1.2 — `/healthz` never renders a React component — providers resolved lazily at request time via `ModuleRef.get`, and anything needing Keycloak, SMTP or the SSRF allowlist. §2.7 is the only cover for the first two.
7. **Option A and option B remain two routes that must be kept equivalent by hand** until §1.5's four-way check exists. Option B is the stated rollback; a rollback to a *different* enterprise behaviour is not a rollback.
8. **The `worker` service has no healthcheck**, so after §1.7 ships, worker health is covered by the restart-ceiling detector and by nothing else.
9. **We do not know why the rollback image disappeared** (§5.Q4). The plan is deliberately built so the answer does not change any step: the tarball lives off-box.

---

## 5. Open questions for the operator

Each is genuinely a decision, not a task I could have done.

**Q1 — Where does the fork's image live, permanently?**
Today: one local tag on one box, in no registry, with no `pull_policy`, recoverable only by `git clone` + rebuild + a reachable Docker Hub. That is what turned a bad deploy into a 16h41m outage with a nine-minute rebuild in the middle of it.
- (a) Push both fork images to an org-controlled registry (GitLab CT140's registry is the obvious candidate) and pin the compose to the registry reference. Cost: standing up/authorising the registry pull on CT175. Buys: the rollback is a `docker pull`, and the image stops being a single-copy artefact.
- (b) Keep `docker save` tarballs off CT175 and treat the local image store as a cache. Cost: a manual step in `DEPLOY.md` that will be skipped one day. Buys: nothing new to stand up.
**Recommend (a), with (b) as the interim for this cutover** — §3 step 1 does (b) regardless, so (a) does not gate the retry.

**Q2 — TypeORM migration + an explicit step, or convert to an instance command?**
Both work; I verified both (§1.10).
- (a) **Keep the migration, run it as §3 step 5, assert §2.5.** No new code. The one-shot container doubles as a DI test against production data with production still serving. Cost: a human step that a second instance could skip.
- (b) **Convert to `@RegisteredInstanceCommand('2.0.0', <ts>)`** under `upgrade-version-command/2-0/` + `INSTANCE_COMMANDS`. `yarn command:prod upgrade` — which the entrypoint already runs — then applies it automatically, forever, on every instance. Cost: it changes the boot-time upgrade sequence on a live instance, which is the exact surface that crash-looped yesterday.
**Recommend (a) for this retry and (b) as the immediate follow-up, once §2.3's boot test exists to prove (b) before it reaches production.** Doing both in one cutover puts an unproven mechanism on the deploy that already failed once.

**Q3 — Does the §1.2 fix go in the overlay, or does the fork move off the compiled patch entirely?**
The overlay patching one method while `patch-enterprise.cjs` patches four is a divergence that will recur every upgrade.
- (a) Extend the overlay to all four and add a drift check that extracts the four method names from `patch-enterprise.cjs` and fails the build if the overlay does not override the same set.
- (b) Retire option B once option A is proven, and keep one route.
**Recommend (a) now** — option B is the rollback for *this* cutover and must stay equivalent — **and (b) as a decision to take after the new image has run a week.**

**Q4 — Do we want to know what removed `twenty-esc-sso:v2.0.0-ssrf1` and `twentycrm/twenty:v2.0.0` from CT175?**
Not established. Ruled out: cron, `/etc/cron.*`, systemd timers, any script under `/root /opt /usr/local`, and any sudo-logged `docker rmi`/`prune` since 2026-08-01 (journal retention). The `docker system prune -a` in `/root/.bash_history` is dated 2026-05-27 by the file's mtime. **Named candidate not eliminated**: `portainer_agent` is running on CT175 — a "remove unused images" action through the Portainer UI leaves no sudo record.
- (a) Leave it. Q1(a) makes it irrelevant.
- (b) Spend an hour on it — check Portainer's audit log, enable `HISTTIMEFORMAT` for root, and look at whether other CTs have lost images the same way (if so it is a class, not an instance).
**Recommend (a) for the cutover and (b) as a separate, filed item** — it is not on this delivery's path, and Q1 removes its teeth either way.

**Q5 — What is the restart ceiling, and who does it page?**
§1.7 needs a number and a destination, and **a cadence is never mine to choose**. `restart: always` with no ceiling is what let one container burn 3,128 restarts overnight.
- Suggested shape: page when either `twenty-esc-*` container restarts **more than 5 times in 15 minutes**, through the alert relay, into the stability channel, with a mention that Mattermost actually resolves.
**Recommend you set the number and the channel**; I will not change a cadence or pick an alert destination. State both and the detector can ship with §1.7.