# ESC self-onboarding wizard

Redmine [#19873](https://redmine.fiszu.com/issues/19873). An in-product wizard that walks every
person through the CRM once, on screen, and remembers where they got to.

**It is off.** The wizard is behind the workspace feature flag
`IS_ESC_ONBOARDING_WIZARD_ENABLED`, which has no row anywhere, so it reads `false` for every
workspace. Nothing renders and no mutation is reachable until somebody turns it on deliberately.
That state is held by tests, not by good intentions — see *Staying off*, below.

## What is built so far

| Ticket | What | State |
|--------|------|-------|
| W1 | `core.escOnboarding` table + migration, keyed on the Keycloak `sub` | built |
| W2 | A row is provisioned on the first authenticated request, idempotently | built |
| W3 | Step-level progress, so a refresh resumes instead of restarting | built |
| W4 | `scriptVersion` + forced replay after a release | built |
| W5 | API: read own state, advance a step, complete, reset | built |
| W6 | Admin: reset one user, reset everyone left on an older script | built |
| W7–W19 | The front end (spotlight, anchors, interaction lock, scripts, telemetry, watchdog) | not started |

Nothing here has been run against a database yet, and nothing is deployed.

## The identity key, and why it is awkward

The ticket locks the key to the Keycloak `sub`, because an email key breaks the day someone's
address changes — the `@remotecrew.co.uk` → `@rc.fiszu.com` contractor migration did exactly that
to a join in `sling-sync`.

Twenty does not make that easy. It matches an SSO login to an account **by email**
(`auth-sso.service.ts` → `userService.findUserByEmail`) and keeps no column for the
identity-provider subject. It does store the whole claims object, as JSONB, on the connected
account it creates at sign-in (`core.connectedAccount.oidcTokenClaims`).

So `EscOnboardingIdentityService` digs the `sub` back out of that blob. A user who has never
signed in through Keycloak — a password login, a dev seed — has no claims at all, and is given a
namespaced synthetic subject `local:<userId>` rather than being refused a row. A real Keycloak
subject can never collide with that prefix.

The email is stored beside it as a display label and is refreshed when it changes. It is never
joined on.

## The table

`core.escOnboarding`, primary key `keycloakSub`, with a unique index on `userId` — the request
carries a Twenty user id, so that is the lookup, while the key stays the stable identity.

## Forced replay after a release

`ESC_ONBOARDING_SCRIPT_VERSION` lives in code. A row whose `scriptVersion` is below it reads as
not-onboarded, so bumping the constant replays the wizard for everyone on their next visit without
a data migration. `resetEscOnboardingForEveryone` does the same eagerly.

## Staying off

`FeatureFlagService.isFeatureEnabled` returns `false` for a key with no row, so "off for everyone"
holds exactly as long as nothing writes a row by itself. Three things could:

- `DEFAULT_FEATURE_FLAGS` — written at workspace creation
- `PUBLIC_FEATURE_FLAGS` — makes a flag self-enablable from Settings → Lab
- the dev seeder — writes rows per seeded workspace

The flag is in none of them, and `esc-onboarding/__tests__/esc-onboarding-off-by-default.spec.ts`
fails if it is ever added to any of them. Turning the wizard on is therefore a deliberate act:
the admin-panel `upsertWorkspaceFeatureFlag` mutation, per workspace.

## Files this fork adds to upstream paths

Everything is one directory apart from two single-line edits, which is what keeps an upstream merge
survivable:

- `packages/twenty-server/src/engine/core-modules/esc-onboarding/**` — the whole module
- `packages/twenty-server/src/database/typeorm/core/migrations/common/1790000100000-add-esc-onboarding.ts`
- `packages/twenty-shared/src/types/FeatureFlagKey.ts` — one enum member added
- `packages/twenty-server/src/engine/core-modules/core-engine.module.ts` — one import, one list entry
- `packages/twenty-server/src/engine/twenty-orm/entity-manager/workspace-entity-manager.spec.ts` — one line; its `featureFlagsMap` literal is typed `Record<FeatureFlagKey, boolean>`, so adding any flag forces it

## Running it

```bash
npx nx typecheck twenty-server
cd packages/twenty-server && npx jest esc-onboarding
npx nx run twenty-server:database:migrate:prod   # applies the migration
```
