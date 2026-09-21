# 2026-09-21 — Self-onboarding wizard: the backend, off behind a flag

## Status

**IN-PROGRESS.** W1–W6 of Redmine [#19873](https://redmine.fiszu.com/issues/19873) are built,
tested and pushed to `esc/onboarding-wizard` as PR
[#17](https://github.com/eMobility-Innovations/twenty/pull/17). Nothing is merged, nothing is
deployed, and the wizard is off for every workspace by construction. W7–W19 — the entire front
end — are not started.

## What was done

Commit `c0b8bb7a` on branch `esc/onboarding-wizard`, taken off `origin/emobility-unity` at
`73799532`, in the worktree `~/Projects/twenty-onboarding-wizard`.

| Ticket | What |
|--------|------|
| W1 | `core.escOnboarding` + migration `1790000100000-add-esc-onboarding.ts`. Primary key `keycloakSub`, unique index on `userId`. |
| W2 | `EscOnboardingService.provision` — called on every read, inserts once, `orIgnore` so a concurrent first request cannot make two. |
| W3 | `completedSteps` (jsonb) + `currentStep`, so a refresh resumes. |
| W4 | `scriptVersion`; a row below `ESC_ONBOARDING_SCRIPT_VERSION` reads as not-onboarded. |
| W5 | Query `escOnboardingState`; mutations `advanceEscOnboardingStep`, `completeEscOnboarding`, `resetEscOnboarding`. |
| W6 | `resetEscOnboardingForUser`, `resetEscOnboardingForEveryone`, behind `SettingsPermissionGuard(SECURITY)`. |

Also: the `IS_ESC_ONBOARDING_WIZARD_ENABLED` flag, a targeted `esc-onboarding` gate added to
`verify.sh`, and [`../esc-onboarding-wizard.md`](../esc-onboarding-wizard.md) as the feature's
own doc.

Green, on this workstation: `nx typecheck twenty-server`; `jest esc-onboarding` (23 tests,
3 suites); `oxlint --type-aware` (0/0); `prettier --check`; `./verify.sh`.

Run against a database: **nothing**. The migration has never been applied anywhere.

## Decisions & rationale — do not re-open

1. **The branch was taken off `emobility-unity`, not `main`.** The fork has no `main` branch;
   `emobility-unity` is `origin/HEAD` and `docs/UPSTREAM-DIVERGENCE.md` names it as the default.
   Upstream `twentyhq/twenty` `main` would have discarded the fork's SSO and SSRF work.
2. **The wizard is NOT in `esc/overlay/`, despite the ticket saying so.** `esc/` is not on the
   trunk at all — it exists only on the unmerged branch `esc/ssrf-allowlist-for-interest-refresh`.
   Its design is patched *copies of upstream files at their upstream paths*, copied over the
   working tree by `esc-apply.sh`: a mechanism for modifying upstream files. New files gain
   nothing from it (a new file cannot conflict on a merge) and lose a great deal — code staged
   under `esc/` is invisible to nx, tsc, jest and lint. The wizard is instead one self-contained
   directory at the normal package path, with three upstream files carrying one forced line each,
   all listed in `docs/UPSTREAM-DIVERGENCE.md`. This was reported to the operator; if they want it
   moved, move it.
3. **The `sub` is read out of `core.connectedAccount.oidcTokenClaims`.** Twenty stores no column
   for the identity-provider subject. It does store the whole claims object as JSONB on the
   connected account it creates at SSO sign-in, which is the only durable copy.
4. **A user with no OIDC claims gets `local:<userId>`, not a refusal.** Password logins and dev
   seeds have no claims. Blocking them would contradict "no user can reach the CRM without a row".
   The prefix is namespaced so a real Keycloak subject can never collide.
5. **`escOnboardingState` is not flag-gated.** The front has to be able to ask whether the wizard
   is on. A guard that threw would make "off" look like a broken page. The mutations are gated.

## Next steps

1. **Decide how this deploys.** CT175 runs `twentycrm/twenty:v2.0.0` with compiled patches applied
   by a thin image (Option B, `esc/deploy/DEPLOY.md`). That route patches the compiled upstream
   release and **cannot carry a new backend module**. Nothing here can ship until CT175 moves to a
   full source build (Option A). Operator decision — it changes how the CRM is built and rolled back.
2. **Merge PR #17** once (1) is settled, or sooner — it is inert either way.
3. **Apply the migration** against a real database and watch a row appear on a real first request.
   Nothing here has met a database.
4. **W7–W11**: tour engine choice, the spotlight/backdrop primitive, the anchor registry, the
   interaction lock, and the pilot role's script. That is the next coherent slice.
5. **W18's watchdog must be SEEN to fire** against a held-open red condition before this ticket
   can close. Not started.

## How to resume

```bash
cd ~/Projects/twenty-onboarding-wizard      # the worktree; branch esc/onboarding-wizard
git fetch origin && git log --oneline -1    # expect c0b8bb7a or later
yarn install                                # ~14 min; canvas fails to build, harmless here
./verify.sh                                 # runs typecheck + the wizard suite
cd packages/twenty-server && npx jest esc-onboarding --config=jest.config.mjs
```

Read [`../esc-onboarding-wizard.md`](../esc-onboarding-wizard.md) first — it is the feature's
own doc and says what is built, what keeps it off, and which upstream files it touches.

To turn the wizard on for one workspace (**do not, without the operator's word**): the admin
panel's `upsertWorkspaceFeatureFlag` mutation, key `IS_ESC_ONBOARDING_WIZARD_ENABLED`.

## Gotchas / anti-patterns

- **`yarn install` is needed and takes ~14 minutes**; the worktree does not share `node_modules`
  with `~/Projects/twenty`. `canvas@3.1.0` fails to build on macOS — it is a Storybook dependency
  and does not affect the server's typecheck or tests.
- **Adding any `FeatureFlagKey` member breaks `workspace-entity-manager.spec.ts`**, whose
  `featureFlagsMap` literal is typed `Record<FeatureFlagKey, boolean>`. Only a typecheck catches
  it; the tests pass without the fix.
- **`isNonEmptyString` is not exported from `twenty-shared/utils`**, although the repo's own
  `CLAUDE.md` says to use it. `isDefined` and `isNonEmptyArray` are.
- **`verify.sh`'s fork-scope check refuses any new application path** until it is allowlisted AND
  carries a targeted gate. That is deliberate. Widen it in the same commit as the code, and say in
  the comment why the predicate moved.
- **Do not run the oxlint step without `nx build twenty-oxlint-rules` first** — the config loads
  a plugin from that package's `dist/`, and oxlint fails to parse its own config without it.
- The ticket's "Traps already known" section says the local clone has no `upstream` remote. It was
  added to `~/Projects/twenty` in this session (`https://github.com/twentyhq/twenty.git`), but it
  has not been fetched.
