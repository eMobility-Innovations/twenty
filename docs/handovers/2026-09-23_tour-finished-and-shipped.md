# 2026-09-23 — the sidebar Tour: seven user-visible defects fixed, and shipped

## Status

**DONE — merged, deployed and serving.** `twenty-esc-sso:v2.0.0-tour1` has been running on CT175 since 2026-09-23 13:07 UTC. Redmine
[#19873](https://redmine.fiszu.com/issues/19873). The tour that existed yesterday was, measurably,
**two slides long for every real user** and **could not be started from the keyboard**. Both are
fixed, along with five more defects of the same kind, and the gate that was supposed to catch them
has been made able to run at all.

## The thing to read first

Yesterday's branch was built, reviewed and handed over as "built, verified, not deployed". A
six-lens survey of it today found seven defects, every one of which a real person would have hit.
Two were fatal to the feature. None of them was visible to any check that existed.

That is the lesson worth keeping: **every one of these passed a unit suite, a source-side verifier
and a bundle grep.** What found them was reading our code against *upstream's* code — how the
sidebar actually builds its hrefs, how `NavigationDrawerItem` actually routes a click, what
`AnimatedExpandableContainer` actually does to its children.

## The seven

1. **The tour was two slides long for every real user.** Every anchored step used an exact
   `a[href="/objects/people"]` match. `getObjectNavigationMenuItemComputedLink` builds the sidebar's
   links through `getAppPath(AppPath.RecordIndexPage, { objectNamePlural }, { viewId })`, and
   `getAppPath` appends `?viewId=<uuid>` whenever a view id is present.

   **Measured on the production database, not inferred:**

   ```sql
   select om."namePlural", count(v.id)
   from core."objectMetadata" om
   left join core.view v on v."objectMetadataId" = om.id and v.key = 'INDEX'
   where om."namePlural" in ('people','companies','orders','repairs','interactions','tasks')
   group by 1;
   --  companies|1  interactions|1  orders|1  people|1  repairs|1  tasks|1
   ```

   All six have an INDEX view, so all six links carry `?viewId=`. Six of nine steps resolved to
   nothing, were silently dropped, and the only signal was a `console.warn` in the user's own
   browser.

   The fix is a two-form selector list, **not** a bare `^=` prefix: `orders` is a prefix of
   `orderLines` and `tasks` of `taskTargets`, and a tour that spotlights the wrong list is worse
   than one that spotlights nothing.

2. **The Tour button could not be started from the keyboard.** `NavigationDrawerItem` routes
   `onClick` through `useMouseDownNavigation`, whose `triggerEvent` defaults to `'MOUSE_DOWN'`
   (`packages/twenty-ui/src/utilities/navigation/hooks/useMouseDownNavigation.ts:21`). Enter/Space
   on a native `<button>` fires `click` but never `mousedown`, and `handleClick` falls through to
   `event.preventDefault()` without calling `onClick` unless `triggerEvent === 'CLICK'`. One prop.

3. **At 768px and below, clicking Tour hid what the tour points at.** `handleMobileNavigation`
   collapses the drawer to `width: 0`, but the links stay in the DOM — so nothing reported a missing
   anchor and the tour spotlighted a clipped region while looking perfectly healthy. That band
   includes a 768px counter tablet in portrait. One prop: `preventCollapseOnMobile`.

4. **Collapsing "Other" destroyed a running tour.** The overlay was mounted from inside
   `AnimatedExpandableContainer`, which renders `{isExpanded && children}`. State now lives in a
   module-level store read with `useSyncExternalStore`, and the overlay is mounted from
   `<EscTourMount />` outside that container — **still one overlaid upstream file**, which a context
   provider would have cost a second of.

5. **Two consecutive steps spotlighted the same 200×28px link.** `anchorAncestor: 'nav, aside'`
   never resolved; the drawer is `styled.div` all the way up. It now anchors on
   `[data-click-outside-id="navigation-drawer"]` — verified real: the constant is
   `NAVIGATION_DRAWER_CLICK_OUTSIDE_ID = 'navigation-drawer'` and the command menu reads it too, so
   it is load-bearing upstream, not decoration.

6. **The popover overflowed a 320px viewport by 16px** — and the test written for that case asserted
   only `left >= 0`, so it passed. Placement now sizes the popover to fit *before* positioning it,
   which is why the clamp range can no longer invert; it returns a `width` and a `maxHeight`.

7. **The copy told people to click something the tour makes unclickable.** The interaction lock
   swallows every click outside the popover by design.

## The gate that had never run

`verify.sh`'s `esc-tour` gate skipped on every host it had ever run on — no checkout carries
twenty-front's dependencies and the shared gate runner does not install them. **The tour suite had
never been executed anywhere.**

It now runs inside the image `build-front-layer.sh --front-only` already produces. Two things were
needed and neither was obvious:

- `jest.preset.js` is **not** in that image. Upstream's build stage copies what it needs to
  *compile*; the preset is only needed to *test*. Without it jest stops with
  `Preset ../../jest.preset.js not found relative to rootDir`, which reads like a broken config
  rather than a missing file.
- The tour sources and the one overlaid upstream file are **bind-mounted over the image's baked-in
  copies**, so the gate checks what is about to be pushed, not what was compiled in weeks ago.

Measured: **131 tests, 6 suites, green**, inside `esc-front-build:tour1`. Yesterday: 65, never run.

## Deploy-path fixes

- `is_production_host()` **failed open.** Its whole body was the exit status of
  `${DOCKER} ps 2>/dev/null | grep -qx twenty-esc-server-1`. On CT175 the socket needs sudo, so
  `docker ps` errored, stderr was discarded, grep matched nothing, and the guard reported "not
  production" — which would have let an 8 GB-heap frontend build run on the box carrying production
  Postgres, Redis and two CRM stacks in 8 GB total. It was one missing `sudo` away the whole time.
  "docker said no" and "docker could not be asked" are different answers; only the first is
  permission to continue.
- **The layer build now refuses a base image that is not an ESC image**, before the tag exists,
  using the behavioural enterprise probe with `--network none`. Previously the only check ran
  against the container *after* it was serving users.
- `verify-esc-tour.sh` exits **3** for "could not measure" rather than 1 for "failed", prints the
  reason, gains an independent check for the sidebar launcher — its third check duplicated its
  second, so **nothing covered "the overlay lost the Tour button"** — and gains a live anchor-drift
  check that reads `core."objectMetadata"` instead of trusting a dated array in a unit test.
- `verify-esc-features.sh` gained a whole **Category 3** section, derived rather than written down:
  every `@/esc-tour/...` import the overlaid file makes must also be *rendered* in it, and the
  module must exist in the applied tree.

## A measurement that was wrong, and is now right

Earlier notes record production's `dist/front` as "22.9 MB / 921 files". The 22.9 MB was `du` on a
**compressed ZFS dataset** — blocks, not bytes. The same trap made today's fresh build read as
468 K. Measured properly:

| | files | bytes | index.html | assets |
|---|---|---|---|---|
| production (running) | 921 | 39,462,802 | 2494 | 726 |
| this build | 921 | 39,481,612 | 2479 | 726 |

Same file count, same asset count. The tour folded into existing chunks rather than adding one.

## Decisions & rationale — do not re-open

1. **Two-form selector list, never a bare `^=`.** `orders`/`orderLines`, `tasks`/`taskTargets`.
2. **Resume persists the STEP ID, not the index**, in sessionStorage. The showable set is resolved
   fresh on every open, so a route that appeared or disappeared shifts every index; an id either
   finds its step or does not.
3. **sessionStorage, not localStorage and not the server.** The operator's 2026-09-22 decision is
   that nothing durable records who took the tour. A position that dies with the tab is the most
   that can be kept and is exactly enough for the case it exists for — a refresh halfway through.
4. **Still exactly one overlaid upstream file.** Every extra one is a conflict on every upstream
   sync, and that is worth real effort to avoid.
5. **The copy is fixed, not the lock.** A four-strip lock with a hole at the anchor rect is the
   right long-term answer and is not today's work.
6. **The build route on CT140 is the container run, not the full docker build.** See *Gotchas*.

## Gotchas / anti-patterns

- **CT140's docker build OOMs.** Measured 2026-09-23 11:19:49:
  `oom-kill:constraint=CONSTRAINT_MEMCG … oom_memcg=/lxc/140`, `Killed process (MainThread)
  anon-rss:5877272kB`. GitLab — the org's CI — holds ~7 GB of CT140's 16 GB, and vite wants ~6 GB
  more. The full `docker build` dies with **no error message at all**, just
  `NX Running target build … failed`, which reads like a code fault. It is not.
  The working route re-uses the existing builder image with the current sources mounted:
  **2 minutes 18 seconds** instead of forty, because deps and the nx cache are already warm.
  Do not "fix" this by giving GitLab less memory. A dedicated build host is the real answer and
  does not exist.
- **`du` lies on ZFS.** Always `find -type f -printf '%s\n'` when comparing bundles.
- **`bc` is not installed on CT140.** Use awk.
- **`set -o pipefail` is not available in that CT's `sh`.** Run these scripts with `bash`.
- **The tour suite cannot run from a bare checkout**, and that is not a failure — it is what the
  docker fallback exists for. If no `esc-front-build:*` image is present the gate skips loudly and
  names the one command that fixes it.
- **A test fixture that cannot satisfy a new check is not evidence about the check.** Adding
  Category 3 turned five happy-path cases red because the fixture tree had no tour in it. The fix is
  the fixture, not the check.

## How to resume

```bash
cd ~/Projects/twenty-image-registry            # worktree, branch feat/esc-tour
./verify.sh                                     # whole gate; runs the tour suite in docker
bash esc/deploy/tests/run-tests.sh              # 76 deploy-script tests

# build host
pangolin ssh esc-blades-ct140.ssh -- 'sudo env ESC_BUILD_REF=origin/emobility-unity bash /root/ct140-build.sh'

# production
pangolin ssh esc-blades-ct175.ssh
```

Rollback is one edit and one restart: put `twenty-esc-sso:v2.0.0-ssrf1` back on lines 4 and 42 of
`/root/twenty-esc/docker-compose.yml` and `docker compose up -d`. **Never `down`** —
`twenty-ingest-app-1` shares the `twenty-esc_default` network. If the image itself has gone from the
store, `gunzip -c /root/rollback_twenty-esc-sso_v2.0.0-ssrf1.tar.gz | docker load` (314 MB,
gzip-verified).

## The deploy

PR [#29](https://github.com/eMobility-Innovations/twenty/pull/29) merged as `e5f40da7`. The image
was built from `df605400`, and `git diff df605400 origin/emobility-unity` is **empty** — so what is
running is exactly the merged commit, not something that happens to resemble it.

```
twenty-esc-server-1   twenty-esc-sso:v2.0.0-tour1   Up (healthy)
twenty-esc-worker-1   twenty-esc-sso:v2.0.0-tour1   Up
```

Cutover was `sed` on lines 4 and 42 of `/root/twenty-esc/docker-compose.yml` then
`docker compose up -d` — never `down`. The script refuses and restores the previous file if
anything other than exactly two image lines changed. `twenty-ingest-app-1` and `twenty-rc-server-1`
were untouched and still healthy afterwards, which was asserted rather than assumed.

Assertions, all exit 0:

```
esc-tour: 10 passed, 0 failed
  PASS  tour code is in the served bundle
  PASS  the sidebar launcher itself is in the bundle (label "Tour")
  PASS  index.html references an asset that exists
  PASS  /objects/{companies,interactions,orders,people,repairs,tasks} served by the live workspace

ESC Twenty image verification — container twenty-esc-server-1
  PASS enterprise reports valid on all four methods (executed, not grepped)
  PASS SSRF allowlist present in isPrivateIp

esc.crm.fiszu.com/healthz -> 200
```

**The public hostname cannot be used to check the bundle anonymously** — it 302s to SSO, which is
the edge behaving correctly. The equivalent evidence is the grep inside the running container,
above.

**One check that looks alarming and is not:** the literal string `/objects/people?` does NOT appear
in the bundle. The anchor is built at runtime by `escTourObjectAnchor(objectNamePlural)`, so what
is compiled in is the template — `a[href="/objects/` and `], a[href^=` — plus the six
`objectNamePlural:"…"` values. All present. Do not "fix" a future check that greps for the expanded
form; it will never be there.

Rollback, if it is ever needed: put `twenty-esc-sso:v2.0.0-ssrf1` back on lines 4 and 42 and
`docker compose up -d`. The previous compose file is kept at
`/root/docker-compose.yml.before-tour1`. Both images are saved off the running store:
`/root/rollback_twenty-esc-sso_v2.0.0-ssrf1.tar.gz` (314 MB) and
`/root/twenty-esc-sso_v2.0.0-tour1.tar.gz` (125 MB), both gzip-verified.

## Redmine

18 of the 19 W subtasks dispositioned on 2026-09-23. W7, W8, W9, W10, W13, W14, W15, W17, W19 and
W3 **Resolved**; W1, W2, W4, W5, W6, W12, W16 and W18 **Rejected as superseded** by the 2026-09-22
decision, each with the reason on the ticket rather than in a commit message.

**W11 (#19908) is deliberately still open.** It says "the whole wizard proven end to end on one
role", and nothing that greps a bundle proves a tour runs. It closes when a person clicks Tour.

## Not done, stated rather than hidden

1. **No Playwright E2E and no visual regression** for the tour (part of W17). The suite is 131
   jsdom tests and a gate that runs. A browser check at 320/375/768/1024/1440/1920 is a separate
   piece of work.
2. **Nothing alerts if the tour breaks.** W18 had nothing to measure once the stored state went, and
   that is still true — but "a step was dropped" is a real signal that currently reaches only the
   `console.warn` of whoever is taking the tour.
3. **Three remaining unmount vectors** for the overlay: layout-customization mode, opening a
   navigation-menu folder, and switching the drawer tab to AI chat history. The collapsible section
   was the common one and is fixed; these are not.
4. **The fork's images still have no home.** The base image exists only in CT175's local store,
   which is why the build has to be split across two hosts. Filed, unclaimed.
