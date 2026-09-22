# Source-build preflight — the 20 findings that survived adversarial verification

Run 2026-09-22 after the failed cutover. Six independent read-only lenses over the fork's
delta against upstream `v2.0.0` and over the live deploy path; every finding then put to
three refuters with distinct angles (is it true / is it already handled / can you reproduce
it), each told to default to *refuted* when uncertain. A finding needed two of three to
survive.

**36 findings raised, 20 survived, 16 refuted.** 116 agents, no errors.

Five of the six lenses independently found the same blocker: the migration never runs.
That is not five findings, it is one fact confirmed five ways, and it is why this document
exists rather than a retry.

## [BLOCKER][di-bootstrap] The fork's core migration never runs on the CT175 deploy path — `core.escOnboarding` will not exist, so every wizard resolver call fails at runtime

EVIDENCE:
1) The image entrypoint (identical in the new image — `git diff --name-only v2.0.0...origin/emobility-unity -- packages/twenty-docker/` prints NOTHING, and the live container's copy matches `packages/twenty-docker/twenty/entrypoint.sh`) runs legacy TypeORM migrations only inside a schema-absence branch:
```
has_schema=$(psql -tAc "SELECT EXISTS (... schema_name = 'core')" ...)
if [ "$has_schema" = "f" ]; then yarn database:init:prod; fi
yarn command:prod cache:flush
yarn command:prod upgrade
yarn command:prod cache:flush
```
(entrypoint.sh:13-21, read from the running container via `sudo docker exec twenty-esc-server-1 sh -lc "cat /app/entrypoint.sh"`).
2) `packages/twenty-server/package.json:12-13` — `database:init:prod` = `setup-db.js && yarn database:migrate:prod`; `database:migrate:prod` = `node dist/command/command run-instance-commands`.
3) `grep -rn "runMigrations(" packages/twenty-server/src --include='*.ts'` returns exactly one server hit: `src/database/commands/run-instance-commands.command.ts:157`. The `upgrade` command never reaches it — `src/database/commands/upgrade-version-command/upgrade.command.ts:115` calls `upgradeSequenceReaderService.getUpgradeSequence()`, and `src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service.ts:38-58` builds that sequence purely from `@RegisteredInstanceCommand` / `@RegisteredWorkspaceCommand` registry bundles.
4) Measured on production (read-only SELECT): `sudo docker exec twenty-esc-db-1 psql -U postgres -d default -tAc "SELECT count(*), max(timestamp) FROM core._typeorm_migrations"` → `182|1775909335324`. That is the highest migration present in the running image's `dist/database/typeorm/core/migrations/common/` (`1775909335324-add-is-initial-to-upgrade-migration.js`), i.e. the DB is fully caught up and the `core` schema exists, so `database:init:prod` will not fire again.
5) `core.datasource.ts:55-56` — `synchronize: false`, `migrationsRun: false`.
6) `esc/deploy/DEPLOY.md` contains no migration step (`grep -n "database:migrate|migration" esc/deploy/DEPLOY.md` → no match). Only `docs/esc-onboarding-wizard.md:84` mentions `npx nx run twenty-server:database:migrate:prod`, as prose.

FAILURE:
Deploy `twenty-esc-src:v2.0.0-esc1` (or its fixed rebuild) to CT175 and the server boots clean — the migration is in `dist`, but nothing executes it. The first GraphQL call to `escOnboardingState`, `advanceEscOnboardingStep`, `completeEscOnboarding`, `resetEscOnboarding`, `resetEscOnboardingForUser` or `resetEscOnboardingForEveryone` throws `relation "core.escOnboarding" does not exist`. Because `EscOnboardingService.provision()` is called on every one of those paths, the whole feature is dead on arrival and there is no boot-time symptom to warn anyone — it looks like a successful deploy.

FIX:
Ship the table as a `@RegisteredInstanceCommand('2.0.0', <ts>)` under `src/database/commands/upgrade-version-command/`, which is the mechanism `yarn command:prod upgrade` actually executes on an existing instance (upstream calls the TypeORM path "legacy" — `run-instance-commands.command.ts:154`). If the legacy migration is kept instead, the deploy procedure must run `yarn database:migrate:prod` inside the container as an explicit, verified step in `esc/deploy/DEPLOY.md`, and the post-deploy check must assert `to_regclass('core."escOnboarding"')` is non-null before the deploy is called done.

---
## [BLOCKER][migration-startup] The new core migration never runs on CT175 — the deploy path has no code path that executes TypeORM migrations against a non-empty database

EVIDENCE:
packages/twenty-docker/twenty/entrypoint.sh:12-21 — `database:init:prod` runs ONLY when `SELECT EXISTS (... schema_name='core')` returns 'f'; otherwise the only DB work is `yarn command:prod cache:flush`, `yarn command:prod upgrade`, `yarn command:prod cache:flush`. CT175's live log has no "Database appears to be empty" line (`pangolin ssh esc-blades-ct175.ssh -- 'sudo docker logs twenty-esc-server-1 2>&1 | head -60'` -> first line is "Running database setup and migrations..." then straight into Nest). `upgrade.command.ts:117-141` only runs `UpgradeSequenceReaderService.getUpgradeSequence()` through `UpgradeSequenceRunnerService`; `upgrade-sequence-runner.service.ts` and `instance-command-runner.service.ts` contain no `runMigrations` call. The ONLY `runMigrations()` in the server is `src/database/commands/run-instance-commands.command.ts:154-167` `runLegacyPendingTypeOrmMigrations()`, reachable only from `database:migrate:prod` (`node dist/command/command run-instance-commands`) / `database:init:prod` — `packages/twenty-server/package.json:12-13`. Production DB proof: `sudo docker exec twenty-esc-db-1 psql -U postgres -d default -c "select count(*) from core._typeorm_migrations"` -> 182, highest applied `AddIsInitialToUpgradeMigration1775909335324`; repo has 183 migration files (`ls .../migrations/common | wc -l` on /root/twenty-esc-rollback @7e74e427); `select to_regclass('core."escOnboarding"')` -> NULL. `core.datasource.ts:55-56` sets `synchronize: false, migrationsRun: false`, so nothing creates it implicitly.

FAILURE:
Deploying twenty-esc-src:v2.0.0-esc1 to CT175 leaves EscOnboardingEntity registered (matched by the entity glob `dist/engine/core-modules/**/!(billing-*).entity.{ts,js}`, core.datasource.ts:52) with no table behind it. The first execution of the `escOnboardingState` query / `advanceEscOnboardingStep` / `completeEscOnboarding` / `resetEscOnboarding` mutation throws `QueryFailedError: relation "core.escOnboarding" does not exist` and returns a GraphQL 500. It is silent today only because nothing calls it yet — `grep -rn escOnboarding packages/twenty-front/src` returns nothing — so the feature ships dead and breaks the moment the front-end half lands. The boot itself does NOT fail: TypeORM with synchronize:false does not touch the table at startup.

