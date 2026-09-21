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
- **Last updated:** 2026-09-09
- **Status:** LIVE. Option B (compiled patches on the official image) is what runs on
  CT 175 as `twenty-esc-sso:*`. The "scaffold only, image NOT yet built" line that stood
  here was true on 2026-06-04 and wrong from 2026-06-05 onward — the image was built and
  deployed the next day and SSO was confirmed end-to-end on 2026-06-07.

---

## Overview

ESC runs a self-hosted Twenty instance (`esc.crm.fiszu.com`, CT 175 stack
`twenty-esc`). On Twenty **v2.0** the only customization we need is **one**:

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

### The patch (single file, single method)

| File (overlay path) | What changed | Conflict resolution |
|---------------------|--------------|---------------------|
| `packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts` | `isValid()` now `return true;` unconditionally (was `return this.hasValidEnterpriseValidityToken();`). **Only the method body changed** — signature, every other method, and all imports are byte-for-byte upstream. | If upstream refactors `isValid()` or moves the gate, find the new method/guard that `EnterpriseFeaturesEnabledGuard` consults and make it report valid. The principle: **the guard that throws "Enterprise features are not enabled" must pass.** Re-copy the fresh upstream file into the overlay, then re-apply only the `isValid → true` change so the rest of the file stays current. |

Returning `true` (rather than only short-circuiting the token check) also makes the
bypass **durable** against the daily validation cron flipping the token invalid.

### Verification

`scripts/verify-esc-features.sh` greps the **applied tree** to confirm
`isValid()` returns `true` and that the upstream token-based body is gone. Run it
after `esc-apply.sh` and after every upstream upgrade.

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
   re-apply the one-line `isValid → true` change (keeps the file current).
3. `./esc/esc-apply.sh` (overlays + verifies).
4. Rebuild the custom image, repoint CT 175 `twenty-esc`, keep the official tag
   for rollback.

Do **not** touch the separate `twenty-rc` (v1.17) stack on CT 175 — only `twenty-esc`.

---

## File index

- `esc/overlay/` — patched upstream files (mirror upstream paths). Currently one file.
- `esc/esc-apply.sh` — overlay installer / re-apply-after-upgrade.
- `scripts/verify-esc-features.sh` — post-apply verification.
- `scripts/esc-modified-files.txt` — flat list of touched upstream files.
