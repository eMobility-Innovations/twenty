# twenty-rc — the separate Twenty stack on CT175 (rc.crm.fiszu.com)

Upstream `twentycrm/twenty` image, NOT the ESC fork build (that is `twenty-esc`, see
`esc/deploy/`). Deployed at `/root/twenty-rc` on esc03 CT175; this directory is its source
of truth (before 2026-11-01 the compose file existed only on the host).

`.env` on the host (root 0600, never in git): `TAG`, `APP_SECRET`, `PG_DATABASE_PASSWORD`,
`ENCRYPTION_KEY` (dedicated key required from Twenty 2.5: secrets move to an `enc:v2:`
envelope keyed by it — https://docs.twenty.com/developers/self-hosting/upgrade-guide).

## Deploy / upgrade

    pct snapshot 175 <name>                      # on esc03
    docker compose exec -T db pg_dumpall -U postgres > /root/twenty-rc-backup-<date>.sql
    ./upgrade.sh v1.18.1 v1.19.1 ...             # one tag per step, stops on the first failure

Migrations run on server start. Below v1.23 every minor must be stepped through; from v1.23
you can jump to the latest. Twenty >= 2.34 needs PostgreSQL >= 15 (this stack runs 16).
