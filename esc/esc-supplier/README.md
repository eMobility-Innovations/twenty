# twenty-esc-supplier — the ESC supplier CRM on CT175 (esc-supplier.crm.fiszu.com)

Third Twenty stack on CT175, set up 2026-11-22 as a clean base for Amir. Upstream
`twentycrm/twenty` image, like `twenty-rc` (see `esc/rc/`) — NOT the ESC fork build
(`twenty-esc`, see `esc/deploy/`). Deployed at `/root/twenty-esc-supplier`; this directory
is its source of truth.

| Piece | Where |
|---|---|
| Stack | `/root/twenty-esc-supplier` on CT175 (192.168.103.175), compose project `twenty-esc-supplier` |
| Port | `192.168.103.175:3002` → container 3000 (esc = 3000, rc = 3001) |
| Edge | Pangolin resource 3758 → `192.168.103.175:3002`, Redirect-Manager SSO allow-any (same as esc/rc) |
| DNS | Cloudflare `fiszu.com`: explicit `CNAME esc-supplier.crm.fiszu.com → edge.fiszu.com`, not proxied (not the `*.crm` wildcard) |
| Login | Keycloak `fiszu` realm client `twenty-esc-supplier` (declared in `keycloak-client-manifest`), wired as Twenty's OIDC SSO provider |
| Workspace | "ESC Supplier", owner/admin `amir@escooterclinic.co.uk`, password login off, approved domain `escooterclinic.co.uk` |

`.env` on the host (root 0600, never in git): `TAG`, `APP_SECRET`, `PG_DATABASE_PASSWORD`,
`ENCRYPTION_KEY`.

## Deploy / upgrade

    pct snapshot 175 <name>                      # on the CT175 node
    docker compose exec -T db pg_dumpall -U postgres > /root/twenty-esc-supplier-backup-<date>.sql
    ./upgrade.sh v2.61.0 ...                     # one tag per step, stops on the first failure

Migrations run on server start. Twenty >= 2.34 needs PostgreSQL >= 15 (this stack runs 16).

## SSO provider

The Keycloak client secret lives only in Keycloak and in Twenty's
`core."workspaceSSOIdentityProvider"` row (issuer `https://auth.fiszu.com/realms/fiszu`,
client id `twenty-esc-supplier`). After rotating the secret in Keycloak, update that row's
`clientSecret` to match.
