# Handover — Twenty Enterprise/SSO overlay scaffold

**Date:** 2026-06-04
**Repo:** `eMobility-Innovations/twenty`
**Branch:** `esc/enterprise-sso-overlay` (off `emobility-unity`)
**Scaffold commit:** `b51b253c`

---

## Status

**DONE (scaffold only).** The `esc/` overlay scaffold for unlocking Twenty's
premium SSO is built, committed, and pushed. **No Docker image was built and
nothing was deployed** — that, plus wiring Keycloak, is the next, human-supervised
session. This run was deliberately scoped to repository scaffolding (no SSH, no
CT 175, no docker build, no deploy).

## What was done

Mirrored the `eMobility-Innovations/docuseal-full` `esc/` overlay pattern (branch
`claude/remove-agplv3-restrictions-9aJHV`) into this fork:

- `esc/overlay/packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts`
  — a **byte-for-byte upstream copy** with **only `isValid()` changed** to
  `return true;` (verified via `diff`: the sole change is that one method body;
  signature, all other methods, and imports are untouched). This unlocks the
  premium SSO features gated by `EnterpriseFeaturesEnabledGuard`, which throws
  "Enterprise features are not enabled" when `isValid()` is false.
- `esc/esc-apply.sh` (exec) — overlays `esc/overlay/*` onto the working tree,
  backing each original up to `.esc-originals/`, then runs the verifier. Adapted
  for Twenty's TS monorepo: **no `bundle`/`rails`** steps (DocuSeal-specific); the
  build is a Docker image (the script's "Next steps" output explains options A/B).
- `scripts/PATCH_MANIFEST.md` — self-contained doc of the single patch, why the
  gate exists in v2.0, the AGPLv3 + commercial-tier/licensing notes, and the
  upgrade re-apply procedure.
- `scripts/verify-esc-features.sh` (exec) — **portable** (awk-isolates the
  `isValid` block, then plain `grep`; no GNU-only `grep -P`) check that the applied
  tree has `isValid()` returning `true` and no longer calling
  `hasValidEnterpriseValidityToken()`.
- `scripts/esc-modified-files.txt`, `esc/README.md`.

The upstream tree was left **pristine** — the patch lives only in `esc/overlay/`;
`esc-apply.sh` is what stamps it onto the tree at build time.

Files touched: all under `esc/` and `scripts/` (new). `git status` before commit
showed only those two dirs as untracked; nothing upstream modified.

## Decisions & rationale (do not re-open without reason)

1. **Patch `isValid()` → `return true;`, not the guard.** One method, in the
   service the guard consults. Returning `true` (vs. only short-circuiting the
   token check) also survives the **daily enterprise-key-validation cron** that
   would otherwise flip the validity token invalid. (Plan §"exact patch".)
2. **Overlay holds a full file copy, upstream tree stays pristine.** This is the
   docuseal pattern — keeps upstream cleanly upgradable; `esc-apply.sh` reconciles.
3. **No `bundle`/`rails` in `esc-apply.sh`.** Twenty is a TS Nx monorepo; those
   DocuSeal steps don't apply. The real build is a Docker image.
4. **Portable verify (awk, not `grep -P`).** The verifier runs on Linux build/CT
   hosts but must not silently no-op on BSD grep.
5. **`PATCH_MANIFEST.md` is self-contained.** Full rationale + AGPL notes vendored
   in-repo so a stranger cloning the fork can resolve everything without the
   `twenty-ingest` planning docs.
6. **Scope honored:** scaffolding only this run. No image build, no CT 175, no
   deploy, no Keycloak wiring — those need a supervised session.

## Next steps (human-supervised session)

1. **Pick build option** (PATCH_MANIFEST.md / esc-apply.sh document both):
   - **B (recommended first):** thin overlay `FROM twentycrm/twenty:v2.0.0`,
     patch the compiled `isValid()` in
     `dist/engine/core-modules/enterprise/services/enterprise-plan.service.js`
     (~line 156). Fast, no full monorepo build.
   - **A (faithful):** full source build from this fork after `./esc/esc-apply.sh`.
2. **Dry-run the scaffold locally first:** `./esc/esc-apply.sh --dry-run` (should
   report 1 OVERWRITE), then `./esc/esc-apply.sh` and confirm
   `scripts/verify-esc-features.sh` passes. (Not run this session — see Gotchas.)
3. **Build + tag** the custom image (e.g. `ghcr.io/emobility-innovations/twenty:v2.0.0-esc`).
4. **On CT 175:** back up `/root/twenty-esc/docker-compose.yml`, point its `image:`
   at the custom tag (keep `twentycrm/twenty:v2.0.0` for rollback), `docker compose up -d`.
   **Do NOT touch the separate `twenty-rc` (v1.17) stack.**
5. **Verify in-app:** "Enterprise features are not enabled" toast gone; SSO settings
   UI reachable.
6. **Wire Keycloak (fiszu realm):** create a Twenty OIDC client, add it as the IdP
   in Twenty's SSO settings, test login + JIT provisioning. (Ties into the A4 plan.)
7. Update `PATCH_MANIFEST.md` status + write a deploy handover; log Redmine hours.

## How to resume

```bash
cd <your twenty clone>          # shallow, single-branch emobility-unity
git checkout esc/enterprise-sso-overlay
git log --oneline -1            # expect b51b253c (scaffold)

# preview + apply the overlay onto the tree, then verify:
./esc/esc-apply.sh --dry-run
./esc/esc-apply.sh
bash scripts/verify-esc-features.sh
```

Read **`scripts/PATCH_MANIFEST.md`** first — it has the gate mechanics, the patch,
and the upgrade procedure. Deployment facts for CT 175 are in the planning docs in
the `twenty-ingest` repo: `docs/phase0/twenty_fork_overlay_plan.md` and
`docs/phase0/twenty_sso_licensing.md`.

## Gotchas / anti-patterns

- **Scripts were NOT executed this session** (the session's tools were restricted to
  git/gh/file ops to enforce the no-deploy scope; even `bash -n`/dry-run were
  gated). They are review- and `diff`-validated only. **First action next session:
  run the dry-run + verify** to confirm end-to-end before building.
- **Don't patch the upstream tree file directly** — only `esc/overlay/…`. If you
  edit the tree copy, `esc-apply.sh` has nothing to apply and upgrades will silently
  lose the patch.
- **On upgrade, re-copy the fresh upstream file into the overlay, then re-apply the
  one-line change** — don't blindly keep the old overlay file, or you'll revert
  unrelated upstream fixes in that service.
- **Licensing:** this bypasses Twenty's paid commercial SSO tier. It's AGPL-legal
  (self-host + offer source) and business-authorised (Patryk 2026-06-04), but the
  supported alternative is buying an Organization (Self-Hosted) license and dropping
  a real `ENTERPRISE_KEY` — no fork needed. Don't quietly expand the patch surface
  beyond SSO without sign-off.
- **`isValid()` location may move** in future Twenty versions. The verifier fails
  loudly (FILE not found / method not patched) rather than passing silently — trust it.
