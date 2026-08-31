# ESC Overlay — Patch Manifest

This fork carries a single, business-authorised overlay over upstream Twenty:
**removal of the Enterprise-licence gate so SSO works on the self-hosted ESC
instance without a paid Enterprise key.**

- **Authorised by:** Patryk (WhatsApp, 2026-06-04) — *"Fork twenty plz, and remove
  the enterprise limitations… mainly after SSO… but fork it smartly."*
- **Legal:** Twenty is AGPLv3. Self-hosted modification is permitted; source is
  offered to internal users (this repo). This is a documented circumvention of
  Twenty's paid tier for internal self-hosting, not redistribution.
- **Pattern:** thin overlay on the **official published image** ("option B") —
  patch the compiled server, do not rebuild the monorepo. Chosen for speed; can
  graduate to a full source build later without changing the deploy surface.

## Files

| File | Purpose |
|---|---|
| `patch-enterprise.cjs` | The patch. Rewrites 4 methods in the compiled `enterprise-plan.service.js`. Asserts all 4 applied or exits non-zero. |
| `Dockerfile` | `FROM twentycrm/twenty:${TWENTY_VERSION}` + run the patch. Produces `twenty-esc-sso:<version>`. |
| `esc-build.sh` | Build the image (`TWENTY_VERSION` overridable). |
| `esc-deploy.sh` | Point the CT 175 `twenty-esc` stack at the image, snapshot + roll, with one-step rollback. |
| `esc-upgrade.sh` | Re-apply the overlay onto a newer upstream version in one command. |

## The patch (target: `packages/twenty-server/.../enterprise/services/enterprise-plan.service.js`)

| Method | Upstream behaviour | Patched to |
|---|---|---|
| `isValid()` | false unless a remotely-validated `ENTERPRISE_KEY` token is present | `return true` |
| `hasValidEnterpriseValidityToken()` | checks a cached validity token (daily cron) | `return true` |
| `getLicenseInfo()` | reports licence/expiry from the validity payload | returns a synthetic valid ESC licence, ~10y expiry |
| `getSubscriptionStatus()` | reports subscription state | returns `active`, ~10y period end |

`isValid()` alone unlocks the SSO guard
(`auth/guards/enterprise-features-enabled.guard.ts`, which throws *"Enterprise
features are not enabled"*). The other three keep the rest of the licence-aware
UI/cron self-consistent so nothing else flips the gate back —
notably the **daily** `enterprise-key-validation.cron.job.ts` can no longer
invalidate the token.

## Deployed state (as built on CT 175, 2026-06-05)

- Image `twenty-esc-sso:v2.0.0` runs the `twenty-esc` stack
  (`twenty-esc-server-1`, `-worker-1`), reachable at `https://esc.crm.fiszu.com`.
- SSO is live: an **OIDC IdP** (`clientID: twenty-esc`, issuer
  `https://auth.fiszu.com/realms/fiszu`) is configured and **Active** in the
  workspace.
- `twenty-rc` (upstream v1.17.0) is a **separate** stack and is intentionally
  **not** touched by this overlay.

## Upgrade procedure

```bash
./esc/esc-upgrade.sh v2.1.0   # builds + prints the snapshot/cutover/rollback steps
```

If the build fails with `Expected 4 patches, applied N`, upstream changed
`enterprise-plan.service.js`. Re-derive the regexes in `patch-enterprise.cjs`
against the new version, update the method table above, then re-run.
