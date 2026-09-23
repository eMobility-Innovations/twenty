# ESC Twenty Patch Manifest

This document describes every customization the ESC fork makes to the upstream
Twenty codebase. Use it as the reference when resolving conflicts during an
upstream upgrade. The pattern mirrors `eMobility-Innovations/docuseal-full`
(the `esc/` overlay system): **all ESC changes live under `esc/overlay/` at their
exact upstream-relative paths; `esc/esc-apply.sh` overlays them onto a clean
upstream checkout (backing up originals to `.esc-originals/`); re-running
`esc-apply.sh` after pulling a new upstream version re-applies the patch.**

- **Branch:** `esc/enterprise-sso-overlay`
- **Upstream base:** `eMobility-Innovations/twenty` @ `emobility-unity` (a fork of
  `twentyhq/twenty`), Twenty **v2.0.x** line.
- **Last updated:** 2026-09-23
- **Status:** LIVE. Option B (compiled patches on the official image) is what runs on
  CT 175 as `twenty-esc-sso:*`. The "scaffold only, image NOT yet built" line that stood
  here was true on 2026-06-04 and wrong from 2026-06-05 onward — the image was built and
  deployed the next day and SSO was confirmed end-to-end on 2026-06-07.

---

## Overview

ESC runs a self-hosted Twenty instance (`esc.crm.fiszu.com`, CT 175 stack
`twenty-esc`). On Twenty **v2.0** the fork carries **three** customizations, no more:

1. **Enterprise feature unlocking (SSO)** — remove the Organization-license gate
   so SAML / generic-OIDC SSO (our **Keycloak** `fiszu` realm) and the SSO settings
   UI work without a paid, remotely-validated `ENTERPRISE_KEY`.

2. **An exact-match SSRF allowlist** (`esc/deploy/patch-ssrf-allowlist.cjs`) — Twenty's
   workflow HTTP_REQUEST action refuses any host resolving to a private address, fails
   closed, and re-checks after DNS, with no allowlist upstream. One short-circuit at the
   top of `isPrivateIp` — the single predicate BOTH the hostname check and the post-DNS
   socket check use — treats an address named in `ESC_SSRF_ALLOWED_HOSTS` as public.

   With the variable unset or empty the guard is **exactly** upstream's, so the default
   is the safe one. The match is exact on the address, never a range: a CIDR here would
   quietly re-open the whole estate to anyone who can author a workflow.

   Authorised 2026-09-08 (Amir) for C4 / Redmine #14830: a workflow button that rebuilds
   ONE customer's interest profile by calling `twenty-ingest` on CT 175. The alternative
   was publishing that endpoint on the public internet, a larger exposure than naming one
   host here.

