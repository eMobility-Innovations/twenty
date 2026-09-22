# 2026-09-22 — blockers 1–5 fixed, both PRs open and UNMERGED

## Status

**IN-PROGRESS, blocked on one permission.** Preflight blockers **1–4** (the migration never runs on
CT175) and **5** (the source overlay patched one of four enterprise methods) are fixed, gated,
mutation-tested and pushed as two independent PRs. **Neither is merged**: the merge was refused by
this session's permission classifier with reason *Merge Without Review*, so the work is on branches,
not on the trunk.

Nothing was built. Nothing was deployed. CT175 was not touched at all this session — not even a
read. The feature flag stays off.

| PR | What | State |
|---|---|---|
| [#23](https://github.com/eMobility-Innovations/twenty/pull/23) `fix/onboarding-migration-path` | blockers 1–4 — the table now ships as the instance command the deploy path runs | open, gate green, **unmerged** |
| [#24](https://github.com/eMobility-Innovations/twenty/pull/24) `fix/enterprise-overlay-parity` | blocker 5 + critic gap 5 — all four enterprise methods, and a derived parity check | open, gate green, **unmerged** |

Both branch off `emobility-unity` at `a154b4ff` and touch **disjoint files**, so they are not stacked
and can merge in either order.

## What was done

### Blockers 1–4 — the migration path (PR #23, commit `af7473df`)

The wizard's `core."escOnboarding"` shipped as a legacy TypeORM migration only. The image entrypoint
runs `yarn database:init:prod` — the single code path in the server that executes TypeORM
migrations — **only when the `core` schema is absent.** On CT175 it is not, so every boot runs
`yarn command:prod upgrade`, whose sequence is built purely from `@RegisteredInstanceCommand` /
`@RegisteredWorkspaceCommand` bundles and never reaches TypeORM.

The table is now also a fast instance command,
`2-0/2-0-instance-command-fast-1790000100000-add-esc-onboarding.ts`, registered in
`instance-commands.constant.ts`.

**Registered at `2.0.0`, and that is load-bearing.** `TWENTY_CURRENT_VERSION` is `'2.0.0'`,
`TWENTY_PREVIOUS_VERSIONS` is `['1.21.0','1.22.0','1.23.0']`, and the upgrade sequence is built from
`TWENTY_CROSS_UPGRADE_SUPPORTED_VERSIONS` = previous + current. `'2.1.0'` lives only in
`TWENTY_NEXT_VERSIONS`. So a command in the `2-1/` folder — which the preflight's own text suggested
— is a legal `TwentyAllVersion`, registers fine, is logged as "pre-release", and **never runs**.

Both copies of the DDL are kept and both are idempotent, because a fresh install runs the legacy
migration and then the entrypoint's `upgrade` in the same boot.

### Blocker 5 — the enterprise overlay (PR #24, commit `238e0207`)

The overlay now overrides `isValid()`, `hasValidEnterpriseValidityToken()`, `getLicenseInfo()` and
`getSubscriptionStatus()` — the same four `esc/deploy/patch-enterprise.cjs` patches on the compiled
image — with the licence values in constants kept equal to the compiled patch's.

`scripts/verify-esc-features.sh` no longer checks one method of four. It **extracts** the patched
method names out of `patch-enterprise.cjs` and requires each to carry an `ESC OVERLAY PATCH` marker
in its body in the applied tree, so the list cannot go stale.

### Proof, not assertion

- **`esc/deploy/prove-esc-ddl.ts`** — runs the **shipped** classes against a real Postgres 16. Both
  copies of the DDL execute on a database that already has a `core` schema, produce an identical
  column and index set, tolerate running after each other and twice over, and `down()` is
  repeatable. Exits 1 when the two diverge — verified by changing one column type. **Before this,
  neither copy had ever executed against any database anywhere.**
- **`esc-onboarding-migration-path.spec.ts`** — asserts, against the real registry and sequence
  reader, that the command is in the sequence as a `fast-instance` step **after** the cursor CT175
  is parked on (`1.23.0_UpdateGlobalObjectContextCommandMenuItemsCommand_1780000005000`), at a
  version the sequence covers, emitting DDL identical to the migration's; and that **no fork-owned
  migration is left without an instance command beside it** — the detector for the class.
- **Mutation-tested.** Four mutations on the migration work, each caught: version → `2.1.0`,
  unregistering from `INSTANCE_COMMANDS`, dropping a column, removing `IF NOT EXISTS`. Three cases
  on the parity check, each behaving correctly: clean overlay 10/10, one marker removed fails that
  method only, a fifth method added to the compiled patch fails that method only.
- **The overlay typechecks when applied** over the upstream path.
- `./verify.sh` green on both branches, with dependencies present, so the typecheck and the 29 tests
  actually ran rather than skipping.

### Two defects in my own checks, found by running them

Recorded because the shape recurs. In `verify-esc-features.sh`: a plain substring match misses
`async getLicenseInfo(`, and an end anchor of `/^  }/` stops inside a multi-line signature such as
`getSubscriptionStatus(): Promise<{ … } | null> {`. Either one reports a correctly overridden method
as **not** overridden. Both are commented in the script. A third: a `#` comment placed after a line
continuation inside `$( … )` silently swallowed the whole `awk` call, and the loop produced no
output at all — which looked like a passing check with nothing to say.

### Also landed

- `esc/deploy/assert-esc-schema.sh` — post-deploy assertion that the table exists **and** the
  instance command is recorded `completed` with a NULL `workspaceId`. Either alone can lie: a table
  with no row was created by something other than the upgrade path, and that is a finding.
- `esc/deploy/DEPLOY.md` carries it as a numbered step. The runbook previously had **no migration
  step at all**.
- `docs/esc-onboarding-wizard.md` no longer tells anyone to run
  `npx nx run twenty-server:database:migrate:prod` on a deployed box — `nx` is absent from the
  production image, so that attempts a network fetch on production.
- `verify.sh`'s fork-scope allowlist extended for the two new paths, with the reason, per the gate's
  own instruction.
- `docs/UPSTREAM-DIVERGENCE.md` records `instance-commands.constant.ts` as a fourth upstream file we
  touch — upstream's own generator edits it, so a sync will conflict there. Keep both entries.
- `scripts/PATCH_MANIFEST.md` rewritten from "single method" to four, with why.

## Decisions & rationale — do not re-open

1. **The instance command, not a manual deploy step alone.** `upgrade` executes instance commands on
   every boot; a written step is a human remembering. Both were delivered, but the command is the
   mechanism and the step is the assertion.
2. **Registered at `2.0.0`, not `2.1.0`.** See above — `2.1.0` would never run.
3. **Both copies of the DDL kept.** The legacy migration still serves a fresh install via
   `database:init:prod`; dropping it would make a first-time install depend on `upgrade` alone.
4. **`IF NOT EXISTS` on both statements.** A fresh install runs both copies in the same boot.
5. **Two separate PRs, not one.** Disjoint files, so neither blocks the other and a stacked merge
   cannot close the one above it.
6. **`instance-commands.constant.ts` edited by hand** although its header says the generator owns it.
   The generator is `node dist/command/command.js generate:instance-command`, which needs a build;
   the edit replicates exactly what `appendToInstanceCommandsConstant` produces.

## Next steps, in order

1. **Merge #23 and #24, then confirm both reached `emobility-unity`.** This session could not:
   the permission classifier refused `gh pr merge` with *Merge Without Review*.
2. **Blocker 6 + critic gap 1 — the image check that cannot fail.** `verify-esc-image.sh:28` greps
   for `isValid() { return true;`, which exists in production only because the compiled patch injects
   it onto the signature line; `nest build` pretty-prints, so it **fails on a correct source image**,
   while `build-source-image.sh`'s own check greps the whole file for `return true`, a string
   upstream already ships twice, so it **cannot fail**. No grep can verify both routes. Replace with
   a behavioural check: query `hasValidEnterpriseKey`, `hasValidSignedEnterpriseKey`,
   `hasValidEnterpriseValidityToken` and `getSubscriptionStatus` over GraphQL against each image.
3. **Blocker 7 — a boot smoke test** that starts the image with **production's real env**
   (`docker inspect twenty-esc-server-1 --format '{{range .Config.Env}}{{println .}}{{end}}'`),
   against a throwaway Postgres and Redis, asserts `/healthz`, **and proves it fails on the pre-fix
   image.** This is also the only way to prove `command:prod upgrade` inside the real image reaches
   the new instance command — run it a second time against a restored production dump, which is the
   path CT175 actually takes.
4. **Critic gap 2 — compare `dist/front`** between the two images before any swap (production is
   22.9 MB / 921 files / `index.html` 2494 B). Every check in the plan is server-side and `/healthz`
   never renders a component.
5. **Pin the base image** to a digest, not `node:24-alpine`.
6. Only then retry the cutover, with the rollback image saved off the box first.

## How to resume

```bash
cd ~/Projects/twenty-onboarding-wizard      # worktree, node_modules installed
git fetch origin && git log --oneline -1 origin/emobility-unity
gh pr list -R eMobility-Innovations/twenty
```

Read [the preflight handover](./2026-09-22_cutover-incident-and-preflight.md) first, then the
[critic](../preflight/2026-09-22_source-build-critic.md), then the
[plan](../preflight/2026-09-22_source-build-plan.md) — the critic says which parts of the plan are
wrong.

Re-run the DDL proof:

```bash
docker run -d --rm --name esc-ddl-proof -e POSTGRES_PASSWORD=proof -p 55432:5432 postgres:16
cd packages/twenty-server && \
  PGURL=postgres://postgres:proof@127.0.0.1:55432 npx tsx ../../esc/deploy/prove-esc-ddl.ts
docker stop esc-ddl-proof
```

## Gotchas / anti-patterns

- **The `2-1/` folder is a trap.** A command registered at `2.1.0` never runs until `2.1.0` moves
  out of `TWENTY_NEXT_VERSIONS`. The preflight's own fix text named that folder.
- **`verify.sh`'s fork-scope check refuses any new application path** until it is allowlisted *and*
  carries a targeted gate. That is deliberate; extend the allowlist with the reason, in the same
  commit as the gate.
- **The esc-onboarding gate skips itself on the gate runner** (no `node_modules`), loudly. Run
  `./verify.sh` on a clone with dependencies installed, or nothing checked the wizard.
- **Redmine reads work from a session shell; writes do not.** `GET /issues/19873.json` with the key
  from `~/.config/redmine/env` returns 200, but `PUT` gets a 302 to
  `auth.fiszu.com/.../protocol/openid-connect/auth` — the ForwardAuth edge. The note for #19873 was
  written and could not be posted.
- **`gh pr create` on a fork defaults to the parent repo.** Pass
  `-R eMobility-Innovations/twenty` or it fails with "No commits between".
- Do not put a `#` comment after a line continuation inside `$( … )`. It eats the command.
