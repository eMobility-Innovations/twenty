# 2026-09-23 — START HERE: the onboarding tour, both deploys, and what is left

Entry point over the two handovers written today. Read this first; it says which of them you need.

| | |
|---|---|
| **Ticket** | Redmine [#19873](https://redmine.fiszu.com/issues/19873) |
| **Running on CT175** | `twenty-esc-sso:v2.0.0-tour2`, since 2026-09-23 16:52 UTC |
| **Trunk** | `a4a451e3` on `emobility-unity` — the deployed tree is an ancestor of it |
| **Still open** | **#19908 (W11)** — nobody has clicked Tour yet |

---

## The day in one paragraph

The tour went from *not deployed and badly broken* to *deployed twice*. The morning shipped the
nine-step sidebar tour after fixing seven defects a real person would have hit — two of them fatal
and none visible to any check that existed. The afternoon rebuilt it into a 35-step, five-chapter
tour that navigates between pages, which required fixing the same class of defect a second time in a
new disguise. Both deploys are verified end to end on the running container. Nothing that inspects a
file proves a tour *runs*: that is the one step still outstanding and it needs a person.

## Which handover to read

| Read this | For |
|---|---|
| [`2026-09-23_tour-finished-and-shipped.md`](./2026-09-23_tour-finished-and-shipped.md) | The seven defects in the nine-step tour, how each was measured, and the gate that had never run |
| [`2026-09-23b_deep-tour-shipped.md`](./2026-09-23b_deep-tour-shipped.md) | The navigating engine, the 35-step script, and the four things deliberately not built |
| [`2026-09-22d_tour-button-built.md`](./2026-09-22d_tour-button-built.md) | Yesterday — the decision that replaced the stored-state wizard with a Tour button |

## The one lesson worth carrying

**A tour that silently gets shorter looks exactly like a tour that works.** Both of today's fatal
defects were that shape:

1. Every anchored step matched `a[href="/objects/people"]` **exactly**, while the product renders
   `/objects/people?viewId=<uuid>`. Six of nine steps resolved to nothing and were dropped, with only
   a `console.warn` in the reader's own browser. **Measured on the production database:** all six of
   the tour's objects have an INDEX view, so this was true for every real user, always.
2. When the tour learned to navigate, `selectShowableEscTourSteps` judged **every** step at `open()`
   against the page the reader was standing on — so every step on a page nobody had visited yet was
   "missing" and dropped. The deep tour would have collapsed back to the sidebar-only tour, silently.

Neither was visible to the unit suite, the source-side verifier or the bundle grep. What found them
was reading our code **against upstream's code**: how the sidebar actually builds its hrefs, how
`NavigationDrawerItem` actually routes a click, what `AnimatedExpandableContainer` actually does to
its children.

## Evidence

```
tests       0 executions ever  →  65  →  131  →  176  →  202     (9 suites)
gates       verify: all local gates passed  ·  76 deploy-script tests
deploy      esc-tour 10/10 · enterprise valid on all four methods (executed, not grepped)
            SSRF allowlist present · esc.crm.fiszu.com/healthz -> 200
bundle      esc-tour-chapter · "Opening this page" · esc-tour-header
            — read out of the RUNNING container, not the source
drift       porcelain 0 · nothing unpushed · no open PRs
```

`twenty-ingest-app-1` and `twenty-rc-server-1` were untouched by both cutovers and healthy
afterwards — asserted, not assumed.

## Rollback

One edit and one restart. `/root/twenty-esc/docker-compose.yml`, lines 4 (server) and 42 (worker),
then `docker compose up -d` — **never `down`**, `twenty-ingest-app-1` shares `twenty-esc_default`.

Three images are saved off the running store, all gzip-verified, on CT175:

| tarball | is |
|---|---|
| `rollback_twenty-esc-sso_v2.0.0-ssrf1.tar.gz` | before any tour |
| `twenty-esc-sso_v2.0.0-tour1.tar.gz` | the nine-step tour |
| `twenty-esc-sso_v2.0.0-tour2.tar.gz` | what is running |

Previous compose files: `/root/docker-compose.yml.before-tour1`, `…before-tour2`.

## Redmine

18 of 19 subtasks dispositioned. Three journals on #19873 (36574, 36578, plus the subtask notes).
**#19908 (W11) is deliberately still open** — it says "proven end to end", and that needs a click.

**Hours.** 0.7 h booked to 23 Sep; the day hit the hard 20 h/day cap at 19.92 h, so the afternoon's
6.0 h was booked to **24 Sep** with the operator's authorisation, every entry carrying the note
*"[23 Sep work, dated 24 Sep] … Operator authorised the spill."* 24 Sep now stands at 8.2 h, of
which 2.2 h was already there.

## What is NOT done — stated, not buried

1. **Nobody has clicked Tour.** RM #19908. It is now a 35-step tour with a page transition, so the
   browser check matters more than it did this morning, not less.
2. **Chapter 4 does not reach a customer's page.** It needs a record uuid; hard-coding one would put
   a real customer in the repo, and a route that resolves to nothing burns the 8 s anchor deadline
   per step. The honest fix is a route resolved from the DOM — the first row's link on the list the
   tour is already standing on — which needs the engine's `route` to accept a function.
3. **No Playwright E2E, no visual regression.** 202 jsdom tests and a gate that runs.
4. **Nothing alerts if the tour breaks.** A dropped step reaches only the browser console of whoever
   is taking the tour.
5. **No folder exists to spotlight.** Measured: 18 sidebar entries, every `folderId` NULL, 0 rows of
   type FOLDER. The sub-category step *explains* today and *shows* the day somebody makes one — no
   code change needed.
6. **Three upstream surfaces have no stable hook at all** — the record table's own container, the
   in-view search control, the Favourites/Workspace headings. Those describe rather than point.
7. **The fork's images still have no registry.** It forced today's builds across two hosts.

## Traps that cost real time today

- **CT140's docker build OOMs** under GitLab (`oom_memcg=/lxc/140`, anon-rss 5.8 GB) and dies
  printing **no error at all** — it reads as a code fault. The working route re-uses the existing
  builder image with the sources mounted: **2 m 18 s instead of 40 minutes.** Do not fix this by
  giving GitLab less memory; a dedicated build host is the real answer and does not exist.
- **`du` lies on ZFS.** It made a 39 MB bundle read as 468 K. Always
  `find -type f -printf '%s\n'` when comparing bundles.
- **A transform error's reported file is not necessarily the broken file.** Two unescaped backticks
  in `escTourStylesheet.ts` ended its template literal, and jest blamed a *comment in
  `EscTourOverlay.tsx`*. swc parsed that file clean on its own; only running the project's real
  transform options, file by file, found it.
- **Backticks inside `ESC_TOUR_STYLESHEET` must be escaped** (`\``).
- **A test rendering `EscTourMount` now needs a `<MemoryRouter>`** — the mount calls `useNavigate()`.
- **The CT140 checkout tracked a branch that was deleted on merge**, so a bare `git fetch origin`
  failed with `couldn't find remote ref`. The build script now fetches an explicit refspec.
- **`bc` is not installed on CT140**; `set -o pipefail` is unavailable in its `sh`. Use awk, and bash.

## How to resume

```bash
cd ~/Projects/twenty-tour-deep          # worktree, branch feat/esc-tour-deep
./verify.sh                              # whole gate; runs the tour suite inside docker
bash esc/deploy/tests/run-tests.sh       # 76 deploy-script tests

# build host
pangolin ssh esc-blades-ct140.ssh -- 'sudo env ESC_BUILD_REF=origin/emobility-unity bash /root/ct140-build.sh'
# production
pangolin ssh esc-blades-ct175.ssh
```
