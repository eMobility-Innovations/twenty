# The ESC guided tour ("Tour" in the CRM sidebar)

Redmine [#19873](https://redmine.fiszu.com/issues/19873).

> The filename says *wizard* for history's sake. The thing that ships is a **tour**. What the
> wizard was, and why it was dropped, is recorded at the bottom — the reasoning is worth keeping.

## What ships

A **Tour** entry at the top of the "Other" section of the Twenty CRM sidebar. Anybody can press
it, at any time, as often as they like. Pressing it darkens the page, puts a spotlight on one
thing at a time and a popover beside it explaining what that thing is for, and walks forward
through a short script until the person closes it or reaches the end.

Nine steps, in this order (`esc/new/packages/twenty-front/src/modules/esc-tour/constants/escTourSteps.ts`):

| # | Step | What it points at |
|---|------|-------------------|
| 1 | Welcome to the CRM | nothing — centred, no anchor |
| 2 | Everything starts here | the sidebar itself |
| 3 | People | `a[href="/objects/people"]` |
| 4 | Companies | `a[href="/objects/companies"]` |
| 5 | Orders | `a[href="/objects/orders"]` |
| 6 | Repairs | `a[href="/objects/repairs"]` |
| 7 | Interactions | `a[href="/objects/interactions"]` |
| 8 | Tasks | `a[href="/objects/tasks"]` |
| 9 | That is the tour | nothing — centred, no anchor |

The copy is data, not JSX, so a wording change is a one-line edit to a plain string.

## What it deliberately does NOT do

Operator decision, 2026-09-22:

> "we can skip the database table and the flags of who is onboarded and who's not and we can
> easily do a button in the sidebar of Twenty CRM and when people click on it, it walks them
> through the onboarding"

So, concretely:

- **No database table.** Nothing is created, migrated or read.
- **No per-user flags.** Nobody is "onboarded" or "not onboarded".
- **No record of who took it**, when, or how far they got. No telemetry, no mutation, no API
  call. The tour reads the DOM and paints over it, and that is all it does.
- **No feature flag.** It is on for everyone the moment the image is deployed. There is nothing
  to turn on.

The consequence is worth stating plainly: nobody can ever report on tour completion, because
that fact is not stored anywhere. If that is ever wanted it is new work, not a setting.

## Where the code lives

ESC-owned code, which upstream has never seen, added by `esc/new/` and copied into `packages/`
at build time by `esc/esc-apply.sh`:

```
packages/twenty-front/src/modules/esc-tour/
├── components/EscTourNavigationDrawerItem.tsx   the sidebar button
├── components/EscTourOverlay.tsx                the spotlight + popover
├── constants/escTourSteps.ts                    the script (the table above)
├── constants/escTourStylesheet.ts               the overlay's own CSS
├── hooks/useEscTour.ts                          the controller
├── types/EscTourStep.ts
├── utils/computeEscTourPlacement.ts             where the popover goes
├── utils/resolveEscTourAnchor.ts                finding a step's target in the DOM
└── __tests__/                                   six suites, jest + @testing-library/react
```

Exactly **one** upstream file is overlaid, because Twenty has no extension point for a sidebar
entry — `NavigationDrawerOtherSection` renders a fixed list and nothing reads a registry:

```
esc/overlay/packages/twenty-front/src/modules/navigation/components/NavigationDrawerOtherSection.tsx
```

One import, one element. Two hunks against upstream, nothing else in the file touched.

## The five properties that are contract, not detail

1. **No new npm dependency.** Not one. A tour library would mean a permanent `package.json` and
   `yarn.lock` divergence to reconcile on every upstream sync, and neither file is allowlisted
   by `verify.sh`'s fork-scope check.
2. **Anchors are ROUTES, never generated class names.** A linaria hash is an artefact of the
   build and changes without anybody deciding it should. `escTourSteps.test.ts` fails if an
   anchor ever starts with a class selector.
3. **A missing anchor skips its step, and says so by name.** `selectShowableEscTourSteps`
   resolves the script once when the tour opens, drops the steps whose target is not on the
   page, and returns their ids to be logged. Without this a renamed route makes the tour
   quietly shorter, which looks exactly like a tour that works.
4. **The tour changes no data.** No mutation, no API call, nothing recorded.
5. **It owns its CSS rather than using linaria.** Linaria is a build-time transform — a
   component built from `@linaria/react` cannot be rendered in a unit test at all, because
   twenty-front's jest config carries no linaria transform. Using it would leave the overlay,
   the part a person actually sees, permanently untestable. The overlay lives in a portal on
   `document.body` and shares no tokens or stacking context with the product's surfaces, so it
   loses nothing by injecting one stylesheet, once, by id.

Animation stays on `transform`, `opacity` and `clip-path`. No width/height/top/left animation.

## How it is delivered

A **front-only image layer**: the frontend is rebuilt from this checkout with the overlay
applied and laid over the existing ESC image as a single `COPY` into
`/app/packages/twenty-server/dist/front`. **The server binary is not recompiled** — it is
inherited from the base image, so the enterprise bypass and the SSRF allowlist come along
untouched, and the Nest dependency-injection fault that took the CRM down for 16h41m on
2026-09-21 cannot be reintroduced by this image.

Full procedure, with the exact commands: **[`esc/deploy/DEPLOY.md`](../esc/deploy/DEPLOY.md)**,
section *2026-09-22c*. Patch rationale: **[`scripts/PATCH_MANIFEST.md`](../scripts/PATCH_MANIFEST.md)**,
Category 3.

## Checks

| Check | What it proves |
|---|---|
| `./verify.sh` (gate `esc-tour`) | the tour suite passes and the overlay was restored out of `packages/` |
| `./scripts/verify-esc-tour.sh --image <tag>` | the compiled tour is in the bundle the image serves |
| `./scripts/verify-esc-tour.sh --container twenty-esc-server-1` | the same, against what is running |
| a person clicking **Tour** in a browser | that it *runs* — nothing that greps a bundle can prove this |

The `esc-tour` gate in `verify.sh` has to apply the overlay into `packages/` to run the suite,
so it refuses on a dirty tree, restores under a trap, and fails if the tree is not clean
afterwards. With no `node_modules` it runs the suite inside the front-build image
(`esc-front-build:tour2` by default) rather than skipping — no checkout carries twenty-front's
dependencies and the shared gate runner does not install them, so before that it had skipped on
every host it had ever run on.

---

## What the design WAS, and why it was replaced

Until 2026-09-22 this was a stored-state wizard: a `core."escOnboarding"` table keyed on the
Keycloak `sub`, a row provisioned on first authenticated request, step-level progress so a
refresh resumed instead of restarting, a `scriptVersion` that forced a replay after a release,
an API to read/advance/complete/reset, and an admin reset. That was W1–W6 of the ticket.

**Why it was dropped — the part worth keeping.** A preflight on 2026-09-22 found the table would
have shipped **dead on arrival, with no boot-time symptom**. The image entrypoint runs
`yarn database:init:prod` — the only code path in the server that executes TypeORM migrations —
**only when the `core` schema is absent.** On CT175 it is not. Every other boot runs
`yarn command:prod upgrade`, which builds its sequence purely from `@RegisteredInstanceCommand` /
`@RegisteredWorkspaceCommand` bundles and never reaches TypeORM. Measured on production that day:
`core._typeorm_migrations` held 182 rows topping out at `1775909335324`, and
`to_regclass('core."escOnboarding"')` was `NULL`.

That was fixable — the table was re-shipped as a fast instance command as well — but it made the
cutover the largest obstacle in front of the feature. The operator's answer removed the obstacle
by removing the feature it belonged to: with no table there is nothing for the migration path to
fail to run.

**The W1–W6 backend code is still on the trunk.** It was not reverted. It is unused and
unreachable: it sits behind the workspace feature flag `IS_ESC_ONBOARDING_WIZARD_ENABLED`, which
has no row anywhere, so `FeatureFlagService.isFeatureEnabled` reads `false` for every workspace.
Three things could write such a row by themselves — `DEFAULT_FEATURE_FLAGS`,
`PUBLIC_FEATURE_FLAGS` and the dev seeder — the flag is in none of them, and
`esc-onboarding/__tests__/esc-onboarding-off-by-default.spec.ts` fails if it is ever added to
any of them. Turning it on would be a deliberate act: the admin-panel
`upsertWorkspaceFeatureFlag` mutation, per workspace.

Two smaller facts from that work, kept because they will otherwise be rediscovered the hard way:

- Twenty matches an SSO login to an account **by email** and keeps no column for the
  identity-provider subject. The wizard dug the `sub` out of `core.connectedAccount.oidcTokenClaims`
  (JSONB) and gave a user who had never signed in through Keycloak a namespaced synthetic
  `local:<userId>`.
- Never run `npx nx run twenty-server:database:migrate:prod` against a deployed instance: `nx` is
  absent from the production image, so it attempts a network fetch on a production box. The
  in-container form is `yarn database:migrate:prod`.