3. **A guided tour** — a "Tour" entry in the CRM sidebar that walks a new person through
   the product (Redmine #19873). One upstream file overlaid, everything else in ESC-owned
   code under `esc/new/`. Category 3 below.

That is the entire patch surface today. Everything else is upstream-stock.

**Verifying what is RUNNING:** `scripts/verify-esc-features.sh` checks the source overlay;
`scripts/verify-esc-image.sh` checks the built image inside the running container. Use the
second one after any upgrade — an option-B patch lives only in the image, so a rebuild from
a new upstream tag that skips the patch scripts produces a healthy container that has
silently lost them.

---

## Category 1: Enterprise / SSO feature unlocking

### Why this gate exists (v2.0)

Twenty self-hosted has three relevant tiers:

| Plan | SAML / generic-OIDC SSO | How it's gated |
|------|-------------------------|----------------|
| Free (Self-Hosted) | ❌ no | What we run now → red toast "Enterprise features are not enabled" |
| Organization (Self-Hosted) | ✅ yes | Requires a paid **Enterprise key**, validated against Twenty's **remote** licensing API |

In code (`packages/twenty-server/src/engine/core-modules/`):

- `auth/guards/enterprise-features-enabled.guard.ts` throws
  **"Enterprise features are not enabled"** when `enterprisePlanService.isValid()`
  is `false`. **That guard is what blocks SSO.**
- `enterprise/services/enterprise-plan.service.ts` — `isValid()` returns
  `hasValidEnterpriseValidityToken()`. The validity token comes from validating
  `ENTERPRISE_KEY` against `ENTERPRISE_API_URL` (remote), persisted as an
  `AppToken`, and re-checked by a **daily cron**
  (`enterprise/cron/jobs/enterprise-key-validation.cron.job.ts`).
- The CT 175 compose sets `ENTERPRISE_KEY: self-hosted-esc` — a **placeholder**,
  not a real key → remote validation fails → `isValid()` is false → SSO stays off.
- There is **no local env/flag** that fakes a valid key. On v2.0 you cannot enable
  SSO without either a real (paid) key or a code change.

### The patch (single file, FOUR methods)

| File (overlay path) | What changed | Conflict resolution |
|---------------------|--------------|---------------------|
| `packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts` | Four method bodies replaced, plus three module-level constants: `isValid()` → `true`; `hasValidEnterpriseValidityToken()` → `true`; `getLicenseInfo()` → a valid ESC licence; `getSubscriptionStatus()` → `status: 'active'`. Signatures, every other method and all imports are byte-for-byte upstream. | If upstream refactors any of them or moves the gate, find the new method/guard that `EnterpriseFeaturesEnabledGuard` consults and make it report valid. The principle: **the guard that throws "Enterprise features are not enabled" must pass, and the frontend must not see an invalid licence.** Re-copy the fresh upstream file into the overlay, then re-apply the four overrides so the rest of the file stays current. |

**Why four, not one — corrected 2026-09-22.** Until then the source overlay overrode
`isValid()` only, while `esc/deploy/patch-enterprise.cjs` — the compiled patch that
production actually runs — overrides four, and says in its own header why: the frontend
reads `getSubscriptionStatus()` and `getLicenseInfo()`. A preflight found that a source
build would therefore have put **"Your enterprise key is no longer valid"** in front of
every signed-in user, and `esc/deploy/build-source-image.sh` would have reported PASS on
the image that did it. `InformationBannerInvalidEnterpriseKey.tsx` renders whenever
`hasValidEnterpriseKey === true && hasValidSignedEnterpriseKey !== true &&
hasValidEnterpriseValidityToken !== true`, and `ENTERPRISE_KEY: self-hosted-esc` is not a
signed JWT, so that triple held. Leaving `getSubscriptionStatus()` unpatched also starts
outbound calls to `ENTERPRISE_API_URL` that this instance has never made.

Option B (the compiled patch) is this fork's stated rollback for option A (the source
build), so the two must present the **same** licence. The constants
(`ESC_LICENSEE`, `ESC_SUBSCRIPTION_ID`, `ESC_VALIDITY_WINDOW_MS`) are kept equal to the
values in `patch-enterprise.cjs` for that reason.

Returning `true` (rather than only short-circuiting the token check) also makes the
bypass **durable** against the daily validation cron flipping the token invalid.

### Verification

`scripts/verify-esc-features.sh` reads the **applied tree** and confirms `isValid()`
returns `true` and that the upstream token-based body is gone. Run it after
`esc-apply.sh` and after every upstream upgrade.

It also checks **parity with the compiled patch, from a list it derives rather than one
written down**: it extracts the patched method names out of
`esc/deploy/patch-enterprise.cjs` and requires each one to carry an `ESC OVERLAY PATCH`
marker inside its body in the applied source file. Add a fifth method to the compiled
patch and this check fails until the overlay matches — verified both ways on 2026-09-22
by adding `hasValidSignedEnterpriseKey()` to the patch and watching it fail, and by
removing one marker and watching only that method fail.

Two traps were hit writing that check, and both are commented in the script: a plain
substring match misses `async getLicenseInfo(`, and an end anchor of `/^  }/` stops
inside a multi-line signature such as `getSubscriptionStatus(): Promise<{ … } | null> {`.
Either one silently reports a correctly overridden method as not overridden.

