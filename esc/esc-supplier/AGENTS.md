# AGENTS.md — the ESC supplier CRM (esc/esc-supplier/)

Rules for anyone, human or agent, changing the supplier CRM at
https://esc-supplier.crm.fiszu.com. Read this before the first edit here or in
`twenty-ingest/src/supplier/`. Redmine: umbrella #27542, this contract #27871.

The rest of this repository is the eMobility fork of Twenty (root `CLAUDE.md`); nothing in
`packages/` is changed for the supplier CRM.

## Where things live

| What | Where |
|---|---|
| Stack: image, compose, SSO patches, upgrades | `esc/esc-supplier/` (`README.md`) |
| Data model: objects, fields, relations, views, roles, front components | a Twenty App per module in `apps/<module>/` |
| Logic and data feeds (Credit Tracker, BaseLinker, MGR, reminders, scores) | `twenty-ingest`, `src/supplier/<module>/` (its own `AGENTS.md`) |
| The ESC or RC CRM | never from here |

Nothing is built by hand in Settings: a change is a file, reviewed in a PR, then applied.

## What a module is

A module owns **one concern for every future use of it**: one `forms` module serves every
supplier form, not one module per form. It can be **removed completely while the CRM keeps
working**. The shape follows the Entirius modules (`entirius-django-pim`, `entirius-pwa-cms`):
a module owns its own data, the core knows nothing about it, and every module is optional.

A module is:
- `apps/<module>/` — one Twenty App (`defineApplication`), its own `package.json`,
  `yarn.lock` and `src/constants/universal-identifiers.ts`;
- optionally `twenty-ingest/src/supplier/<module>/` — its logic, off by its own flag.

`apps/core/` is the **core** app ("ESC Supplier Hub"): the supplier record and whatever every
module needs. It is not a module and is never removed.

## Dependency direction (enforced by `check-apps.sh`)

- **core → nothing.** Core never references a module.
- **module → core and Twenty's standard objects.** A module lists every core identifier it
  uses in `apps/<module>/src/constants/core-identifiers.ts`, copied from
  `apps/core/src/constants/universal-identifiers.ts`; the gate refuses one core no longer has.
- **module → module: never.** When two modules need the same thing, that thing moves into
  core first, in its own PR.
- A relation from a module object to a core object is declared **entirely in the module**:
  the `MANY_TO_ONE` field on the module's object and the reverse `ONE_TO_MANY` field on the
  core object, both with `defineField` (Twenty docs `data/relations`, `data/extending-objects`).
  Both fields belong to the module and leave with it.
- Standard objects come from `STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS`, never a pasted UUID.

## Install, remove — measured on esc-supplier, 2026-11-23

A throw-away core app and module app were applied, related, and uninstalled (RM #27871):
- A module applied **before** core is refused by Twenty ("references an object that could
  not be found"); nothing is half-created. **Core first, then modules.**
- `twenty app uninstall` on a module removes its objects, its fields **including the reverse
  field on the core object**, and their data. Core records stay intact.
- `twenty app uninstall` on **core while a module is installed is NOT refused**: core goes,
  the module's relation fields go with it, the module's objects and data are left orphaned,
  and the module cannot be applied again until core is back. **Never uninstall core.**
  Remove modules first.
- Uninstalling keeps the app's registration; `deleteApplicationRegistration` removes it.

Removing a module is one PR: uninstall it (export its data first if anyone needs it — an
uninstall hook can), then delete `apps/<module>/` and `twenty-ingest/src/supplier/<module>/`.

## Naming

| Thing | Rule | Example (`forms`) |
|---|---|---|
| Module id | kebab-case noun of the concern | `forms`, `credit-tracker` |
| App directory | `apps/<id>/` | `apps/forms/` |
| Package name | `esc-supplier-<id>` (core keeps `esc-supplier-hub`) | `esc-supplier-forms` |
| App display name | `ESC Supplier — <Title>` | `ESC Supplier — Forms` |
| Object `nameSingular` | camelCase, unique across ALL apps (gate refuses a clash) | `supplierForm`, `supplierFormAnswer` |
| Field a module adds to a core object | prefixed with the module's camelCase id | `formsAnswers` on `supplier` |
| Ingest module | `twenty-ingest/src/supplier/<id>/`, switch `supplier.<id>.enabled` (config key, ships off) | `supplier.forms.enabled` |

**Never change a `universalIdentifier`**: Twenty reads it as a delete plus a create, which drops
the object's data. Every identifier is a UUID v4 in `src/constants/`, unique across all apps.

## Adding a module

1. Branch `feat/esc-supplier-<id>` off `emobility-unity`.
2. In a Node 24 container: `twenty app init <id>`, then trim it like core (no
   `.github/workflows`, no examples, no integration tests that need a seeded dev server — see
   `apps/core/README.md`), pin `twenty*` to the version core pins, `yarn install` to write the
   lockfile.
3. Fresh UUID v4s in `src/constants/universal-identifiers.ts`; core identifiers it uses in
   `src/constants/core-identifiers.ts`.
4. `./verify.sh` green, `twenty app plan` read (expected adds, **0 destroys** unless the PR says
   which object or field is removed and why).
5. PR (Andrew's: review by Karol; Karol's: straight to the merge queue). After merge, apply from
   CT175 (`apps/core/README.md` → "Applying"); who applies is under "Pull requests" below.

## Tests and gate

- `./verify.sh` runs `tests/check-apps.test.sh` (every refusal of the gate proven on a broken
  copy) and `check-apps.sh` (pins, identifiers, dependency direction, object names). With an
  app's `node_modules` present it also runs that app's typecheck, unit tests and build.
- Unit tests per app with vitest in `src/__tests__/`. Logic is tested in twenty-ingest.

## Pull requests

- One concern per PR, one module per PR; a change to core and a module that needs it are two
  PRs, core first.
- **Review (Karol, 2026-11-23):** Karol's own changes (his sessions included) land straight
  through the merge queue once `./verify.sh` is green. **Andrew's PRs are reviewed by Karol**
  before they merge.
- PR body: Redmine id, the `twenty app plan` summary (adds / changes / destroys), how it was
  checked on esc-supplier.
- **Who applies (Karol, 2026-11-24):** an app reaches the workspace only after its PR is merged,
  never from an unmerged branch. The author applies it, from CT175, with their own API key
  (`apps/core/README.md` → "Applying"), never a shared one. Andrew holds the Admin role in the
  workspace for this (Karol changed it from Member the same day): he runs `twenty app plan`
  himself and puts its summary in the PR body, and his apply waits for Karol's review and the
  merge.
- Until V1 there is no test instance: apply to esc-supplier itself. The forms module is live
  there and holds supplier answers from its first real campaign on, so a plan with a destroy is
  applied only when the PR names the object or field and why. A test instance is requested at V1.

## Data

- The supplier base comes from the **Credit Tracker** (`supplier-credit-tracker`), synced into
  core by twenty-ingest, read-only from the Credit Tracker. Twenty becomes the source of truth
  later, as its own cut-over step. Nothing is added to the Credit Tracker.
- Secrets live only in the host `.env` or the CLI config of the person applying, never in git.
