# 2026-10-09 — Tour revamp (RM #20963): replay of changed chapters, admin reset, drop-out report

## Status

**LIVE (tour6) — browser proof and the Redmine updates pending; see "Deploy".** #22315 (forced replay + admin reset) and #22316 (drop-out telemetry) are
the two sub-tasks that were "not started" on 2026-10-09 morning. #22319 (tours for the
remaining roles) is NOT started: its own ticket says "only after the pilot role is proven and
telemetry has been read", and the pilot's browser click-through is still owed.

## What was done

| Sub-task | What | Where |
|---|---|---|
| #22316 | Every closing run writes `endReason` (`finished`/`closed`/`stranded`), `endedAt`, `lastChapter`; opening a run clears the previous ending | `esc-tour/hooks/useEscTourStore.ts`, `progress/escTourProgressClient.ts` |
| #22316 | Read-only report: never opened / finished / closed early / stranded / left mid-run / on it now, plus where people stopped | `esc/deploy/report-esc-tour-progress.cjs` |
| #22315 | Per-chapter versions; changed chapters replay once, by themselves, on the next load | `esc-tour/replay/escTourReplay.ts`, `progress/startEscTourServerProgress.ts` |
| #22315 | Admin reset: `replayRequested` on the row (tick it in the CRM, or the script for one / many / `--everyone`) | `esc/deploy/request-esc-tour-replay.cjs` |
| both | Provisioner gains `lastChapter`, `endReason`, `endedAt`, `seenChapterVersions`, `replayRequested` | `esc/deploy/provision-esc-tour-progress.cjs` |

Tests: tour suite **312 → 350** (run in `esc-front-build:tour1`), deploy-script tests
**85 → 102**. Eight mutants of the new guards each turn the suite red (legacy baseline, skip
marks replay seen, no open over a running tour, no forcing on skippers, prerequisite chapter,
stranded ≠ closed, note on first step only, replay ignores a stored position).

Three existing assertions were changed, all because the contract grew, none loosened:
the exact event shape and the exact completed-update shape gained the new fields, and the
"instance provisioned on 2026-10-08" provisioner case now expects team + the five new fields
(a new case pins today's nine-field instance getting exactly the five).

## Deploy

**LIVE on CT175 since 2026-10-09 ~10:43 UTC as `twenty-esc-sso:v2.0.0-tour6`**, built from trunk
merge commit `7bfdf003` (PR #43, merged by the operator). Fields provisioned first; all checks
green — record in DEPLOY.md "Done on CT175 on 2026-10-09". **Browser proof pending:** a replay
was requested on Amir's own row; his next CRM load should open the tour at step 1 with the
"updated" note and clear `replayRequested` (check with the replay script's dry run — it then
plans "1 person" again).

Redmine (CT141) and every `001esc-*` Pangolin alias were unreachable from ~09:30 UTC
("no route to host" to `192.168.103.x:22123`; `redmine.fiszu.com/oic/login` 502), so the
#22315/#22316 notes and the #20963 resolve were not written. Reported, not investigated —
001esc is shared infra.

## Decisions & rationale — do not reopen

1. **Version per chapter, not `ESC_TOUR_SCRIPT_VERSION`.** That number guards a stored
   position. Replaying thirty steps because one sentence changed teaches people to Skip.
2. **"Forced" = the tour opens itself once, ~2 s after the row loads** (`ESC_TOUR_REPLAY_OPEN_DELAY_MS`
   — a wait for first paint, not a cadence). Skipping a replay counts as seen; it is never
   asked again for that version.
3. **A chapter never seen is "changed" only for someone who FINISHED.** A skipper chose not to
   read the tour; forcing new chapters on them reverses their choice. They get it on Tour.
4. **Rows from before this ship read as having seen every chapter at version 1**
   (`ESC_TOUR_LEGACY_SEEN_CHAPTERS`, frozen). Without it every `completed` row would be
   force-replayed the whole tour on deploy.
5. **Nobody is forced who never opened the tour or is part-way.** Auto-opening for new joiners
   was not asked for; it is one line in `decideEscTourReplay` if wanted.
6. **The admin reset never deletes anything** — it sets a flag the tour clears as it opens.
7. **`ESC_TOUR_CHAPTER_VERSIONS` is a literal**, not derived from the step constants: deriving
   it read the constants before they existed (an import cycle through the store, caught by
   `EscTourMount.test.tsx`). A test fails if a showable chapter is missing from it.

## Next steps

1. Click proof in a browser (still owed from tour4, now covers this too): DEPLOY.md
   "2026-10-09 → Proving it".
2. Read the drop-out report after a week of use, THEN start #22319 (its precondition).
3. When a chapter's copy is rewritten: bump its number in `ESC_TOUR_CHAPTER_VERSIONS` in the
   same commit, nothing else.

## How to resume

```bash
cd ~/Projects/twenty && git fetch origin
git worktree add ../_wt/twenty-20963-next -b feat/<topic> origin/emobility-unity
./verify.sh                                   # whole gate
bash esc/deploy/tests/run-tests.sh            # 102 deploy-script tests
```

Run the tour suite locally without node_modules: the `docker run … esc-front-build:tour1 npx jest
esc-tour` line from `verify.sh`.

## Gotchas

- **The provisioner must run before the swap**, or the lookup asks for fields that do not exist
  and saved progress switches itself off (safe, but nothing is recorded).
- **The two admin scripts `require` a lib**, so they cannot be piped on stdin like the
  provisioner — DEPLOY.md copies all three into the container first.
- **`dismissed` rows from before today have no `endReason`**; the report counts them as closed
  early.
