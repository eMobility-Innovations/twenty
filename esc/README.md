# ESC overlay system (Twenty fork)

This `esc/` directory holds **all** eMobility/ESC customizations to upstream
Twenty, kept separate from the upstream tree so upgrades stay manageable. The
pattern mirrors [`eMobility-Innovations/docuseal-full`](https://github.com/eMobility-Innovations/docuseal-full).

## How it works

- `esc/overlay/<upstream-relative-path>` — patched copies of upstream files, at
  their exact upstream paths. Currently **one** file (the Enterprise/SSO gate).
- `esc/esc-apply.sh` — overlays `esc/overlay/*` onto the working tree, backing up
  each original to `.esc-originals/` first. Run it on a fresh clone **and** after
  every upstream upgrade (it is idempotent).
- `scripts/PATCH_MANIFEST.md` — documents every patch, why it exists, and how to
  re-apply it when upstream moves the code. **Read this first.**
- `scripts/verify-esc-features.sh` — confirms the patch is present in the applied tree.
- `scripts/esc-modified-files.txt` — flat list of touched upstream files.

## The one customization (today)

Unlock Twenty's premium **SSO** (SAML / generic-OIDC, i.e. our Keycloak `fiszu`
realm) on self-hosted without a paid `ENTERPRISE_KEY`, by making
`EnterprisePlanService.isValid()` return `true`. Business-authorised
(Patryk, 2026-06-04); AGPLv3 + licensing notes in `scripts/PATCH_MANIFEST.md`.

## Quick start

```bash
./esc/esc-apply.sh --dry-run   # preview
./esc/esc-apply.sh             # overlay + verify
# then build a custom image and point CT 175 twenty-esc at it (see esc-apply.sh output)
```
