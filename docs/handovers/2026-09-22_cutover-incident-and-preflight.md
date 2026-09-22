# 2026-09-22 — The cutover that took the CRM down for 16h41m, and the 20 things that must be true before the next one

## Status

**BLOCKED, deliberately.** The self-onboarding wizard backend (Redmine
[#19873](https://redmine.fiszu.com/issues/19873), W1–W6) is on the fork's trunk and inert. Moving
CT175 from the compiled-patch image to a source build was attempted, **failed, and left
`esc.crm.fiszu.com` returning 502 for 16 hours 41 minutes**. It has been rolled back; the CRM is
healthy. A 116-agent preflight then found **seven blockers**, five of them the same fact. Nothing
goes near CT175 until the checks below are green.

The production database was never migrated — the server died before that step. Data is untouched.

## The incident

### Timeline, measured

| When (UTC) | What |
|---|---|
| 2026-09-21 16:26 | `twenty-esc` cut over to `twenty-esc-src:v2.0.0-esc1`. Nest refuses to boot. |
| 16:26 → 09:07 | 502 throughout. `restart: always` crash-loops the container all night. |
| hourly | The freshness watchdog probes the CRM, gets 502 **17 consecutive times**, alerts nobody. |
| 2026-09-22 09:07 | Rolled back. CRM healthy. |

**16h41m** — the whole working evening and the first hour of business.

### Cause

`EscOnboardingModule` did not import `PermissionsModule`, which the
`SettingsPermissionGuard(PermissionFlagType.SECURITY)` on `EscOnboardingAdminResolver` injects.

> A guard's dependencies are resolved in the module that **declares** the resolver, not in the
> module where the guard is defined.

### Why nothing caught it

`nx typecheck twenty-server`, 23 unit tests, `oxlint --type-aware`, `prettier --check` and
`./verify.sh` were all green. **None of them boots a Nest module graph.**
`esc/deploy/build-source-image.sh` greps three files *inside* the image — it proved the module was
compiled in, which was true, and proved nothing about whether the server starts.

*"The tests pass" and "the image contains the code" are not the same claim as "it runs".*

### Two corrections to my own earlier reporting

1. **I first reported this as "about an hour."** Wrong by a factor of seventeen. I read the
   timestamp on a crash-loop log line and took it for the start of the outage. The number above is
   measured from the failed container's shim lifetime and corroborated independently by the 17
   hourly probe failures.
2. **I said "something on CT175 prunes images."** Not established. Every cron, systemd timer,
   deploy script and the daemon config were enumerated and none contains a prune or `rmi`. The
   deletion of `twenty-esc-sso:v2.0.0-ssrf1` and `twentycrm/twenty:v2.0.0` is **unattributed**,
   which is worse than a pruner: the host cannot say who removed an image, and the sudo log is not
   a complete record of root activity on that box.

### Recovery

Rebuilt the rollback image from `esc/deploy/Dockerfile.option-b` — possible only because PR #18 had
landed the overlay on the trunk hours earlier the same day. Before that, the image production ran
was not reproducible from anything on the trunk.

Restoration proven: `/healthz` 200 ×3 from the public hostname, `/` 302 (the SSO edge), server
healthy, worker up, enterprise bypass and `ESC_SSRF_ALLOWED_HOSTS` both present in the running
container, and `twenty-ingest` reaching the CRM (`/healthz` 200, `/rest/orders` 403 — auth
rejecting an empty token, so the service is alive). Pre-cutover dump at
`/root/twenty-esc-db-snapshot_20260921_160858_precutover.sql.gz`, gzip-verified, 196,952 lines.

## What the preflight found

Six independent read-only lenses, every finding put to three refuters with distinct angles, each
told to default to *refuted* when uncertain. **36 raised, 20 survived, 16 refuted. 116 agents, no
errors.**

Full text: [findings](../preflight/2026-09-22_source-build-findings.md) ·
[plan](../preflight/2026-09-22_source-build-plan.md) ·
[critic](../preflight/2026-09-22_source-build-critic.md)

### The seven blockers

**1–4. The migration never runs on CT175.** Four lenses found this independently. The image
entrypoint runs `yarn database:init:prod` **only when the `core` schema is absent**, and it is not;
`yarn command:prod upgrade` builds its sequence purely from `@RegisteredInstanceCommand` /
`@RegisteredWorkspaceCommand` bundles and never reaches TypeORM. Measured live:
`core._typeorm_migrations` holds 182 rows topping out at `1775909335324`, and
`to_regclass('core."escOnboarding"')` is NULL. So the wizard would ship **dead on arrival** with no
boot-time symptom — a deploy that looks entirely successful, where the first call to any wizard
resolver throws `relation "core.escOnboarding" does not exist`. The fix is to ship the table as a
registered instance command, or to make the migration an explicit, asserted step of the deploy.

**5. The source overlay patches one of the four enterprise methods that production patches.**
`patch-enterprise.cjs` overrides four; `esc/overlay/…/enterprise-plan.service.ts` overrides
`isValid()` only. A source build therefore **puts the "enterprise key no longer valid" banner back
in front of every user**. This is the one that would have been noticed by people, immediately.

**6. My own build gate's most important check cannot fail.** It greps the whole compiled file for
`return true` — a string upstream already ships twice. It would pass on an image with no enterprise
patch at all. (Yesterday the same function had the opposite bug, a `pipefail`/SIGPIPE false
*negative*, fixed in PR #21. The check has now been wrong in both directions.)

**7. Nothing boots the image before it is deployed**, and `verify.sh`'s only two code-touching
gates skip themselves on the gate runner.

### The rest

Four more at HIGH about the same gap from different angles, plus: `advanceEscOnboardingStep`
**rejects every call that omits `nextStep`** (missing `@IsOptional()`, so the final step of every
wizard run fails validation); `build-source-image.sh` refuses to run twice in one checkout because
its dirty-tree guard fires on the overlay it wrote itself; the CRM image exists in exactly one
place on earth with no registry and no `pull_policy`; `twenty-ingest-app-1` is joined to
`twenty-esc_default`, so a `compose down` reaches into a second stack; the server healthcheck has
no `start_period`; and the image is built `FROM node:24-alpine`, a moving tag that silently shipped
Node 24.21.0 where production runs 24.15.0.

**An integration suite that boots the real Nest graph already exists.** It would have caught the
outage. The gate never runs it and cannot.

### What the critic caught in the plan

The plan is not trustworthy as written, and the critic says why:

- **Its grep anchors return 0 on a correct source image.** `isValid() { return true;` exists in
  production only because the compiled patch injects it onto the signature line; `nest build`
  pretty-prints, so a source build emits it across three lines. The plan's prescribed check would
  refuse every correct build. **Option A and option B produce different compiled text for identical
  semantics, so no grep can verify both — the equivalence check has to be behavioural.**
- **Nobody opened the frontend.** Production's `dist/front` is 22.9 MB / 921 files. Every check in
  the plan, the build script and `verify-esc-image.sh` is server-side, and `/healthz` never renders
  a component. The server can boot green and the CRM still serve a broken bundle.
- **The smoke environment is not production's**, so a DI fault on the SMTP path would boot green in
  smoke and kill CT175 — exactly the failure class that caused the outage.
- **The watchdog remedy is aimed at the wrong defect.** Its only identifying column is `job`, and
  every row names an ingest job, never the CRM. The real problem is attribution, not absence — and
  the table clears itself on recovery, so re-checking gives a different answer each time.

## Decisions & rationale — do not re-open

1. **Branch off `emobility-unity`, not `main`.** The fork has no `main`.
2. **The wizard lives at the normal package path, not under `esc/`** — operator, 2026-09-22.
3. **The wizard keys on the Keycloak `sub`**, dug out of `core.connectedAccount.oidcTokenClaims`,
   because Twenty matches SSO logins by email and stores no subject column.
4. **`escOnboardingState` is not flag-gated** — the front must be able to ask whether the wizard is
   on, and a guard that threw would make "off" look like a broken page.
5. **Do not build on CT175.** 8 GB RAM, 8 cores, ~20 GB free, running production Postgres, Redis
   and two CRM stacks, against a frontend build that asks for an 8 GB Node heap. Build on CT140.
6. **Cut over with `docker compose up -d`, never `down`** — `twenty-ingest-app-1` shares
   `twenty-esc_default`.

## Next steps, in order

1. **Fix the migration path** (blockers 1–4). Decide between a registered instance command and an
   explicit asserted deploy step; the former is what `upgrade` actually executes.
2. **Extend the source overlay to all four enterprise methods** (blocker 5), and extend
   `scripts/verify-esc-features.sh`, `scripts/esc-modified-files.txt` and
   `scripts/PATCH_MANIFEST.md` with them — the critic notes the plan forgets all three.
3. **Replace the grep-based image check with a behavioural one** (blocker 6, critic gap 1): query
   `hasValidEnterpriseKey`, `hasValidSignedEnterpriseKey`, `hasValidEnterpriseValidityToken` and
   `getSubscriptionStatus` over GraphQL against each image.
4. **Add a boot smoke test** (blocker 7) that starts the image with **production's real env**
   (`docker inspect twenty-esc-server-1 --format '{{range .Config.Env}}…'`), against a throwaway
   Postgres and Redis, and asserts `/healthz`. Then prove it fails on the pre-fix image.
5. **Compare `dist/front`** between the two images before any swap (critic gap 2).
6. **Pin the base image** to a digest, not `node:24-alpine`.
7. Only then retry the cutover, with the rollback image saved off the box first.

## How to resume

```bash
cd ~/Projects/twenty                      # trunk: emobility-unity
git fetch origin && git log --oneline -1 origin/emobility-unity
```

Read in this order: this file → [the findings](../preflight/2026-09-22_source-build-findings.md) →
[the critic](../preflight/2026-09-22_source-build-critic.md) → [the plan](../preflight/2026-09-22_source-build-plan.md).
The plan is last on purpose; the critic tells you which parts of it are wrong.

Production, read-only: `pangolin ssh esc-blades-ct175.ssh -- 'sudo docker ps'`.
Build host: `pangolin ssh esc-blades-ct140.ssh`, repo at `/root/twenty-esc-src`.

The feature flag stays off. Turning it on is the admin panel's `upsertWorkspaceFeatureFlag`
mutation, per workspace, and **nobody does that without the operator's word**.

## Gotchas / anti-patterns

- **A gate that never boots the thing is not a gate.** Five green checks and a clean image are not
  evidence that a server starts.
- **Do not read one log timestamp and call it an outage window.** `restart: always` means the
  newest error line is the latest restart, not the first.
- **Do not name a cause you have not read on the subject itself.** "Something prunes images" was a
  guess that survived two of my own messages before an agent disproved it.
- `yarn install` takes ~14 minutes and the worktree does not share `node_modules`. `canvas` fails
  to build on macOS; harmless for the server.
- Adding any `FeatureFlagKey` member breaks `workspace-entity-manager.spec.ts`, whose
  `featureFlagsMap` literal is typed `Record<FeatureFlagKey, boolean>`. Only a typecheck catches it.
- `isNonEmptyString` is **not** exported from `twenty-shared/utils`, though the repo's `CLAUDE.md`
  says to use it.
- Run `nx build twenty-oxlint-rules` before oxlint, or it cannot parse its own config.
- `verify.sh`'s fork-scope check refuses any new application path until it is allowlisted **and**
  carries a targeted gate. That is deliberate.

## Not started — each needs its own ticket

1. The freshness watchdog cannot alert on a probe failure; and its firing table identifies only the
   *job*, never the CRM, so attribution is the real defect.
2. The production CRM image is stored only in one host's local docker image store.
3. Image deletion on CT175 is unattributable.
