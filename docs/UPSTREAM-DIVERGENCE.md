# Upstream divergence

This repository is a fork of `twentyhq/twenty` and tracks its `main` branch through the
`upstream` remote. The eMobility-Innovations default branch is `emobility-unity`.

GitHub Actions is permanently unavailable for the eMobility-Innovations organization by operator
decision. The following 35 upstream workflow paths are therefore removed from this fork:

- `.github/workflows/cd-deploy-main.yaml`
- `.github/workflows/cd-deploy-tag.yaml`
- `.github/workflows/changed-files.yaml`
- `.github/workflows/ci-ai-catalog-sync.yaml`
- `.github/workflows/ci-breaking-changes.yaml`
- `.github/workflows/ci-create-app-e2e-hello-world.yaml`
- `.github/workflows/ci-create-app-e2e-minimal.yaml`
- `.github/workflows/ci-create-app-e2e-postcard.yaml`
- `.github/workflows/ci-create-app.yaml`
- `.github/workflows/ci-docs.yaml`
- `.github/workflows/ci-emails.yaml`
- `.github/workflows/ci-example-app-hello-world.yaml`
- `.github/workflows/ci-example-app-postcard.yaml`
- `.github/workflows/ci-front-component-renderer.yaml`
- `.github/workflows/ci-front.yaml`
- `.github/workflows/ci-merge-queue.yaml`
- `.github/workflows/ci-release-create.yaml`
- `.github/workflows/ci-release-merge.yaml`
- `.github/workflows/ci-sdk.yaml`
- `.github/workflows/ci-server.yaml`
- `.github/workflows/ci-shared.yaml`
- `.github/workflows/ci-test-docker-compose.yaml`
- `.github/workflows/ci-ui.yaml`
- `.github/workflows/ci-utils.yaml`
- `.github/workflows/ci-website.yaml`
- `.github/workflows/ci-zapier.yaml`
- `.github/workflows/claude.yml`
- `.github/workflows/docs-i18n-pull.yaml`
- `.github/workflows/docs-i18n-push.yaml`
- `.github/workflows/i18n-pull.yaml`
- `.github/workflows/i18n-push.yaml`
- `.github/workflows/post-ci-comments.yaml`
- `.github/workflows/preview-env-dispatch.yaml`
- `.github/workflows/preview-env-keepalive.yaml`
- `.github/workflows/visual-regression-dispatch.yaml`

The gate and synchronization policy are intentionally maintained as fork-only files. On later
upstream syncs, `sync-upstream.sh` removes workflows again. The running record of those removals is
available with:

```sh
git log --grep="dropping upstream .github/workflows"
```

## Fork-only features

Features this fork adds that upstream does not have. Each keeps its code in one directory and
records here every upstream file it edits, so an upstream merge has a short conflict list.

### The `esc/` overlay

The SSO enterprise bypass and the SSRF allowlist. Unlike the wizard, these MODIFY upstream files,
so they are kept as patched copies at their upstream paths under `esc/overlay/`, applied to a
checkout by `esc/esc-apply.sh` before an image is built. `scripts/PATCH_MANIFEST.md` documents
each patch and how to re-point it when upstream moves the code.

Landed on the trunk 2026-09-21. Until then it lived only on unmerged branches while the patched
image ran in production — the image CT175 runs was not reproducible from anything on the trunk.

`verify.sh`'s `esc-overlay` gate refuses a push the moment an overlay file loses the upstream file
it patches, which is the one way this design fails silently: `esc-apply.sh` cannot tell a rename
from a new file, so it would create the path and the patch would simply not be in the build.

### ESC self-onboarding wizard

Redmine [#19873](https://redmine.fiszu.com/issues/19873); documented in
[`esc-onboarding-wizard.md`](./esc-onboarding-wizard.md). Off by default behind the
`IS_ESC_ONBOARDING_WIZARD_ENABLED` workspace feature flag.

Upstream files edited:

- `packages/twenty-shared/src/types/FeatureFlagKey.ts` — one enum member
- `packages/twenty-server/src/engine/core-modules/core-engine.module.ts` — one import, one list entry
- `packages/twenty-server/src/engine/twenty-orm/entity-manager/workspace-entity-manager.spec.ts` — one line; its `featureFlagsMap` literal is typed `Record<FeatureFlagKey, boolean>`, so adding any flag forces it
- `packages/twenty-server/src/database/commands/upgrade-version-command/instance-commands.constant.ts` — one import, one array entry, registering the wizard's fast instance command. Upstream's own `generate:instance-command` edits this file, so an upstream sync will conflict here whenever upstream adds a command; keep BOTH entries.

Fork-only files added outside the module directory:

- `packages/twenty-server/src/database/commands/upgrade-version-command/2-0/2-0-instance-command-fast-1790000100000-add-esc-onboarding.ts`
- `packages/twenty-server/src/database/typeorm/core/migrations/common/1790000100000-add-esc-onboarding.ts`

The table is shipped TWICE on purpose. The image entrypoint runs `yarn database:init:prod` — the
only code path in the server that executes TypeORM migrations — only when the `core` schema is
absent, so a legacy migration alone is applied on a fresh install and never on an existing
instance. The fast instance command is what `yarn command:prod upgrade` executes on every boot.
Both copies emit the same DDL, guarded by
`esc-onboarding/__tests__/esc-onboarding-migration-path.spec.ts`, which also fails if a future
fork-owned migration is added with no instance command beside it.
