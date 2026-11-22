# twenty-esc-supplier — the ESC supplier CRM on CT175 (esc-supplier.crm.fiszu.com)

Third Twenty stack on CT175, set up 2026-11-22 as a clean base for Amir. Deployed at
`/root/twenty-esc-supplier`; this directory is its source of truth.

| Piece | Where |
|---|---|
| Stack | `/root/twenty-esc-supplier` on CT175 (192.168.103.175), compose project `twenty-esc-supplier` |
| Image | `twenty-esc-supplier-sso:<TAG>`, built on CT175 from `Dockerfile` (upstream `twentycrm/twenty` + SSO patches, below) |
| Port | `192.168.103.175:3002` → container 3000 (esc = 3000, rc = 3001) |
| Edge | Pangolin resource 3758 → `192.168.103.175:3002`, Redirect-Manager SSO allow-any (same as esc/rc) |
| DNS | Cloudflare `fiszu.com`: explicit `CNAME esc-supplier.crm.fiszu.com → edge.fiszu.com`, not proxied (not the `*.crm` wildcard) |
| Login | Keycloak `fiszu` realm client `twenty-esc-supplier` (declared in `keycloak-client-manifest`), Twenty OIDC SSO provider `ae1fc80a-19d7-4de6-9581-09c4fcf63e5e` |
| Workspace | "ESC Supplier" `9562d5e5-9a2b-4eab-b295-a0099241cd49`, owner/admin `amir@escooterclinic.co.uk`, password/Google/Microsoft login off, approved domain `escooterclinic.co.uk`, public invite link on |

`.env` on the host (root 0600, never in git): `TAG`, `APP_SECRET`, `PG_DATABASE_PASSWORD`,
`ENCRYPTION_KEY`.

## Why the image is patched (Keycloak SSO on self-hosted)

Upstream gates `/auth/oidc/*` behind `EnterpriseFeaturesEnabledGuard`. Without a paid
`ENTERPRISE_KEY` the login redirects to `/verify?errorMessage=Enterprise+features+are+not+enabled`
(measured on the unpatched `twenty-rc` stack, v2.57.1, 2026-11-22). The `Dockerfile` applies:

- `../deploy/patch-enterprise.cjs` — the same 4-method bypass esc.crm runs (business-authorised,
  see `scripts/PATCH_MANIFEST.md`);
- `patch-fresh-token.cjs` — `isValidWithFreshToken()`, the method the guard calls in newer Twenty.

Both fail the build if their anchor moves. `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS: auth.fiszu.com`
in the compose file lets Twenty's SSRF guard reach Keycloak, which resolves to the internal edge
(192.168.103.191) from CT175.

## Deploy / upgrade

    # copy this repo's esc/ (at least deploy/patch-enterprise.cjs and esc-supplier/) to
    # /root/twenty-esc-supplier-build on CT175, then:
    pct snapshot 175 <name>                      # on the CT175 node
    docker compose exec -T db pg_dumpall -U postgres > /root/twenty-esc-supplier-backup-<date>.sql
    ./upgrade.sh v2.61.0 ...                     # builds each tag, one step at a time, stops on failure

Migrations run on server start. Twenty >= 2.34 needs PostgreSQL >= 15 (this stack runs 16).

## SSO provider secret

The Keycloak client secret lives only in Keycloak and in Twenty's
`core."workspaceSSOIdentityProvider"` row. To rotate: on CT171,
`python3 -m kc_manifest --apply --rotate-secret twenty-esc-supplier --secret-out <0600 file>`, then
set that row's `clientSecret` to it.