**What this check still cannot do:** prove the two routes are behaviourally equivalent.
The compiled patch injects `return true;` onto the signature line while `nest build`
pretty-prints, so the two produce different compiled text for identical semantics and no
grep can verify both. That needs querying `hasValidEnterpriseKey`,
`hasValidSignedEnterpriseKey`, `hasValidEnterpriseValidityToken` and
`getSubscriptionStatus` over GraphQL against each image — still outstanding.

---

## Category 2: SSRF allowlist (`ESC_SSRF_ALLOWED_HOSTS`)

### Why this patch exists

Twenty's workflow `HTTP_REQUEST` action refuses any host that resolves to a private address —
*"Request to internal IP address 192.168.103.175 is not allowed."* It is a deliberate anti-SSRF
control, it fails closed, and it re-checks **after** DNS, so no hostname gets around it. Upstream
exposes no allowlist.

We need exactly one internal endpoint reachable from a workflow: the `twenty-ingest` service on
CT175, which rebuilds one customer's interest profile (C4, Redmine #14830). The alternative was
publishing that endpoint on the internet, which is the larger exposure.

### The patch (single file, single predicate)

`packages/twenty-server/src/engine/core-modules/secure-http-client/utils/is-private-ip.util.ts`

A short-circuit at the top of `isPrivateIp`, the single predicate **both** call sites use (the
hostname check and the post-DNS socket check). An address named in `ESC_SSRF_ALLOWED_HOSTS` is
treated as public; everything else is untouched.

Two properties are part of the contract, not details:

- **Fails closed.** With the variable unset or empty, behaviour is exactly upstream's.
- **Exact match on the address.** Never a range, never a prefix — a CIDR here would quietly
  re-open the whole estate to workflow-driven requests.

### History, and why there are two copies of this patch

