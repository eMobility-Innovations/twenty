# 2026-09-23b — the deep tour: 35 steps, 5 chapters, and an engine that navigates

## Status

**DONE — merged, deployed and serving.** `twenty-esc-sso:v2.0.0-tour2` on CT175 since 2026-09-23
16:52 UTC, built from a tree identical to trunk `f9aa5c60`. Redmine
[#19873](https://redmine.fiszu.com/issues/19873).

This is the second deploy of the day. The first shipped the nine-step sidebar tour
(`2026-09-23_tour-finished-and-shipped.md`); this one is the operator's follow-up ask —
*"can we make it much more deeper? it walks you through Sub Categories and the left panel,
everything"*.

## The thing to read first

The nine-step tour never left the page it started on. To walk somebody through the product the
tour has to navigate, **and the model it had made that impossible.**

`selectShowableEscTourSteps` resolved every step **once, at `open()`**, against the page the reader
was standing on, and dropped what it could not find. A step anchored on the People list is, at open
time, on a page nobody has visited — so it was "missing" and silently dropped. The deep tour would
have collapsed back to the sidebar-only tour, with nothing saying so.

That is the *same failure class* as the exact-match anchor defect fixed this morning: a tour that
quietly gets shorter looks exactly like a tour that works. A routed step is now kept unconditionally
and judged when the tour reaches it.

## The engine

- **Navigation through the router.** `EscTourMount` calls `useNavigate()` and passes it into
  `useEscTour` as a parameter, so every existing hook test still renders without a `<Router>`, and
  nothing anywhere assigns `window.location` — a full page load would tear down the mount point that
  survives navigation. Route matching is prefix-with-boundary (`/`, `?`, `#`): `/objects/people`
  covers `?viewId=` and `/<uuid>` but never `/objects/peoplefoo`.
- **Waiting reuses the tracker that already existed.** It always re-resolved the selector on each
  read rather than capturing an element, so it could already pick up a late anchor; what it could not
  do was notice one that never comes. One 8 s deadline, no second polling loop.
- **A timed-out step is REMOVED, not stepped over.** Leaving it in means Back walks into it, it times
  out again, and the tour has a wall in it.
- **Chapters** appear in the popover and go *into* the counter's spoken label — "The left panel,
  step 3 of 12" rather than an orphan phrase and a number.
- **The reader is returned** to the page they pressed Tour on, on Finish, Skip and Escape.

## Sub-categories — what was actually asked for

**Measured on production:** `core."navigationMenuItem"` has 18 rows, every `folderId` is NULL, and
there are **0 rows of type FOLDER**. The product supports folders; nobody at ESC has made one.

If the folder step had simply been written, the one thing the operator named would have resolved to
nothing and dropped — silently. So the folder step is `optional`, and is followed by a **centred step
with no anchor**, which therefore can never be dropped. The idea is explained on a workspace with no
folders; the spotlight appears the day somebody makes one.

## What it deliberately does NOT do

1. **Chapter 4 does not navigate to a customer's page.** A record page is
   `/object/:objectNameSingular/:objectRecordId`, so reaching one needs a uuid. Hard-coding one puts
   a real customer in the repo and breaks the day that record is deleted; a route that resolves to
   nothing burns the 8 s anchor deadline **per step** — about half a minute of dead tour on every
   run. Chapter 4 is route-less: it shows when the reader is already on a customer's page and drops
   for free otherwise, with a centred first step so the idea always survives.
2. **Three surfaces have no stable hook in upstream at all** — the record table's own container, the
   in-view search control, and the Favourites/Workspace section headings. Those are centred steps
   that describe rather than point.
3. **The interaction lock is not relaxed.** The "Add new record" control writes a blank row
   immediately; unlocking it would litter the live People and Orders tables.
4. **Anything locale-dependent is `optional`** — translated strings, and `#nav-item-*` slugs built by
   a transliteration library that is not installed in this checkout. On a non-English workspace those
   drop, and a drop must never be confused with real upstream drift.

## Anchors are evidenced, not invented

Every anchor carries the upstream `file:line` it was read from. Note one in particular: the sort
control is `sort-dropdown` (`ObjectSortDropdownId.ts`) and **not** `view-sort`, which is the
component-instance id `ViewBar` passes. Anchoring on `view-sort` would have matched nothing while
looking exactly like upstream drift.

## Measured

```
9 suites, 202 tests, green      (131 this morning, 65 yesterday, 0 executions ever before today)
76 deploy-script tests
verify: all local gates passed

esc-tour: 10 passed, 0 failed   — bundle + all six object routes served by the live workspace
enterprise valid on all four methods (executed, not grepped)
SSRF allowlist present
esc.crm.fiszu.com/healthz -> 200

deep markers in the served bundle: esc-tour-chapter · "Opening this page" · esc-tour-header
```

`twenty-ingest-app-1` and `twenty-rc-server-1` untouched and still healthy — asserted, not assumed.

## Two bugs found on the way, neither asked for

- **The spotlight kept painting the previous step's cut-out on the new page.** The tracker's
  rect-equality guard starts `lastRect` null per effect run while React state still holds the old
  rect, so `isSameRect(null, null)` skipped the write. Invisible until the tour could change pages.
- **`escTourStylesheet.ts` had two unescaped backticks inside its template literal**, which ended the
  string. **jest blamed a comment in a different file** (`EscTourOverlay.tsx:22`) because the failure
  surfaced through the import chain, and swc parsed that file clean on its own. Only running the real
  transform options, file by file, found it. Lines 127 and 172 of the same file escape their
  backticks correctly — the new one did not.

## Gotchas / anti-patterns

- **Backticks inside `ESC_TOUR_STYLESHEET` must be escaped** (`\``). The stylesheet is one template
  literal; a raw backtick ends it.
- **A transform error's reported file is not necessarily the broken file.** Transform each file
  individually with the project's real swc options before believing the position.
- **The CT140 checkout tracked `feat/esc-tour`**, which was deleted on merge, so a bare
  `git fetch origin` failed with `couldn't find remote ref`. The build script now fetches an explicit
  refspec with `--prune`.
- **`bc` is not installed on CT140** — the byte-count line in `ct140-build.sh` fails silently. Use awk.
- **The tour suite cannot run from a bare checkout** and that is not a failure: the gate runs it
  inside `esc-front-build:tour1`, mounting `jest.preset.js` (absent from that image) and the current
  sources over the baked-in copies.
- **A test that renders `EscTourMount` needs a `<MemoryRouter>`** now that the mount calls
  `useNavigate()`.

## Rollback

One edit and one restart: put `twenty-esc-sso:v2.0.0-tour1` back on lines 4 and 42 of
`/root/twenty-esc/docker-compose.yml` and `docker compose up -d`. **Never `down`** —
`twenty-ingest-app-1` shares `twenty-esc_default`. The previous compose file is at
`/root/docker-compose.yml.before-tour2`. Three images are saved off the running store and
gzip-verified: `rollback_twenty-esc-sso_v2.0.0-ssrf1.tar.gz` (the pre-tour image),
`twenty-esc-sso_v2.0.0-tour1.tar.gz`, `twenty-esc-sso_v2.0.0-tour2.tar.gz`.

## Not done, stated rather than hidden

1. **Nobody has clicked Tour.** RM #19908 (W11) stays open until a person walks it. Nothing that
   greps a bundle proves a tour runs, and that is now a 35-step tour with two page transitions —
   the browser check matters more than it did this morning, not less.
2. **No Playwright E2E, no visual regression.** 202 jsdom tests and a gate that runs.
3. **Chapter 4 needs a record-page route** to be what it should be. The honest fix is a route
   resolved from the DOM (the first row's link on the list the tour is already standing on), which
   needs the engine's `route` to accept a function. Filed, not started.
4. **No folder exists to spotlight.** If the operator makes one, the sub-category step upgrades from
   explaining to showing with no code change.
5. **Nothing alerts if the tour breaks.** A dropped step still reaches only the browser console of
   whoever is taking the tour.
