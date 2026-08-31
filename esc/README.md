# `esc/` — eMobility (ESC) overlay for Twenty

This directory is the **entire** ESC customisation of upstream Twenty. The rest
of the repo tracks `twentyhq/twenty` unmodified, so upstream upgrades stay clean
and the overlay is the only thing we own.

**What the overlay does:** removes Twenty's Enterprise-licence gate so **SSO**
works on the self-hosted ESC instance without a paid Enterprise key. Authorised
by Patryk (2026-06-04). Full rationale, legal note, and per-method detail in
[`PATCH_MANIFEST.md`](PATCH_MANIFEST.md).

## Quick start

```bash
# Build the ESC image (default upstream v2.0.0)
./esc/esc-build.sh

# Deploy/cut-over the CT 175 twenty-esc stack to it (snapshot + one-step rollback)
./esc/esc-deploy.sh v2.0.0

# Later, when Twenty publishes a new version — re-apply the overlay in one command
./esc/esc-upgrade.sh v2.1.0
```

## Files

- `patch-enterprise.cjs` — the patch (compiled-server rewrite, 4 methods, self-asserting).
- `Dockerfile` — official image + patch → `twenty-esc-sso:<version>`.
- `esc-build.sh` / `esc-deploy.sh` / `esc-upgrade.sh` — build, deploy, upgrade.
- `PATCH_MANIFEST.md` — what/why/how + deployed state.

## Guardrails

- Only the **`twenty-esc`** stack on CT 175 uses this image. **`twenty-rc`
  (v1.17.0) is separate — never point it here.**
- Always keep the official image for rollback; `esc-deploy.sh` snapshots the
  compose file before any change.
- The patch self-asserts: if upstream changes the enterprise service, the image
  **build fails** rather than silently shipping the gate.