It was written first as a **compiled** patch, `esc/deploy/patch-ssrf-allowlist.cjs`, applied to
the official image by `esc/deploy/Dockerfile.option-b` (twenty#15, deployed 2026-09-09). That is
what CT175 runs today.

The **source** overlay was added 2026-09-21, when CT175 was moved to a source build so the CRM
could carry a new backend module. Until then the overlay held only the Enterprise patch, so a
source build would have shipped without the allowlist — and that failure is quiet: one workflow
stops working and nothing else looks wrong.

Keep both in step. If you change one, change the other, or a rollback to the compiled-patch image
behaves differently from the thing you tested.

### Verification

- Source tree: `scripts/verify-esc-features.sh`, section 2.
- Built image: `scripts/verify-esc-image.sh`, which greps the compiled `dist/`.
- Live: a workflow step calling the allowlisted host must succeed. Nothing short of that proves it.

## Category 3: The guided tour ("Tour" in the sidebar)

Redmine [#19873](https://redmine.fiszu.com/issues/19873). Added 2026-09-22 after the operator
replaced the stored-state onboarding wizard with a button anyone can press at any time:

> "we can skip the database table and the flags of who is onboarded and who's not and we can
> easily do a button in the sidebar of Twenty CRM and when people click on it, it walks them
> through the onboarding"

That decision deleted the largest obstacle in front of the next cutover along with the
feature it belonged to. The wizard needed `core."escOnboarding"`, and the image entrypoint
runs TypeORM migrations **only when the `core` schema is absent**, which on CT175 it is not —
so the table would have shipped dead with no boot-time symptom. With no table there is
nothing for the migration path to fail to run.

### Why this patch exists

There is no upstream extension point for a sidebar entry. Twenty's navigation drawer renders a
fixed set of items in `NavigationDrawerOtherSection`, and nothing reads a registry, a plugin
list or a config key to add one. So one upstream file is overlaid — and exactly one.

### The patch (single file, single element)

`packages/twenty-front/src/modules/navigation/components/NavigationDrawerOtherSection.tsx`

One import and one element, placed first in the "Other" section so somebody who has never
seen the product finds it without being told where to look. The diff against upstream is two
hunks and touches nothing else in the file.

Everything the tour actually is lives in ESC-owned code that upstream has never seen, added
by `esc/new/` rather than overlaid:

`packages/twenty-front/src/modules/esc-tour/` — the controller hook, the spotlight/popover
overlay, the anchor resolver, the placement maths and the script.

Four properties are part of the contract, not details:

- **No new npm dependency.** A tour library (driver.js and friends) would mean a permanent
  `package.json` and `yarn.lock` divergence to reconcile on every upstream sync, and neither
  file is allowlisted by `verify.sh`'s fork-scope check. The overlay is only survivable
  because it is small.
- **Anchors are ROUTES, never class names.** A step points at `a[href="/objects/people"]`. A
  route is part of the product; a linaria hash is an artefact of the build and changes
  without anybody deciding that it should. `escTourSteps.test.ts` fails if an anchor ever
  starts with a class selector.
- **A missing anchor skips its step, and says so.** `selectShowableEscTourSteps` resolves the
  script once when the tour opens, drops the steps whose target is not on the page, and
  returns their ids, which are logged by name. Without this a renamed route makes the tour
  quietly shorter, which looks exactly like a tour that is working.
- **The tour changes no data.** It reads the DOM and paints over it. There is no mutation, no
  API call, and no record of who has taken it — by the operator's decision above.
- **It owns its CSS instead of using linaria**, which is what the rest of twenty-front uses.
  Linaria is a build-time transform: `styled.div` only works because a bundler plugin has
  already replaced it, and twenty-front's jest config carries no linaria transform — so a
  component built from `@linaria/react` cannot be rendered in a unit test at all. That would
  leave the overlay, the part a person actually sees, permanently untestable. The overlay
  lives in a portal on `document.body` and shares no tokens or stacking context with the
  product's surfaces, so it loses nothing by injecting its own stylesheet once, by id.

### Delivery: a FRONT-ONLY image layer

`esc/deploy/Dockerfile.front-layer` + `esc/deploy/build-front-layer.sh`.

The frontend is rebuilt from this checkout with the overlay applied, and laid over an
existing ESC image as a single `COPY` into `/app/packages/twenty-server/dist/front`. **The
server binary is not recompiled**, so the Nest dependency-injection failure that took the CRM
down for 16h41m on 2026-09-21 cannot be reintroduced by this image, and the two compiled
server patches above are inherited from the base rather than re-applied.

Two facts make it safe, both measured rather than assumed:

- `packages/twenty-front` is **byte-identical** between upstream `v2.0.0` and this fork's
  trunk (`git diff v2.0.0..HEAD -- packages/twenty-front` is empty), so the rebuilt bundle is
  the one production already serves, plus the tour.
- The server serves the front as plain static files through NestJS `ServeStaticModule` with
  `rootPath` `dist/front`. No asset manifest, no integrity check, no CSP pinning script
  hashes — replacing the directory as one unit is the whole operation.

`REACT_APP_SERVER_BASE_URL` is compiled into the bundle by vite. A bundle built with the
wrong value points the browser at the wrong API host and nothing in the image says so, which
is why `build-front-layer.sh` refuses to run without it.

`BASE_IMAGE` must be an **ESC** image. A layer built over a bare `twentycrm/twenty:v2.0.0`
would silently lose both server patches; `scripts/verify-esc-image.sh` is the check that
catches it, and step 3 of the deploy runs it.

### Verification

```bash
# after building, against the image
./scripts/verify-esc-tour.sh --image twenty-esc-sso:v2.0.0-tour1

# after deploying, against what is running
./scripts/verify-esc-tour.sh --container twenty-esc-server-1
CONTAINER=twenty-esc-server-1 ./scripts/verify-esc-image.sh
```

`verify-esc-tour.sh` proves the tour is PRESENT in the served bundle and that `index.html`
and its hashed assets came from the same build. **It cannot prove the tour RUNS**, and
nothing that greps a bundle can. A person clicking Tour in a browser is the proof, and it is
a numbered step of the deploy in `esc/deploy/DEPLOY.md`.

### The gate that guards the overlaid file

Two checks in `verify.sh` stand behind Category 3, and they answer different failures:

1. **The overlay-orphan check** (`gate: the ESC overlay must still line up with upstream`).
   `esc-apply.sh` cannot tell a rename from a new file: when an upstream sync MOVES or
   DELETES `NavigationDrawerOtherSection.tsx`, the overlay copy still applies — to a path
   nothing reads any more, and the build succeeds with no Tour button in it. The check is a
   pure path-existence test, so it runs anywhere a checkout does, and it turns that silent
   loss into a refused push.

2. **The `esc-tour` gate** (`gate: the ESC tour must carry its own checks`). It runs the
   module's six jest suites. Because the tour's code does not sit at a normal package path —
   `esc/new/` adds it and one upstream file is overlaid — the suite cannot be run where the
   files sit, so the gate has to apply the overlay INTO `packages/` first. It therefore:
   refuses on a tree with uncommitted changes under `packages/` (restoring would delete
   somebody's work); applies, runs and restores under a `trap`, so a failing test still puts
   the tree back; and fails if `packages/` is not clean afterwards rather than leaving the
   mess for the next command.

   **It used to be a gate that could not run.** No checkout carries twenty-front's
   dependencies and the shared gate runner does not install them, so it skipped on every host
   it had ever run on. It now runs the suite inside the front-build image
   (`ESC_TOUR_RUNNER_IMAGE`, default `esc-front-build:tour2`) when `node_modules` is absent,
   bind-mounting the working tree's tour sources and the overlaid file over the image's baked
   copies — so what is checked is what you are about to push, not what was compiled weeks ago.
   With neither dependencies nor the image it skips **loudly, by name**, saying in the same
   breath how to build the image.

The suite holds the properties above as tests, not as intentions: a step whose anchor is
missing is skipped and named (mutation-tested — remove the guard in
`selectShowableEscTourSteps` and the test fails), and no step may anchor on a generated class
name.

### Maintenance cost of this category

One overlaid file is the whole recurring bill, and it is a **frontend** file, which behaves
differently from the two server patches above:

- On every upstream sync, re-copy the fresh upstream `NavigationDrawerOtherSection.tsx` into
  `esc/overlay/…` and re-apply the two hunks (one import, one `<EscTourNavigationDrawerItem />`
  placed first in the section). Do not carry the old copy forward — that is how a fork silently
  reverts an upstream fix to the navigation drawer.
- If upstream moves or renames the file, the overlay-orphan check refuses the push. Re-point
  the overlay at the new path, update `scripts/esc-modified-files.txt`, and say so here.
- If upstream ever grows a real extension point for sidebar entries, **delete this overlay and
  use it.** The overlay exists only because none exists today.
- `esc/new/**` costs nothing at sync time: upstream has never seen those paths, so there is
  nothing to reconcile. Keeping the tour's own code there, and the overlay down to one file, is
  the entire reason this category is survivable.
- **No new npm dependency, ever.** `package.json` and `yarn.lock` are not allowlisted by
  `verify.sh`'s fork-scope check; a tour library would put a permanent divergence in both.

### State

Built and gated in this repo. Delivered as the front-only layer
`twenty-esc-sso:v2.0.0-tour1` over `twenty-esc-sso:v2.0.0-ssrf1`; the deploy, and the rollback
tarball that backs it, are in `esc/deploy/DEPLOY.md`, section *2026-09-22c*.

---

## Category 4: base image pinned by digest

### Why this patch exists

Upstream's `packages/twenty-docker/twenty/Dockerfile` uses the moving tag
`node:24-alpine` on all three of its stages. An image built from a moving tag cannot be
rebuilt identically, and nobody is told when the runtime moves underneath them.

Measured 2026-09-22: production (`twenty-esc-sso:v2.0.0-ssrf1`) runs Node **v24.15.0**;
a source build of the same fork three days later picked up **v24.21.0** from that tag.
Neither number was chosen by anybody.

### The patch (single file, three FROM lines)

| File (overlay path) | What changed | Conflict resolution |
|---------------------|--------------|---------------------|
| `packages/twenty-docker/twenty/Dockerfile` | All three `FROM node:24-alpine` become `FROM node:24.15.0-alpine@sha256:d1b3b4da11eefd5941e7f0b9cf17783fc99d9c6fc34884a665f40a06dbdfc94f`. Nothing else differs from upstream — verified by `diff` against the upstream file. | If upstream restructures the stages, re-copy the fresh upstream file and re-pin every `FROM node:` line. `verify-esc-features.sh` fails if any of them loses its digest, so a missed line is caught rather than shipped. |

**Pinned to 24.15.0, production's runtime — not to the current `24-alpine` digest.**
Operator decision, 2026-09-22. The cutover from the compiled-patch image to a source
build already changes the entire build route; carrying a six-patch Node bump in the same
change gives a misbehaving image two suspects instead of one. Moving Node is a separate,
deliberate change.

The digest is the **multi-arch index** digest, so the pin holds on amd64 and arm64.
Verified behaviourally rather than by reading the tag:

```sh
docker buildx imagetools inspect node:24.15.0-alpine     # -> sha256:d1b3b4da...
docker run --rm node@sha256:d1b3b4da... node --version   # -> v24.15.0
```

### To move Node deliberately

Pick the version, resolve its index digest with `docker buildx imagetools inspect
node:<version>-alpine`, **run the container and read `node --version` back** — a tag name
is not evidence — then update all three `FROM` lines together and say so in DEPLOY.md.

### Verification

`scripts/verify-esc-features.sh` section 3 counts `^FROM node:` lines in the applied tree
and requires every one to carry an exact version and a 64-hex digest. It prints the
offending lines when they do not match, and it fails rather than warns: an unpinned base
image is how the two Node versions above happened.

---

## Licensing / legal (AGPLv3)

- Twenty is **AGPLv3**. Modifying it and self-hosting is permitted; AGPL §13 only
  requires offering the modified source to network users — trivial for internal
  staff, and the fork (`eMobility-Innovations/twenty`) already is that source.
- This patch **does circumvent Twenty's paid commercial tier** (SSO is a premium
  Organization-license feature). That is a **business decision**, not a unilateral
  dev one. It was **authorised by Patryk (WhatsApp, 2026-06-04)** — "fork twenty,
  remove the enterprise limitations… mainly SSO… fork it smartly."
- The supported, no-code alternative is to buy an **Organization (Self-Hosted)
  license** and drop a valid key into `ENTERPRISE_KEY` (no fork, official image).
  That remains the clean fallback if the business prefers to pay.
- Free Google/Microsoft OAuth login is **not** an option here: ESC staff email is
  self-hosted (`mail.voltnation.pl`), not Google Workspace / Microsoft 365, so the
  free env-var OAuth path does not apply. The org IdP is **Keycloak** = premium path
  = why the patch (or a license) is required.

---

## Maintenance cost

A custom image means re-applying this overlay on every Twenty upgrade — the whole
point of the `esc/` pattern:

1. Pull/merge the new upstream into the fork.
2. Re-copy the fresh upstream `enterprise-plan.service.ts` into `esc/overlay/…`,
   re-apply the four method overrides and the constants block (keeps the file current).
   `verify-esc-features.sh` tells you if you missed one.
3. `./esc/esc-apply.sh` (overlays + verifies).
4. Rebuild the custom image, repoint CT 175 `twenty-esc`, keep the official tag
   for rollback.

Do **not** touch the separate `twenty-rc` (v1.17) stack on CT 175 — only `twenty-esc`.

---

## File index

- `esc/overlay/` — patched upstream files (mirror upstream paths). Currently THREE files;
  `scripts/esc-modified-files.txt` is the flat list and must match this directory exactly.
- `esc/esc-apply.sh` — overlay installer / re-apply-after-upgrade.
- `scripts/verify-esc-features.sh` — post-apply verification.
- `scripts/esc-modified-files.txt` — flat list of touched upstream files.
