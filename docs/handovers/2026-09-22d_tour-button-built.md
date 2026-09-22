# 2026-09-22d — the Tour button: built, verified, NOT deployed

## Status

**IN-PROGRESS, safe to leave.** The sidebar Tour button and its guided-tour overlay are built and
pushed on `feat/esc-tour`, the frontend bundle is compiled and verified on CT140, and a rollback
tarball of the running production image now exists on CT175. **Nothing has touched production.**
The remaining work is three commands and one human click — all of them listed under *Next steps*.

The wizard's stored-state design is dead by operator decision (recorded on Redmine
[#19873](https://redmine.fiszu.com/issues/19873), journal 36187).

## The decision this session exists for

Operator, 2026-09-22:

> "we can skip the database table and the flags of who is onboarded and who's not and we can easily
> do a button in the sidebar of Twenty CRM and when people click on it, it walks them through the
> onboarding this is simpler, cleaner and easier"

It is simpler, and it is also worth more than it looks. **Preflight blockers 1–4 disappear with the
table.** Four of the six preflight lenses independently found that the image entrypoint runs
`yarn database:init:prod` — the only code path that executes TypeORM migrations — *only when the
`core` schema is absent*, and on CT175 it is not. The wizard's table would have shipped dead on
arrival with no boot-time symptom. With no table there is nothing for the migration path to fail to
run.

Superseded by that decision, and needing to be closed or re-scoped rather than worked:

| Thing | Why it is dead |
|---|---|
| `core."escOnboarding"` and the progress rows | not shipped |
| PR #17, W1–W6 (`esc/onboarding-wizard`, unmerged, flag off) | no longer the shape to ship |
| `2.0.0_AddEscOnboardingFastInstanceCommand_1790000100000` + its legacy migration twin | exist only to create that table |
| `esc/deploy/assert-esc-schema.sh` and the deploy step that runs it | same |
| W16 (drop-out telemetry), W18 (completion watchdog) | nothing is recorded about who took the tour, so there is nothing to measure |

## What was done

### The tour itself — `esc/new/packages/twenty-front/src/modules/esc-tour/`

ESC-owned code that upstream has never seen: a controller hook, a spotlight + popover overlay
rendered through a portal, an anchor resolver, the placement maths, and the step script as data.

**Exactly ONE upstream file is overlaid** —
`esc/overlay/.../navigation/components/NavigationDrawerOtherSection.tsx`, a two-hunk diff adding one
import and one element. Twenty has no extension point for a sidebar entry: the drawer renders a
fixed set of items and nothing reads a registry, a plugin list or a config key. Every additional
overlaid file is a conflict to resolve on every upstream sync, so the count is held at one
deliberately.

Four properties are contract, not detail:

- **No new npm dependency.** driver.js was the obvious library. It would mean permanent
  `package.json` / `yarn.lock` divergence, and neither file is allowlisted by `verify.sh`'s
  fork-scope check. ~300 lines of self-contained React instead.
- **Anchors are ROUTES, never class names.** A step points at `a[href="/objects/people"]`. A route
  is part of the product; a linaria hash is a build artefact that changes without anyone deciding it
  should. A test fails if an anchor ever starts with a class selector.
- **A missing anchor skips its step and names it.** `selectShowableEscTourSteps` resolves the script
  once when the tour opens, drops steps whose target is not on the page, and returns their ids,
  which are logged by name. Without this a renamed route makes the tour quietly shorter — which
  looks exactly like a tour that is working.
- **The tour changes no data**, and records nothing about who took it.

The script's steps were written against the routes the production workspace actually serves, read
off `core."objectMetadata"`: People, Companies, Orders, Repairs, Interactions, Tasks.

### Delivery — a front-only image layer

`esc/deploy/Dockerfile.front-layer` + `esc/deploy/build-front-layer.sh`.

The frontend is rebuilt and copied over an existing ESC image as one `COPY` into
`/app/packages/twenty-server/dist/front`. **The server binary is not recompiled.** So the Nest
dependency-injection failure that took the CRM down for 16h41m on 2026-09-21 cannot be reintroduced
by this image, and the two compiled server patches (enterprise bypass, SSRF allowlist) are inherited
from the base rather than re-applied.

Two facts make that sound, both measured:

- `git diff v2.0.0..HEAD -- packages/twenty-front` is **empty**. The fork has never changed the
  frontend, so a rebuild from this tree is the bundle production already serves, plus the tour.
- The server serves the front as plain static files (`ServeStaticModule`, rootPath `dist/front`).
  No asset manifest, no integrity check, no CSP pinning script hashes — replacing the directory as
  one unit is the whole operation.

The build is **split across two hosts**, and that split is not tidiness: `twenty-esc-sso:v2.0.0-ssrf1`
exists in CT175's local docker store, in no registry and in no saved tarball, so the layer can only
be built there — while the frontend compile (8 GB Node heap) can only happen off there. It is a
direct, daily cost of the image having no home.

### The gate

`verify.sh` carries a targeted `esc-tour` gate modelled on the existing `esc-onboarding` one.
Because the tour's code lives in `esc/new/` rather than a package path, the gate has to apply the
overlay into `packages/` to run the suite. So it refuses a dirty tree rather than restoring over
somebody's uncommitted work, applies and restores under a trap so a failing test still puts the tree
back, and fails if the tree is not clean afterwards.

14 unit tests. One is a mutation test: remove the skip-missing-anchor guard in
`selectShowableEscTourSteps` and it fails.

### Verified, on the build host

```
build: 23 MB, 921 files          # production's current dist/front is 22.9 MB / 921 files
tour markers: build/assets/index-CtkeT8OF.js AND index-DS9wyvDK.css
index.html references assets/index-CtkeT8OF.js   # same build, not a half-replaced directory
tarball: /root/twenty-front-build.tar.gz (14 MB) on CT140
```

The CSS hit matters: it proves linaria compiled the overlay's `styled` blocks rather than silently
dropping them.

### Rollback insurance that did not exist this morning

`twenty-esc-sso:v2.0.0-ssrf1` is saved, gzip-verified, at
`/root/rollback_twenty-esc-sso_v2.0.0-ssrf1.tar.gz` on CT175 — 314 MB.

Still on the same host, so it is **not** the fix for the image having no home (that is its own
prompt, unstarted). But it survives the failure that actually happened on 2026-09-22, which was
images vanishing from the docker *image store* while the disk was fine.

## Decisions & rationale — do not re-open

1. **Source change, not a DOM-injected script.** The button is a real `NavigationDrawerItem` in the
   React tree. A `<script>` injected into `index.html` would have needed a DOM anchor in the sidebar,
   and the drawer carries no stable attribute — no `data-testid`, no `aria-label` — only
   linaria-hashed class names.
2. **Front-only layer, not a source build.** A source build is the route that produced the 16h41m
   outage and is still not proven to pass its own boot smoke test. Rebuilding only the frontend
   removes the entire server-side failure class from this change.
3. **`REACT_APP_SERVER_BASE_URL` is built EMPTY.** Measured on the running container, not assumed:
   it is empty there, and `SERVER_URL` carries `https://esc.crm.fiszu.com`. The browser gets the API
   host at runtime from `window._env_`, which the entrypoint writes from `SERVER_URL`; the
   compiled-in value is only the fallback underneath it. Baking a URL in where production has none
   would be a difference from production that nothing in the image reports.
4. **`IconMap`, not `IconRoute`.** See *Gotchas*.

## Next steps, in order

Everything below is on CT175 unless stated. Steps 1–3 create an image and change nothing that is
running; **step 4 is the production change and needs the operator's word.**

1. Get the built frontend onto CT175 (it is at `/root/twenty-front-build.tar.gz` on CT140, 14 MB),
   unpack to `/root/twenty-front-build/build`.

2. Clone the branch there and build the layer — one `COPY`, no heap:

   ```sh
   sudo sh -c 'cd /root && git clone --depth 1 --branch feat/esc-tour \
     https://github.com/eMobility-Innovations/twenty.git twenty-tour-src'
   cd /root/twenty-tour-src
   FRONT_BUILD_DIR=/root/twenty-front-build/build DOCKER='sudo docker' \
     ./esc/deploy/build-front-layer.sh --layer-only \
       twenty-esc-sso:v2.0.0-ssrf1 twenty-esc-sso:v2.0.0-tour1
   ```

3. Save the new image off the box before it goes anywhere:

   ```sh
   sudo docker save twenty-esc-sso:v2.0.0-tour1 | gzip -1 > /root/rollback_twenty-esc-sso_v2.0.0-tour1.tar.gz
   sudo gzip -t /root/rollback_twenty-esc-sso_v2.0.0-tour1.tar.gz
   ```

4. **OPERATOR DECISION.** Cut over: point `server` AND `worker` in
   `/root/twenty-esc/docker-compose.yml` at the new tag, then `docker compose up -d` — **never
   `down`**, `twenty-ingest-app-1` shares `twenty-esc_default`.

5. Assert, in this order. The deploy is not done until all three exit 0:

   ```sh
   ./scripts/verify-esc-tour.sh --container twenty-esc-server-1
   CONTAINER=twenty-esc-server-1 ./scripts/verify-esc-image.sh
   curl -sf -o /dev/null -w '%{http_code}\n' https://esc.crm.fiszu.com/healthz
   ```

   The second is not ceremony: a layer built over a bare `twentycrm/twenty:v2.0.0` instead of an ESC
   image gives a healthy container that has silently lost both server patches, and only that check
   says so.

6. **A human opens the CRM and clicks Tour.** Every check above proves the tour is *present*. None
   proves it *runs* — nothing that greps a bundle can. This step is the proof and the work is not
   finished without it. The CRM UI is unreachable from an agent session (SSO, no credential entry),
   so this needs the operator or a browser driving their session.

7. Run the tour suite somewhere it can actually run. It has **never been executed** — see *Gotchas*.

## How to resume

```bash
cd ~/Projects/twenty-image-registry      # worktree, branch feat/esc-tour (left in place deliberately)
git log --oneline -7                     # six commits of tour work
```

- Branch: `feat/esc-tour` on `eMobility-Innovations/twenty`, pushed, **no PR opened yet**.
- Build host: `pangolin ssh esc-blades-ct140.ssh`, checkout `/root/twenty-tour-src`, build log
  `/root/twenty-tour-build.log`, output tarball `/root/twenty-front-build.tar.gz`.
- Production: `pangolin ssh esc-blades-ct175.ssh`, stack `/root/twenty-esc/`.
- Redmine: #19873, journal 36187 carries the decision and what it supersedes.

## Gotchas / anti-patterns

- **`IconRoute` does not exist in `twenty-ui/display`.** It is in the internal Tabler registry
  `packages/twenty-ui/src/display/icon/providers/internal/AllIcons.ts`, which is NOT the export list.
  The barrel `packages/twenty-ui/src/display/index.ts` re-exports a hand-picked subset. I checked
  the registry, believed it, and the vite build refused: `"IconRoute" is not exported by
  "../twenty-ui/dist/display.mjs"`. **Check `index.ts`, never `AllIcons.ts`.** Also absent:
  `IconCompass`, `IconSchool`, `IconMap2`, `IconDirectionSign`, `IconBulb`.
- **The tour suite has never been run.** There is no twenty-front checkout with `node_modules` on
  the workstation, and the gate skips loudly without one. The tests are written and the gate is
  wired; neither has been *seen* to pass. A suite that has never executed is not evidence. Run it
  inside the build image, which has the dependencies:
  `docker run --rm esc-front-build:tour1 sh -c 'cd /app/packages/twenty-front && npx jest esc-tour --config=jest.config.mjs'`
- **Do not animate the spotlight.** Its geometry is re-read every animation frame so it can follow a
  target that scrolls or finishes loading; a CSS transition on the same properties fights that and
  lags a frame behind. This was a real defect, now removed — do not add it back because the movement
  looks abrupt.
- **The interaction lock must trap focus too.** Blocking the mouse and leaving Tab free is the same
  hole by a different input device.
- **CT140 already holds another session's work** at `/root/twenty-esc-src` and
  `/root/esc-smoke/`. This session used `/root/twenty-tour-src` and touched neither.
- **The cheap-lane read offload was broken for most of this session** (dispatch exit 3 / 124), which
  is why several reads went through the refusal rail. Unrelated to this work; reported, not
  investigated.

## Not started — each needs its own ticket or prompt

1. **The fork's images have no home.** Still true, and it forced this build to split across two
   hosts. The prompt for it is written and unclaimed; the ask ledger row is `PARTIAL`.
2. **The CT175 order-freshness watchdog cannot alert on a probe failure**, and its firing record
   cannot say what failed. Unclaimed.
3. **W7–W19 on #19873** need re-scoping against the button-not-wizard shape. W16 and W18 in
   particular now have nothing to measure.
4. **Nothing records who has completed onboarding.** Accepted as part of the decision; if that
   reporting is ever wanted it needs somewhere to live.