FIX:
Ship the DDL the way upstream v2.0 ships schema changes for existing instances: add a fast instance command under src/database/commands/upgrade-version-command/<version>/ and register it in instance-commands.constant.ts INSTANCE_COMMANDS, so `command:prod upgrade` (which the entrypoint already runs) applies it and records it in core.upgradeMigration. Keep the TypeORM migration file as well so fresh installs via database:init:prod still get the table. If that is too much for this change, the minimum is an explicit, gated deploy step `docker compose exec server yarn database:migrate:prod` run BEFORE the new image serves traffic — and a test that fails if a migration file exists with no corresponding instance command.

---
## [BLOCKER][image-parity] The esc-onboarding migration will never run on CT175, so the wizard's table is never created and every one of its GraphQL operations errors

EVIDENCE:
Entrypoint (packages/twenty-docker/twenty/entrypoint.sh:13-17) runs the migration path ONLY on an empty database: `has_schema=$(psql -tAc "SELECT EXISTS (... schema_name = 'core')")` then `if [ "$has_schema" = "f" ]; then yarn database:init:prod; fi`. On an existing DB it falls through to `yarn command:prod upgrade` (line 20) only.

Only ONE thing in the whole server runs TypeORM migrations. `sudo docker exec twenty-esc-server-1 sh -c "grep -rn 'runMigrations(' /app/packages/twenty-server/dist | grep -v .map"` returns exactly:
  dist/database/commands/run-instance-commands.command.js:105:  const migrations = await this.dataSource.runMigrations({
(plus an unrelated ClickHouse script). That command is `database:migrate:prod`, reachable only via `database:init:prod`. The UpgradeCommand path does not call it — `grep -n 'migration|runMigrations|connectionSource' dist/engine/core-modules/upgrade/services/upgrade-sequence-runner.service.js` returns no runMigrations.
And `dist/database/typeorm/core/core.datasource.js:74` sets `migrationsRun: false`, so boot does not run them either.

Measured on the live DB (`docker exec twenty-esc-db-1 psql -U postgres -d default`):
  SELECT count(*) FROM core._typeorm_migrations;              -> 182
  SELECT to_regclass('core.escOnboarding');                   -> NULL
  SELECT count(*) FROM core._typeorm_migrations WHERE name LIKE '%Esc%'; -> 0
The built image ships 183 migrations (`tar -tzf <dist layer> | grep migrations/common/ | grep '\.js$' | wc -l` = 183, including 1790000100000-add-esc-onboarding.js). So every upstream migration is applied and the ESC one is the sole pending migration — with nothing on the boot path to apply it.

The migration creates `core."escOnboarding"` (packages/twenty-server/src/database/typeorm/core/migrations/common/1790000100000-add-esc-onboarding.ts:6) and the entity maps to it (esc-onboarding.entity.ts:13).

FAILURE:
Deploy the source image to CT175 with the PermissionsModule fix applied. The server boots (synchronize:false, so a missing table is not a startup error) and the feature looks shipped. The first call to `escOnboardingState`, `advanceEscOnboardingStep`, `completeEscOnboarding` or `resetEscOnboarding` reaches EscOnboardingService.provision() -> escOnboardingRepository.findOne() (esc-onboarding.service.ts:40) and Postgres returns `relation "core.escOnboarding" does not exist`. Both admin mutations fail the same way. The entire reason the fork moved off option B — shipping the wizard, which option B could not carry — is silently void, and the failure surfaces to whoever first enables IS_ESC_ONBOARDING_WIZARD_ENABLED rather than at deploy time. Twenty v2 moved instance-level schema changes to "instance commands" (dist/database/commands/upgrade-version-command/instance-commands.constant.js, INSTANCE_COMMANDS); the legacy TypeORM migration directory is only drained on a fresh install.

FIX:
Do not ship the schema change as a legacy TypeORM migration. Add it as a fast instance command under packages/twenty-server/src/database/commands/upgrade-version-command/2-1/ and register it in INSTANCE_COMMANDS, which is what `yarn command:prod upgrade` actually executes on an existing database. If the TypeORM migration is kept instead, the deploy procedure must explicitly run `yarn database:migrate:prod` (i.e. `node dist/command/command run-instance-commands`) once against CT175 before the new image serves traffic — and that step must be written into esc/deploy/DEPLOY.md, because nothing in the entrypoint will ever do it.

---
## [BLOCKER][flag-off-behaviour] The esc-onboarding core migration can never run through the production deploy path — core."escOnboarding" does not exist on CT175

EVIDENCE:
CT175 ground truth: `pangolin ssh esc-blades-ct175.ssh -- 'sudo docker exec twenty-esc-db-1 psql -U postgres -d default -tAc "SELECT coalesce(to_regclass(...)::text,''NULL'')"'` → NULL, and the newest row in core._typeorm_migrations is timestamp 1775909335324 (AddIsInitialToUpgradeMigration). The image entrypoint, read from the running container (`docker exec twenty-esc-server-1 cat /app/entrypoint.sh`), has setup_and_migrate_db() run `yarn database:init:prod` ONLY when the core schema is absent, otherwise just `yarn command:prod cache:flush; yarn command:prod upgrade; yarn command:prod cache:flush`. packages/twenty-server/package.json:13 defines `database:migrate:prod` as `node dist/command/command run-instance-commands`. The only dataSource.runMigrations() call in the server is database/commands/run-instance-commands.command.ts:157 (grep -rn runMigrations over packages/twenty-server/src returns that, the ClickHouse runner, and core.datasource.ts:56 `migrationsRun: false`). database/commands/upgrade-version-command/upgrade.command.ts:105-155 runs only the upgrade sequence; `ls database/commands/upgrade-version-command/2-0/` contains only 2-0-upgrade-version-command.module.ts, and grep for runMigrations across upgrade-version-command/ and core-modules/upgrade/ returns nothing. `grep -i migrat esc/deploy/DEPLOY.md` → no hits.

FAILURE:
Deploy the source-built image and the server boots clean and reports healthy — the entrypoint never applies migration 1790000100000. The first call to escOnboardingState or any wizard mutation then fails with `relation "core"."escOnboarding" does not exist`. The failure is invisible at deploy time and only surfaces when someone uses the feature. (The migration file itself is correct: it creates the table in schema core with the matching PK, the IDX_ESC_ONBOARDING_USER_ID_UNIQUE index, jsonb '[]' and timestamptz DEFAULT now(), and 1790000100000 sorts after every upstream v2.0.0 migration.)

FIX:
Add the migration step to esc/deploy/DEPLOY.md and run it once after the image is deployed: `docker exec twenty-esc-server-1 node dist/command/command run-instance-commands` (the `database:migrate:prod` script). Better: make the deploy procedure invoke it explicitly rather than relying on the entrypoint, which by design only runs `upgrade`.

---
## [BLOCKER][boot-test-gap] Source overlay patches 1 of the 4 enterprise methods the production image patches — the source build puts the "enterprise key no longer valid" banner back in front of every user

EVIDENCE:
`esc/deploy/patch-enterprise.cjs:12-17` applies FOUR regexes: `isValid()`, `hasValidEnterpriseValidityToken()`, `async getLicenseInfo()`, `async getSubscriptionStatus()`, and its own header (lines 1-6) says why: "A single isValid() patch is NOT enough — the frontend reads getSubscriptionStatus()/getLicenseInfo()". Confirmed live on CT175: `pangolin ssh esc-blades-ct175.ssh -- 'sudo docker exec twenty-esc-server-1 grep -n "..." /app/packages/twenty-server/dist/engine/core-modules/enterprise/services/enterprise-plan.service.js'` → 4 hits, lines 146 `hasValidEnterpriseValidityToken() { return true;`, 156 `isValid() { return true;`, 166 `getLicenseInfo() { return {isValid:true,...}`, 269 `getSubscriptionStatus() { return {status:'active',...}`.
The source overlay patches only one: `git show v2.0.0:packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts > /tmp/e1.ts && diff -u /tmp/e1.ts esc/overlay/packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts` → ONE hunk, at `isValid()` (upstream line 149-151), replacing `return this.hasValidEnterpriseValidityToken();` with `return true;`. Nothing else is touched.
Chain to the user-visible effect: `packages/twenty-server/src/engine/core-modules/workspace/workspace.resolver.ts:313-325` exposes `hasValidEnterpriseKey`, `hasValidSignedEnterpriseKey`, `hasValidEnterpriseValidityToken` as ResolveFields straight off the service. At v2.0.0, `enterprise-plan.service.ts:135-143` returns false from `hasValidEnterpriseValidityToken()` when there is no cached validity payload, and `:153-156 checkLegacyKey()` returns true whenever `ENTERPRISE_KEY` is defined — `/root/twenty-esc/docker-compose.yml` sets `ENTERPRISE_KEY: self-hosted-esc`, which is not a signed JWT, so `hasValidSignedEnterpriseKey` is false. `packages/twenty-front/src/modules/information-banner/components/enterprise/InformationBannerInvalidEnterpriseKey.tsx:24-27` renders the banner when exactly that triple holds: `hasValidEnterpriseKey === true && hasValidSignedEnterpriseKey !== true && hasValidEnterpriseValidityToken !== true`.

FAILURE:
On the next source-image deploy, every signed-in user sees the persistent banner "Your enterprise key is no longer valid. Activate a new key to continue using enterprise features." with an Activate button pointing at the admin enterprise page. Keycloak SSO login itself keeps working (`src/engine/core-modules/auth/guards/enterprise-features-enabled.guard.ts:25` reads only `isValid()`), so this will not look like an outage — it will look like the licence expired, and `esc/deploy/build-source-image.sh` reports PASS on the image that does it. `getSubscriptionStatus()` also stops being stubbed, so the enterprise settings page starts making live outbound calls to Twenty's licensing API (`ENTERPRISE_API_URL`) that production has never made.

FIX:
Extend `esc/overlay/.../enterprise-plan.service.ts` to patch the same four methods `patch-enterprise.cjs` does — at minimum `hasValidEnterpriseValidityToken()` must also `return true`, which alone clears the banner. Then add a check that cannot drift: a script that extracts the patched method names from `esc/deploy/patch-enterprise.cjs` (the four regexes) and asserts each one is also overridden in the overlay copy, failing the build when the two lists differ. Option B is the fork's stated rollback, so the two routes must be provably equivalent, not merely both present.

---
## [BLOCKER][boot-test-gap] The build gate's most important check cannot fail: it greps the whole compiled file for `return true`, a string upstream already ships twice

EVIDENCE:
`esc/deploy/build-source-image.sh:147-149` calls `check_in_image "enterprise gate bypassed" "${DIST}/engine/core-modules/enterprise/services/enterprise-plan.service.js" "return true"`, and `check_in_image` (lines 119-145) reads the whole file and runs `grep -q "$3"` over all of it — no method anchoring.
`git show v2.0.0:packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts | grep -n "return true"` → `256:      return true;` and `297:      return true;` — plain return statements inside `refreshValidityToken()` and `reportSeats()`, preserved verbatim by the TypeScript build. So the needle is present in the compiled file whether or not any ESC patch was applied.
The repo already contains the sound form of this check: `scripts/verify-esc-image.sh:27-28` greps for the anchored string `'isValid() { return true;'`. The build script does not use it.
Measured consequence, CT140 `/root/twenty-esc-build3.log` tail: `PASS enterprise gate bypassed` on the image built from an overlay that, per finding 1, is missing three of the four patches.

FAILURE:
`build-source-image.sh` would print `PASS enterprise gate bypassed` and exit 0 on a plain `twentycrm/twenty:v2.0.0` image with no ESC patch at all. The one check standing between a lost SSO patch and a deploy is a no-op, and the two-line PASS block reads as though it were verified.

FIX:
Anchor the needle to the method, and assert all four: replace the single `return true` check with `isValid() { return true;`, `hasValidEnterpriseValidityToken() { return true;`, `getLicenseInfo() { return {` and `getSubscriptionStatus() { return {`. Prove each one with a mutation test in both directions — run the check against `twentycrm/twenty:v2.0.0` (already present on both hosts) and require it to FAIL; a check that has never been seen to fail is not a check.

---
## [BLOCKER][boot-test-gap] Nothing boots the image before it is deployed — build-source-image.sh only greps three files inside it, and verify.sh's only two code-touching gates skip themselves on the gate runner

EVIDENCE:
`esc/deploy/build-source-image.sh:110-162` is the whole post-build verification: `docker create`, then three `docker cp | tar -xO | grep` checks (lines 147-157). No container is ever started. `esc/deploy/DEPLOY.md` and the script's own closing message (lines 164-169) go straight from "Built and checked" to `docker save | ssh <host> | docker load`.
`verify.sh` runs: `./check-no-workflows.sh` (line 9), an overlay path-existence test (lines 28-54), `npx nx typecheck twenty-server` + `npx jest esc-onboarding` (lines 79-81), and the fork-scope diff (lines 249-268). The typecheck and the wizard suite are wrapped in `if [ -d node_modules ]` and the else branch (lines 84-87) prints `esc-onboarding: SKIPPED — node_modules is absent in this checkout`; the gate payload never carries node_modules, so on the runner the gate proves only "no GitHub workflows" and "overlay paths still exist". Neither a typecheck nor a unit test resolves a Nest container in any case — today's `UnknownDependenciesException` is thrown at `app.init()`, not at compile time.
The wizard's own specs cannot see it either: `packages/twenty-server/src/engine/core-modules/esc-onboarding/services/__tests__/esc-onboarding.service.spec.ts:62` and `.../esc-onboarding-identity.service.spec.ts:35` both call `Test.createTestingModule({ providers: [...] })` with hand-listed mocks; neither imports `EscOnboardingModule`, so a missing `imports:` entry is invisible to them by construction.

FAILURE:
Any defect that only appears when Nest resolves the real container — a missing module import, a provider not exported, a circular import, a failed `onModuleInit` — reaches production undetected. It already did: the CRM was 502 for about an hour on 2026-09-21 because `EscOnboardingModule` did not import `PermissionsModule`, and every check in the repo was green.

FIX:
Add a boot smoke test to `build-source-image.sh`, between the grep checks and the success message, failing the build if the image does not reach a healthy state. It needs only Postgres, Redis and the image itself — `curl` is already installed in the runtime stage (`packages/twenty-docker/twenty/Dockerfile:79`) and `/healthz` is a real anonymous route (`packages/twenty-server/src/engine/core-modules/health/controllers/health.controller.ts:7 @Controller('healthz')`). Required env, from `packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts`: `PG_DATABASE_URL` (line 997, `@IsDefined` + `@IsUrl({protocols:['postgres','postgresql']})`), `REDIS_URL` (line 1083, `@IsUrl({protocols:['redis','rediss']})`), `APP_SECRET` (line 1174, env-only), plus `SERVER_URL`, `STORAGE_TYPE=local`, `NODE_PORT=3000` — every one of them can be a dummy value. Run it against an EMPTY Postgres with migrations left ENABLED, because that makes one test cover three things: `packages/twenty-docker/twenty/entrypoint.sh:13-17` sees no `core` schema and runs `yarn database:init:prod` (so the whole migration set, including `1790000100000-add-esc-onboarding.ts`, is executed for the first time anywhere), then lines 19-21 run `yarn command:prod cache:flush`, which boots `CommandModule` → `AppModule` (`packages/twenty-server/src/command/command.module.ts:11-18`) and is exactly where today's DI error was thrown, then `node dist/main` serves `/healthz`. Concretely on CT140, which has no compose plugin (see finding 7): `docker network create esc-smoke`; `docker run -d --name esc-smoke-db --network esc-smoke -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=default postgres:16`; `docker run -d --name esc-smoke-redis --network esc-smoke redis:7-alpine`; poll `docker exec esc-smoke-db pg_isready -U postgres` and `docker exec esc-smoke-redis redis-cli ping`; `docker run -d --name esc-smoke-server --network esc-smoke -e NODE_PORT=3000 -e PG_DATABASE_URL=postgres://postgres:smoke@esc-smoke-db:5432/default -e REDIS_URL=redis://esc-smoke-redis:6379 -e SERVER_URL=http://localhost:3000 -e APP_SECRET=smoke-not-a-secret -e STORAGE_TYPE=local -e ENTERPRISE_KEY=self-hosted-esc -e IS_BILLING_ENABLED=false <tag>`; poll `docker exec esc-smoke-server curl -fsS http://localhost:3000/healthz` for up to ~5 minutes; then assert the migration landed with `docker exec esc-smoke-db psql -U postgres -d default -tAc 'select to_regclass('\''core."escOnboarding"'\'')'`; then boot the worker too — `docker run --rm --network esc-smoke <same env> <tag> yarn worker:prod` is a SEPARATE Nest bootstrap (`packages/twenty-server/package.json` script `worker:prod` → `node dist/queue-worker/queue-worker`), so a server-only test would miss a worker-only DI break; finally `docker rm -f` the three containers and `docker network rm esc-smoke`. On failure, dump `docker logs esc-smoke-server` into the build output — that is where the Nest message naming the unresolvable provider appears. State plainly what this still does NOT catch: anything behind authentication (the `SettingsPermissionGuard` on `EscOnboardingAdminResolver`, the wizard resolvers themselves), the frontend regression in finding 1 (a React component reading a GraphQL field of a signed-in user — `/healthz` never touches it), the existing-database upgrade path CT175 actually takes (finding 4 — the smoke DB is empty, so it exercises `database:init:prod`, not `upgrade`; a second run against a restored production dump is what covers that), providers resolved lazily at request time via `ModuleRef.get`, and anything needing Keycloak, SMTP or the SSRF allowlist.

---
## [HIGH][di-bootstrap] `advanceEscOnboardingStep` rejects every call that omits `nextStep` — the optional field is missing `@IsOptional()`

EVIDENCE:
`packages/twenty-server/src/engine/core-modules/esc-onboarding/dtos/advance-esc-onboarding-step.input.ts:15-18`:
```ts
@Field(() => String, { nullable: true })
@IsString()
@MaxLength(128)
nextStep?: string;
```
No `@IsOptional()`. The resolver applies the validating pipe at `esc-onboarding.resolver.ts:19` (`@UsePipes(ResolverValidationPipe)`), and `src/engine/core-modules/graphql/pipes/resolver-validation.pipe.ts:16-17,32-33` calls `validate(object)` with NO options.
class-validator only skips undefined/missing properties when the option is explicitly `true` — read from the live image with `sudo docker exec twenty-esc-server-1 sh -lc "grep -n ... /app/node_modules/class-validator/cjs/validation/ValidationExecutor.js"`:
```
139: if (value === undefined && this.validatorOptions && this.validatorOptions.skipUndefinedProperties === true) {
145: if ((value === null || value === undefined) &&
147:     this.validatorOptions.skipMissingProperties === true) {
```
Both are undefined here, so an absent `nextStep` falls through to `isString` and `maxLength` and fails.
Upstream convention for exactly this shape is `@IsString()` + `@IsOptional()` — e.g. `src/engine/core-modules/workspace/dtos/update-workspace-input.ts:19-21,25-27,32-34`.

FAILURE:
A client calls `advanceEscOnboardingStep(input: { completedStep: "final-step" })` with no `nextStep` — which is precisely the last step of any wizard script, and the only sane way to express "nothing comes next". `ResolverValidationPipe` throws `UserInputError: nextStep must be a string, nextStep must be shorter than or equal to 128 characters`. The step is never recorded. The unit suite does not catch it: `services/__tests__/esc-onboarding.service.spec.ts:168,185` calls `service.advanceStep(...)` directly, bypassing the pipe entirely, and the service itself handles `nextStep ?? null` correctly (`services/esc-onboarding.service.ts:105`).

FIX:
Add `@IsOptional()` to `nextStep` in `advance-esc-onboarding-step.input.ts`, above `@IsString()`, matching `update-workspace-input.ts`. Add a resolver-level (not service-level) test that pushes an input with `nextStep` omitted through `ResolverValidationPipe` and asserts it passes.

---
## [HIGH][di-bootstrap] `build-source-image.sh` refuses to run a second time in the same checkout — its dirty-tree guard fires on the overlay it wrote itself

EVIDENCE:
`esc/deploy/build-source-image.sh:79-85` aborts on `git status --porcelain` being non-empty, and the comment on line 78 claims "The overlay's own writes are expected, so this runs BEFORE esc-apply.sh." But `esc/esc-apply.sh:104` (`cp "${src_file}" "${dest_file}"`) overwrites TRACKED upstream files in `packages/`, and that dirt survives the build — there is no cleanup anywhere in either script.
Measured on the build host: `pangolin ssh esc-blades-ct140.ssh -- 'sudo sh -c "cd /root/twenty-esc-src && git status --porcelain"'` →
```
 M packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts
 M packages/twenty-server/src/engine/core-modules/secure-http-client/utils/is-private-ip.util.ts
```
Those are exactly the two files in `esc/overlay/`. `--skip-apply` does not help: the git check at line 79 runs before the `RUN_APPLY` branch at line 87.

FAILURE:
The next invocation of `./esc/deploy/build-source-image.sh --tag ...` on CT140 — i.e. the rebuild that carries the `PermissionsModule` fix for today's outage — exits 1 with "the working tree is dirty ... Commit or stash first." The message blames the operator for the script's own writes, and the obvious reflexive fix (`git stash` or `git commit`) either discards the overlay or commits patched upstream files onto the branch.

FIX:
Move the dirty-tree check to compare against the overlay-applied state, or clean up in a trap: capture `git status --porcelain` before `esc-apply.sh`, and on exit restore the overlay targets with `git checkout -- <overlay target paths>`. At minimum, make the guard ignore paths that exist under `esc/overlay/` and say so in the error text.

---
## [HIGH][di-bootstrap] Nothing on the build or gate path can detect a NestJS bootstrap/DI failure — the exact class that took production down today

EVIDENCE:
The build's own image verification is three greps for string needles: `esc/deploy/build-source-image.sh:147-157` checks `return true` in `enterprise-plan.service.js`, `ESC_SSRF_ALLOWED_HOSTS` in `is-private-ip.util.js`, and `EscOnboardingModule` in `esc-onboarding.module.js`. The third one passed on the broken image — build log tail from `sudo tail -40 /root/twenty-esc-build3.log` on CT140 shows `PASS onboarding wizard module compiled in` for image `f6a91764fbc0` = `twenty-esc-src:v2.0.0-esc1`, the image whose `EscOnboardingModule` could not resolve `PermissionsService`.
The repo gate is no better: `verify.sh:79-80` runs `npx nx typecheck twenty-server` plus the wizard's unit suite. Neither instantiates a Nest module graph — `services/__tests__/esc-onboarding-identity.service.spec.ts:35-44` builds an isolated `Test.createTestingModule({ providers: [...] })` with hand-supplied mocks, so the real module's `imports` array is never exercised.
The blast radius is all three processes, not just the API: `src/queue-worker/queue-worker.module.ts:12` imports `CoreEngineModule` directly, and `src/database/commands/command.module.ts:12` imports `AppModule` which imports `CoreEngineModule` (`src/app.module.ts:61`) — and the entrypoint runs `yarn command:prod upgrade` BEFORE `node dist/main` (entrypoint.sh:20), so a DI fault kills the container in the entrypoint, with `restart: always` and no per-attempt alerting.

FAILURE:
The same defect class recurs and is again discovered by the CRM being 502 in front of users. Today's instance compiled, typechecked and passed every unit test, and the build script stamped the image `PASS`. Nothing between `git push` and a live 502 can observe whether the module graph resolves.

FIX:
Add one boot smoke step to `build-source-image.sh` after the grep checks: start the built image against a throwaway Postgres + Redis with `DISABLE_DB_MIGRATIONS=true`, wait for `/healthz`, and fail the build if it does not come up; then tear it down. A cheaper partial is a jest test that calls `Test.createTestingModule({ imports: [EscOnboardingModule] }).compile()` with only the datasource mocked — that alone would have failed on the missing `PermissionsModule`.

---
## [HIGH][migration-startup] The deploy runbook contains no migration step at all, and the one place the step is written names a command that cannot run in the production image

EVIDENCE:
`sudo grep -niE "migrat|DISABLE_DB|database:|escOnboarding" /root/twenty-esc-rollback/esc/deploy/DEPLOY.md` -> zero matches (DEPLOY.md's headings are: What was deployed / Rollback / Remaining / WORKING SSO / Upgrade procedure / Rollback / Security nav / SSRF allowlist). The only written instruction is docs/esc-onboarding-wizard.md:84 `npx nx run twenty-server:database:migrate:prod   # applies the migration`. In the running production image: `sudo docker exec twenty-esc-server-1 sh -c "ls /app/node_modules/.bin/ | grep -x nx"` -> no output (nx absent); only `/usr/local/bin/npx` exists, so the command would attempt a network fetch of nx on a production box. docs/handovers/2026-09-21_onboarding-wizard-backend.md:32 states plainly "Run against a database: nothing. The migration has never been applied anywhere."

FAILURE:
An operator following DEPLOY.md — the document named 'DEPLOY' — deploys the source image and never applies the migration, producing finding 1. An operator who instead follows the wizard doc runs `npx nx ...` inside the container and gets either a network fetch or a failure, on the box that was 502 for an hour today.

FIX:
Put the exact in-container command in esc/deploy/DEPLOY.md as a numbered step of the source-image deploy, before the container is allowed to serve: `docker compose exec server yarn database:migrate:prod` (verified safe on CT175 today: without --force it calls checkWorkspaceVersionSafety, TWENTY_PREVIOUS_VERSIONS ends at '1.23.0' and the live workspace cursor is at 1.23.0_UpdateGlobalObjectContextCommandMenuItemsCommand_1780000005000, the last 1.23.0 workspace command, so the check passes). Correct docs/esc-onboarding-wizard.md:84 to the same command, and say it is run on the host, not from an nx workspace.

---
## [HIGH][image-parity] The source build bypasses only 1 of the 4 enterprise-validity methods that production's image patches, so the enterprise licence reads invalid at runtime

EVIDENCE:
Production's image is built by esc/deploy/Dockerfile.option-b, which runs esc/deploy/patch-enterprise.cjs. That script's own header states: "Forces ALL enterprise-validity methods to report valid so BOTH the backend SSO guard AND the frontend (the 'enterprise key no longer valid' banner + the Security/SSO settings visibility) treat enterprise as active. A single isValid() patch is NOT enough — the frontend reads getSubscriptionStatus()/getLicenseInfo(), which return null/invalid when the ENTERPRISE_KEY is not a valid signed JWT." Its `patches` array has 4 entries (isValid, hasValidEnterpriseValidityToken, getLicenseInfo, getSubscriptionStatus) and it exits 1 unless all 4 apply.

LIVE image, `sudo docker exec twenty-esc-server-1 grep -n ... dist/engine/core-modules/enterprise/services/enterprise-plan.service.js`:
  146:    hasValidEnterpriseValidityToken() { return true;
  156:    isValid() { return true;
  166:    async getLicenseInfo() { return { isValid: true, licensee: 'ESC Self-Hosted', expiresAt: ..., subscriptionId: 'self-hosted-esc' };
  269:    async getSubscriptionStatus() { return { status: 'active', licensee: 'ESC Self-Hosted', ... };

SOURCE image, same file read out of its dist layer on CT140 (`sudo tar -xzOf <blobs>/90c42a14... app/packages/twenty-server/dist/engine/core-modules/enterprise/services/enterprise-plan.service.js`):
  146:    hasValidEnterpriseValidityToken() {   <- upstream body, returns cachedValidityPayload.exp > now, else false
  156:    isValid() {                           <- ESC OVERLAY PATCH, returns true  (the ONLY one patched)
  181:    async getLicenseInfo() {              <- upstream body: returns { isValid: false, licensee: null, expiresAt: null, subscriptionId: null } when no validity payload
  284:    async getSubscriptionStatus() {       <- upstream body, line 290 calls `await this.getLicenseInfo()`
The string 'ESC Self-Hosted' does not appear anywhere in the source image's copy.

CT175 runs ENTERPRISE_KEY: self-hosted-esc (/root/twenty-esc/docker-compose.yml), which is not a signed JWT, so cachedValidityPayload is never populated.

FAILURE:
Deploy the source image and SSO login keeps working (isValid() is patched, so EnterpriseFeaturesEnabledGuard still passes), but getLicenseInfo() now returns isValid:false / licensee:null / expiresAt:null and getSubscriptionStatus() inherits that. Per the fork's own patch script, that is exactly what drives the "enterprise key no longer valid" banner and the visibility of the Security/SSO settings pages — so every user of esc.crm.fiszu.com sees an invalid-licence banner and admins lose the SSO settings UI, a visible estate-wide regression against what production shows today. Additionally getLicenseInfo() in the source image calls `await this.loadValidityToken()`, an outbound request to Twenty's remote licensing API (ENTERPRISE_API_URL) that the live image never makes, so the source image introduces a new third-party dependency on a page load.

FIX:
Extend esc/overlay/packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts to override the same four methods the compiled patch does — hasValidEnterpriseValidityToken(), isValid(), getLicenseInfo() and getSubscriptionStatus() — returning the same ESC Self-Hosted payloads (licensee 'ESC Self-Hosted', subscriptionId 'self-hosted-esc', a far-future expiry, status 'active'). Then re-verify by diffing the compiled enterprise-plan.service.js from the new image against the live one, not by reading the source.

---
## [HIGH][image-parity] The build script's own image check cannot detect the missing enterprise patches — it greps the whole file for `return true`, which upstream code already contains

EVIDENCE:
esc/deploy/build-source-image.sh gates the deploy on:
    check_in_image "enterprise gate bypassed" \
      "${DIST}/engine/core-modules/enterprise/services/enterprise-plan.service.js" \
      "return true"
and check_in_image reads the whole file and does `printf '%s' "${extracted}" | grep -q "$3"`, i.e. a single unanchored substring match anywhere in a ~420-line file.

The source image I read out of the CT140 blob store contains `return true` at lines 172 (the patched isValid), 246 and 278 (unrelated upstream code) while hasValidEnterpriseValidityToken, getLicenseInfo and getSubscriptionStatus are all unpatched. The check therefore printed PASS on the image described in the previous finding. The same weakness applies to the SSRF check (needle `ESC_SSRF_ALLOWED_HOSTS`) and the onboarding check (needle `EscOnboardingModule`) — each proves one token exists, not that the feature is complete or correct; the onboarding check passed on the image whose EscOnboardingModule was missing PermissionsModule and took the CRM down for an hour.

FAILURE:
Any future source build that silently loses 3 of the 4 enterprise patches — exactly what happened here — is reported as "Built and checked" and handed to the operator as deployable. The script's header comment is explicit that a false negative is the expensive direction, but it was never hardened against the false POSITIVE, which is the one that actually reached production. The gate gives the deploy cover it has not earned.

FIX:
Make each check assert the specific patched behaviour rather than a token: grep for the exact ESC payload markers that only the patch can produce — `'ESC Self-Hosted'` and `subscriptionId: 'self-hosted-esc'` — and count that all four method signatures are overridden, failing if fewer than 4 match. Prove it both ways with a mutation test: remove one of the four overrides and confirm the check turns red.

---
## [HIGH][flag-off-behaviour] Nothing in the gate or the build can catch a Nest bootstrap failure — the exact class that took the CRM down for an hour today, and it has no regression test

EVIDENCE:
verify.sh:79-88 — the entire wizard gate is `npx nx typecheck twenty-server` and `(cd packages/twenty-server && npx jest esc-onboarding)`. Neither instantiates a Nest application, which is why a module missing an import passes both. esc/deploy/build-source-image.sh:113 uses `CID="$(docker create "${IMAGE_TAG}")"` and then only `docker cp` to read three compiled files (:147-157) — the image is never started, so the build does not boot it either. The fix now sitting uncommitted at packages/twenty-server/src/engine/core-modules/esc-onboarding/esc-onboarding.module.ts:23 (PermissionsModule, with a 4-line comment at :19-22) has no test that fails when it is removed: __tests__/esc-onboarding-off-by-default.spec.ts:13-39 asserts only three list memberships, and the two specs under services/__tests__/ are unit tests over mocked repositories. `git status --porcelain` in the checkout shows exactly one modified file, that module.

FAILURE:
Today's outage — "Nest can't resolve dependencies ... PermissionsService at index [0] is available in the EscOnboardingModule module" — passed typecheck and the whole esc-onboarding suite and was only discovered by production returning 502 for about an hour. The same class recurs the next time a guard, interceptor or injected provider is added to this module, and it takes the worker down too: queue-worker/queue-worker.module.ts:3,12 imports CoreEngineModule, which imports EscOnboardingModule at core-engine.module.ts:168.

FIX:
Add a spec that compiles the real graph — `Test.createTestingModule({ imports: [EscOnboardingModule] })` with the TypeORM datasource and cache providers overridden, asserting it resolves — and run it from verify.sh:81 alongside the existing jest invocation; mutation-test it by deleting the PermissionsModule import. Separately, have build-source-image.sh start the image against a throwaway Postgres and wait for /healthz before printing "Built and checked".

---
## [HIGH][ops-deploy-path] The outage was 16h41m, not "about an hour" — the premise every downstream decision is resting on is wrong by a factor of seventeen

EVIDENCE:
The failed server container's containerd shim is `5793e346a0f7f0c325d4bc3e30dbaeffb90ebd99bd1ff78181ecee99ec658a98`.
First appearance: `Sep 21 17:26:39 twenty-crm containerd[135]: ... msg="connecting to shim 5793e346..."`
Last appearance: `Sep 22 10:07:29 twenty-crm containerd[135]: ... msg="cleaning up dead shim" id=5793e346...`
`sudo journalctl -u containerd --since "2026-09-21 17:20" --until "2026-09-22 10:20" | grep -c "shim disconnected"` → **6302**.
Corroborated independently by the 17 hourly `502 Bad Gateway` probe lines in /root/twenty-ingest/logs/freshness.log, and by the sudo record: the last operator command on 21 Sep was `docker compose up -d` at 17:26:27, and the next command on the box was `docker logs --tail 40 twenty-esc-server-1` at 09:58:44 the following morning. Nothing ran in between.
Each restart cost `Consumed 13.4s CPU time, 761.8M memory peak` (systemd scope accounting, e.g. Sep 21 17:36:04).

FAILURE:
esc.crm.fiszu.com was 502 from 17:26 on 21 Sep to 10:07 on 22 Sep — through the whole working evening and the following morning's start of business — with the server container crash-looping 6,302 times under `restart: always`, each cycle burning ~13s CPU and ~760MB against a box that also hosts twenty-rc and twenty-ingest. Sizing the incident at "about an hour" understates the blast radius, hides that the failure survived an entire overnight period undetected, and makes the missing detector (finding 1) look like a nice-to-have rather than the reason the incident had that shape.

FIX:
Correct the incident record to 2026-09-21 17:26:39 → 2026-09-22 10:07:29 (16h41m, 6,302 restart cycles) and carry that number into the cutover decision. `restart: always` on a container that fails at Nest bootstrap is an infinite loop, not a recovery policy — it needs a failure ceiling or the detector in finding 1, preferably both.

---
## [HIGH][ops-deploy-path] The production CRM image exists in exactly one place on earth — CT175's local image store — and the compose has no pull_policy, so losing it means the stack cannot start at all

EVIDENCE:
`sudo docker images` on CT175: the fork images are bare local tags with no registry prefix — `twenty-esc-sso:v2.0.0-ssrf1` and `twenty-esc-src:v2.0.0-esc1`. Neither exists in any registry.
/root/twenty-esc/docker-compose.yml lines 4 and 42 pin `image: twenty-esc-sso:v2.0.0-ssrf1`; the file contains no `pull_policy` and no `build:` stanza (full file read).
The transfer tarball was deleted from the build host: CT140 sudo log, `Sep 21 16:26:11 p-amir ... COMMAND=/usr/bin/rm -f /root/twenty-esc-src.tgz`.
Proof of the consequence: the rollback at `Sep 22 09:58:57 ... PWD=/root/twenty-esc ... COMMAND=/usr/bin/docker compose up -d` did not restore service. It was followed by `09:59:51 docker images`, then `10:00:55 rm -rf /root/twenty-esc-rollback` + `git clone`, then `10:05:14 ... DOCKER_BUILDKIT=0 docker build -f Dockerfile.option-b -t twenty-esc-sso:v2.0.0-ssrf1`. /tmp/rb.log records the base image being fetched from Docker Hub — `Status: Downloaded newer image for twentycrm/twenty:v2.0.0` — and ends `Successfully built 341c371ebac5 / Successfully tagged twenty-esc-sso:v2.0.0-ssrf1`. `docker images` confirms today's image is that rebuild: `twenty-esc-sso:v2.0.0-ssrf1  341c371ebac5  2026-09-22 10:07:04`.

FAILURE:
The image production runs is not stored anywhere it can be recovered from — no registry, no saved tarball, no rebuild-from-pin that does not require network access to Docker Hub. When it went missing, `docker compose up -d` could not start the stack (compose with no `pull_policy` falls back to pulling a tag that exists in no registry), so the documented one-step rollback was inert and recovery took a fresh `git clone` plus a from-scratch rebuild — nine minutes of an already 17-hour outage, and only because Docker Hub happened to be reachable and still serving v2.0.0. It also means today's running image is a *different build* from the one that ran yesterday; it was never byte-compared to what it replaced.

FIX:
Push both fork images to an org-controlled registry and pin the compose to the registry reference, so the rollback is a pull rather than a rebuild. Until that exists, keep a `docker save` tarball of the current production image off CT175 and treat the box's local image store as a cache, not the master copy. Separately, for the cutover, a compose must preserve exactly: image tag (server+worker), the `server-local-data` volume mount at /app/packages/twenty-server/.local-storage, `3000:3000`, NODE_PORT, PG_DATABASE_URL, SERVER_URL=https://esc.crm.fiszu.com, REDIS_URL, STORAGE_TYPE=local, APP_SECRET (value present), ENTERPRISE_KEY=self-hosted-esc, ESC_SSRF_ALLOWED_HOSTS=192.168.103.175, IS_BILLING_ENABLED=false, the four API_RATE_LIMITING_* values, the six EMAIL_* values, the worker's `command: [yarn, worker:prod]` + DISABLE_DB_MIGRATIONS=true + DISABLE_CRON_JOBS_REGISTRATION=true, both `depends_on` condition blocks, the server healthcheck, and `restart: always` on all four services.

---
## [HIGH][boot-test-gap] The esc-onboarding migration will never run on CT175 — the entrypoint only runs TypeORM migrations when the `core` schema is absent, and it is not

EVIDENCE:
`packages/twenty-docker/twenty/entrypoint.sh:13-21`: `has_schema=$(psql -tAc "SELECT EXISTS (... schema_name = 'core')" ...)`; `if [ "$has_schema" = "f" ]; then yarn database:init:prod; fi`; then unconditionally `yarn command:prod cache:flush`, `yarn command:prod upgrade`, `yarn command:prod cache:flush`.
The only TypeORM migration run site in the entire server: `grep -rn "runMigrations(" packages/twenty-server/src` → `src/database/clickHouse/migrations/run-migrations.ts:79,136` (ClickHouse, unrelated) and `src/database/commands/run-instance-commands.command.ts:157 const migrations = await this.dataSource.runMigrations({transaction:'each'})`. That command is reachable only through `database:migrate:prod` / `database:init:prod` (`packages/twenty-server/package.json` scripts: `"database:init:prod": "node dist/database/scripts/setup-db.js && yarn database:migrate:prod --force --include-slow"`, `"database:migrate:prod": "node dist/command/command run-instance-commands"`). `yarn command:prod upgrade` is `UpgradeCommand` (`src/database/commands/upgrade-version-command/upgrade.command.ts:25-41`) → `UpgradeSequenceRunnerService` → `InstanceCommandRunnerService.runFast/SlowInstanceCommand` over the fixed `INSTANCE_COMMANDS` list (`src/database/commands/upgrade-version-command/instance-commands.constant.ts:19-35`) — it never calls `runMigrations`.
Production `/root/twenty-esc/docker-compose.yml` sets no `DISABLE_DB_MIGRATIONS` on the `server` service, and the `core` schema exists. Measured on CT175: `sudo docker exec twenty-esc-db-1 psql -U postgres -d default -c "select name, timestamp from core._typeorm_migrations order by timestamp desc limit 6"` → newest is `AddIsInitialToUpgradeMigration1775909335324`; `select to_regclass('core."escOnboarding"')` → empty; `select count(*) from core."escOnboarding"` → `ERROR: relation "core.escOnboarding" does not exist`. (This also confirms the 2026-09-21 deploy died in the entrypoint at `cache:flush`, before any migration — so `1790000100000-add-esc-onboarding.ts` has never executed on any database, anywhere.)

FAILURE:
The source image deploys, `/healthz` goes green, and `core."escOnboarding"` still does not exist. Nothing breaks until the first `escOnboardingState` query, which throws `relation "core.escOnboarding" does not exist` — a 500 on whatever page calls it, with a green deploy and a green healthcheck behind it. The migration's `up()` and `down()` have also never been executed, so their first run will be against production.

FIX:
Make the migration an explicit, asserted deploy step rather than an assumed side effect: run `docker compose exec server yarn database:migrate:prod` (or `docker compose run --rm server yarn database:migrate:prod`) as a named step in `esc/deploy/DEPLOY.md`, and follow it with a post-deploy assertion `psql -tAc $'select to_regclass(\'core."escOnboarding"\')'` that must return non-null. Prove the migration itself in the boot smoke test of finding 3, which runs it from scratch on an empty database, and add a second smoke run against a restored production dump so the existing-database path is exercised too — that is the path CT175 actually takes and the one this finding is about.

---
## [HIGH][boot-test-gap] An integration suite that boots the real Nest graph exists and would have caught today's failure, but the gate never runs it and cannot

EVIDENCE:
`packages/twenty-server/test/integration/utils/create-app.ts:51-56` — `Test.createTestingModule({ imports: [AppModule, JobsModule, MessageQueueModule.registerExplorer()], ... })`, compiled at line 81 and `await app.init()` at line 108. `test/integration/utils/setup-test.ts:9-20` is the jest `globalSetup` and calls `createApp({})` before any spec runs, so ANY integration spec failing to boot fails the whole run. `find test/integration -name '*.integration-spec.ts' | wc -l` → 372. The runner is declared: `packages/twenty-server/project.json:21-38`, target `test:integration`, command `NODE_ENV=test NODE_OPTIONS="--max-old-space-size=12288 --import tsx/esm" nx jest --config ./jest-integration.config.ts` (with a `with-db-reset` configuration that runs `nx database:reset` first).
`verify.sh` never invokes it — the only jest it runs is `npx jest esc-onboarding` (line 81), and even that is skipped when `node_modules` is absent (lines 79, 84-87). `REPO-CONTRACT.toml:107-118` declares `toolchains = ["none"]` and states the gate "deliberately does not reproduce upstream's monorepo CI".

FAILURE:
The one existing mechanism in this repo that resolves the real module graph is unreachable from the gate: it needs `node_modules`, a Postgres, a Redis and a reset test database, none of which the shared gate runner has. So the repo owns a DI-catching test it can never run, and the absence is not visible in any gate output.

FIX:
Do not try to put `test:integration` on the gate runner — the payload has no node_modules and no datastores, and `verify.sh` would just grow a third loud skip. Put the equivalent coverage where the dependencies already exist: the boot smoke test of finding 3, run on the build host against the built image, which needs no node_modules at all. Separately, record in `REPO-CONTRACT.toml` that `npx nx test:integration twenty-server` is the fork's DI-resolving suite and that the image boot test is the gate-side stand-in, so the next person does not re-discover this.

---
## [MEDIUM][image-parity] The image is built `FROM node:24-alpine`, a moving tag — the source build silently shipped Node 24.21.0 where production runs 24.15.0, and cannot be rebuilt identically

EVIDENCE:
packages/twenty-docker/twenty/Dockerfile:5 `FROM node:24-alpine AS common-deps` and :77 `FROM node:24-alpine AS twenty` — no digest pin, no patch version.

`sudo docker image inspect ... --format '{{json .Config}}'` on CT175:
  LIVE twenty-esc-sso:v2.0.0-ssrf1 -> "NODE_VERSION=24.15.0"
  SRC  twenty-esc-src:v2.0.0-esc1  -> "NODE_VERSION=24.21.0"
The live image inherits 24.15.0 from twentycrm/twenty:v2.0.0, which upstream built against; our source build pulled whatever `node:24-alpine` resolved to on 2026-09-21 (confirmed in /root/twenty-esc-build2.log, `Step 1/68 : FROM node:24-alpine AS common-deps ---> ebfe2f904627`).

This is the one substantive runtime difference left after checking the rest: Entrypoint, Cmd, WorkingDir, ExposedPorts, Volumes and Labels are identical; the node_modules package sets are identical (1492 vs 1492 once workspace symlinks and dotfiles are accounted for); the frontend is complete (727 assets, index.html, manifest.json) and its REACT_APP_SERVER_BASE_URL is rewritten at runtime from SERVER_URL, so the empty build arg is harmless; sharp built successfully with its native binary present at node_modules/sharp/build/Release/sharp-linuxmusl-x64.node in both; canvas failed to build (probe-deps.log: `canvas@npm:3.1.0 couldn't be built successfully (exit code 1)`) but is absent from BOTH images' production node_modules, so it cannot matter at runtime.

FAILURE:
Six Node patch releases separate the runtime production is proven on from the runtime the new image carries, and nobody chose that — it was decided by whatever Docker Hub was serving on the build day. If the image is rebuilt to pick up the PermissionsModule fix, it will land on a third, different Node, so a rollback to "the same image" is not reproducible from the repo, and any Node-level regression (TLS, OpenSSL, V8, timers under Nest/TypeORM) appears as an unexplained behaviour change with no diff to point at. The build script goes to real lengths to refuse a dirty tree "because an image built from it cannot be traced to a commit" — and then leaves the base image untraceable.

FIX:
Pin the base image by digest in both FROM lines, at the version production is already proven on: `FROM node:24-alpine@sha256:<digest for 24.15.0> AS common-deps` and the same for the `twenty` stage. Record the digest in esc/deploy/DEPLOY.md and bump it as a deliberate, separately-tested change. As this Dockerfile is an upstream file, carry the pin as an entry in the esc/ overlay rather than editing the upstream path on the trunk.

---
## [MEDIUM][flag-off-behaviour] advanceEscOnboardingStep rejects the wizard's final step: nextStep is optional but validated as required

EVIDENCE:
packages/twenty-server/src/engine/core-modules/esc-onboarding/dtos/advance-esc-onboarding-step.input.ts:15-18 declares `@Field(() => String, { nullable: true }) @IsString() @MaxLength(128) nextStep?: string;` with no @IsOptional(). packages/twenty-server/src/engine/core-modules/graphql/pipes/resolver-validation.pipe.ts:33 calls `validate(object)` with no options, so skipMissingProperties is false, and :40-42 throws UserInputError on any error. The service expects the field to be absent: esc-onboarding.service.ts:105 and :109 both use `currentStep: nextStep ?? null`. Every sibling optional input in the codebase pairs the type check with @IsOptional() — e.g. engine/core-modules/api-key/dtos/update-api-key.input.ts:22,27,31 and engine/core-modules/admin-panel/dtos/set-maintenance-mode.input.ts:21.

FAILURE:
Calling advanceEscOnboardingStep with `{ completedStep: "<last-step>" }` and no nextStep — which is exactly what the last step of the script does — fails validation with "nextStep must be a string" and the step is never recorded. Passing nextStep: null explicitly fails the same way. Only intermediate steps work.

FIX:
Add `@IsOptional()` immediately above `@IsString()` on nextStep in advance-esc-onboarding-step.input.ts.
