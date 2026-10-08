# 2026-10-07 — Tour revamp (RM #20963): saved progress + Sales/CS tour LIVE as tour4, click proof pending

## Status

**IN-PROGRESS.** #22314 (saved progress, PR #36) and #22317 (Sales/CS chapters, PR #38) are
merged to `emobility-unity` and **running on CT175 since 2026-10-08 12:24 UTC** as
`twenty-esc-sso:v2.0.0-tour4`, built from the merge commit `bd39b307` — production runs merged
code only. Every scripted check is green (DEPLOY.md, "Done on CT175 on 2026-10-08"). **The
browser click proof is NOT done**: the session's Chrome extension was disconnected and the CRM
sits behind SSO. Until someone clicks it, the two tickets are deployed, not proven.

## Scope (operator, 2026-10-07 — recorded on #20963 journal 38904)

| Sub-task | What | State |
|---|---|---|
| #22314 | Saved progress, keyed on the workspace member | **LIVE as tour4 (`bd39b307`); click proof pending** |
| #22315 | Forced replay of changed chapters + admin reset | not started — needs #22314 live |
| #22316 | Drop-out report | not started — reads #22314's rows |
| #22317 | Pilot-role tour — **Sales and CS** (operator), daily tasks, proven by a click | **merged (PR #38, `bd39b307`), LIVE as tour4; click proof pending; DND copy unconfirmed** |
| #22318 | Watchdog | **Rejected** — operator: "it's a tour, not a major thing to do a watchdog for" |
| #22319 | Remaining roles | after the pilot is proven |

## 2026-10-08 update

- `escTourProgress` + 8 fields provisioned on CT175 with twenty-ingest's key
  (`/root/twenty-ingest/.env` `TWENTY_API_KEY` — there is no separate admin key; operator
  approved its use). Printed `provisioned and verified`, removed 1 sidebar entry.
- #22317 built on PR #38: team picker (asked in the tour, operator's choice over reading the
  Twenty role), Sales + CS chapters (facts read off the live data model), chapter 4 walked
  via the first People row's uuid. Adds a `team` field to the provisioner.
- A front build of `d7eb2cdc` (tour3, #22314 only) was started on CT140 and STOPPED, so the CRM
  restarts once for both. No tour3 image exists.
- **Deploy order once #38 is merged:** provisioner `--apply` from trunk (adds `team` only) →
  CT140 front build of the merge commit → layer as `v2.0.0-tour4` on `tour2` on CT175 → save
  tarball → compose lines 4 + 42 → `up -d` (never `down`) → verify scripts → browser click.

## Decisions — do not reopen

1. **Progress lives in a Twenty custom object (`escTourProgress`), not a table.** This does
   not reverse 2026-09-22 (journal 36187). That decision dropped `core."escOnboarding"` because
   a fork migration never runs on an existing instance and a server rebuild risks the 16h41m
   DI failure. A custom object is data created through the metadata API: no migration, no
   server rebuild, still the front-only image layer. The 2026-09-22 note itself said reporting
   "needs somewhere to live" if wanted; on 2026-10-07 it was wanted.
2. **The writer fails soft.** Object missing, role refused, network down → one console warning,
   progress off for that page load, tour unchanged. A help feature never breaks the CRM.
3. **The store emits events; it does not call the network.** The store keeps its synchronous
   invariants; the writer (`startEscTourServerProgress`) subscribes.
4. **No watchdog** (#22318 rejected).
5. **The team is ASKED, not read from the Twenty role** (operator, 2026-10-08): works whatever
   roles exist; nobody measured whether Sales/CS roles exist on CT175.

## What was done

- `esc-tour/hooks/useEscTourStore.ts` — progress events (`opened|advanced|completed|dismissed`),
  `seedEscTourResumeStepId` for a server-held position (the tab's own sessionStorage still wins).
- `esc-tour/progress/` — `escTourProgressClient.ts` (GraphQL shapes taken from upstream's own
  generators/fixtures), `startEscTourServerProgress.ts` (load-or-create, seed, ordered writes,
  fail soft), `useEscTourServerProgress.ts` (reads `ApolloCoreClientContext` directly — upstream's
  `useApolloCoreClient` throws when absent, inside the sidebar).
- `esc/deploy/provision-esc-tour-progress.cjs` — idempotent, dry-run by default; creates the
  object + fields and removes the sidebar entry Twenty adds for every new object, for everyone
  (`object-metadata.service.ts:515`), matching only workspace-level entries on this object's id.
- Tests: tour suite 202 → **230**; deploy-script tests → **85**. Mutation-tested both ways:
  the progress events (15 red on the old store), the fail-soft flag, and the sidebar-entry
  ownership filter.
- Found and fixed before shipping: piped on stdin (`node - < file`, how DEPLOY.md runs it) the
  provisioner **exited 0 having done nothing** — `require.main !== module` under stdin. Tested.

## Next steps

0. ~~Merge #36, #38; provision; build; swap to tour4~~ — done 2026-10-08.
1. **Click proof (needs a browser signed in to esc.crm.fiszu.com):** click Tour → pick Sales →
   the "Your day in Sales" chapter comes before "Getting around" → chapter 4 opens a real
   customer → stop halfway; open another browser, click Tour → it resumes at the same step
   with Sales pre-selected → finish → the row in `/objects/escTourProgresses` reads
   `completed` with `team = sales`. Repeat the pick with Customer service.
   Fails ⇒ roll back (DEPLOY.md) and reopen.
2. Operator to confirm the DND tag means "do not disturb" (inferred from the name only).
3. #22316 drop-out report, then #22315 replay/reset, then #22319 remaining roles.

## How to resume

```bash
cd ~/Projects/twenty && git fetch origin && git worktree add ../_wt/twenty-20963-next -b feat/<topic> origin/emobility-unity
./verify.sh                                  # whole gate; tour suite runs in esc-front-build:tour1
bash esc/deploy/tests/run-tests.sh           # 85 deploy-script tests
```

## Gotchas

- **Twenty adds a workspace sidebar entry for every new custom object.** The provisioner removes
  it; creating the object by hand in Settings leaves it there for every agent.
- **`isSystem` cannot be set through the public metadata API** — the object is visible in
  Settings → Data model. That is fine: it is the admin's report.
- **Custom roles on CT175 are unmeasured.** Default Member can read/update all objects
  (`role.service.ts:365`); a custom role that cannot just gets progress off, by design.
- **No lint runs on the tour**: the build image has no ESLint config and `verify.sh` does not
  lint it. One pre-existing `tsc` error in `EscTourOverlay.tsx` (dual `@types/react` in the image)
  exists identically on trunk.
