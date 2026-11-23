# ESC Supplier Hub — the supplier data model as code

A [Twenty App](https://docs.twenty.com/developers/extend/apps/getting-started/quick-start)
holding the supplier hub's data model: objects, fields, relations, views and roles. It is
deployed to the **ESC Supplier** workspace at https://esc-supplier.crm.fiszu.com (the
`twenty-esc-supplier` stack on CT175, see `../README.md`). Redmine: umbrella #27542, layout
#27871.

Nothing in the supplier workspace's data model is built by hand in Settings: a change is a
file here, reviewed in a PR, then applied. That keeps the model in git and lets a fresh
instance be rebuilt from this directory.

## What goes where

| Change | Where |
|---|---|
| Object, field, relation, view, navigation item, role | `src/` here, one `define*` file per entity |
| Logic that reads other systems (Archives, PIM, Redmine, BaseLinker), reminders, scores | `twenty-ingest`, module `src/supplier/` — not here |
| Supplier stack deploy (image, compose, upgrades) | `../` (`esc/esc-supplier/`) |
| ESC or RC CRM | never from here |

Build rules for the supplier hub: `twenty-ingest/docs/supplier/BUILD-RULES.md`.

## Versions

`twenty`, `twenty-sdk` and `twenty-client-sdk` are pinned to the server's minor version
(server v2.60.3 → `2.60.0`). When the supplier stack is upgraded (`../upgrade.sh`), bump
these pins in the same PR series and re-run `plan`.

## Working on it

Node 24.5+ or 26.5.1+, Yarn 4 (`npx corepack yarn …` where Corepack is not installed).

    yarn install
    yarn typecheck && yarn test && yarn twenty app build   # what ./verify.sh runs

### Applying to the supplier workspace — run it FROM CT175

From a workstation, `apply` fails at the upload step with `File storage answered 302`: the
SSO edge in front of esc-supplier.crm.fiszu.com lets Bearer-authenticated API calls through
but redirects the CLI's signed file-upload URL to Keycloak (measured 2026-11-23). From a fleet
host the name resolves to the edge entrypoint without ForwardAuth (CT175 → 192.168.103.191),
so run it there, in a throw-away Node container:

    # credentials: an API key from Settings → Developers → API keys, role Admin (Applications
    # permission), never committed; an env file root 0600, deleted afterwards
    printf 'TWENTY_API_URL=https://esc-supplier.crm.fiszu.com\nTWENTY_API_KEY=%s\n' "$KEY" > /tmp/app.env
    docker run --rm --network host -v "$PWD":/app -w /app --env-file /tmp/app.env \
      node:24-bookworm-slim sh -c 'corepack enable && yarn install --immutable && yarn twenty app plan'
    # read the plan, then the same with `yarn twenty app apply`   (first time: --create)
    shred -u /tmp/app.env

`--network host` matters: it gives the container CT175's resolver, hence the internal edge.
First applied 2026-11-23 15:45 UTC (application + default role, nothing else).

`apply` asks before deleting objects or fields; never pass `--yes` on this workspace unless
the PR says which object or field is removed and why. Every entity needs a fixed
`universalIdentifier` (UUID v4) in `src/constants/universal-identifiers.ts`: changing one
is a delete plus a create, which drops that object's data.

Until V1 there is no test instance: changes are applied to the supplier workspace itself,
which nobody uses yet (Karol, 2026-11-23). A test instance is requested when V1 ships.

## What this template had and why it is gone

`twenty app init` (2.60.0) also wrote GitHub Actions workflows (Actions are off for the
org; the repo's gate is `../../../verify.sh`), an example front component, page layout,
navigation item and logic function, and integration tests that need a local dev server with
a seeded API key. None of them is part of the supplier hub.
