# Source-build preflight — the completeness critic

> The last stage: an agent asked what nobody opened, which claims were asserted rather than
> demonstrated, whether anything was wrongly dropped, and what would still take the CRM down
> if the plan were followed exactly. It found five gaps and corrected two refutations.

I've verified enough to answer. Findings below — every claim names the command I ran or the file and line.

## Gaps, most load-bearing first

**1. §2.6 and §1.5's grep anchors are written against option B's compiled shape and return 0 on the source image being deployed.**
The one-line form `isValid() { return true;` exists in production *only* because `patch-enterprise.cjs:13` regex-injects `return true;` onto the signature line. `nest build` (`packages/twenty-server/project.json:15`) pretty-prints: in the same production file, the unpatched `reportSeats()` emits `            return true;` on its own line (`sudo docker exec twenty-esc-server-1 sed -n "250,270p" …/enterprise-plan.service.js`). The overlay source has an 11-line comment between `isValid(): boolean {` (line 149) and its `return true;`. So a source build emits `isValid() {\n        return true;\n    }` and:
- `scripts/verify-esc-image.sh:28` **fails on a correct source image** — and the plan's §2.6 says to extend that script.
- §2.6's `grep -cE "isValid\(\) \{ return true;|…"` green of `4` is **unachievable**; it returns 0.
- §1.5's prescribed fix ("anchor to `isValid() { return true;` … fail if fewer than four match") would make `build-source-image.sh` refuse every correct build.

Closing command, on CT140 after the build:
```bash
docker create twenty-esc-src:v2.0.0-esc2   # then docker cp the file out
grep -nE "isValid\(\)|hasValidEnterpriseValidityToken\(\)|getLicenseInfo\(\)|getSubscriptionStatus\(\)" enterprise-plan.service.js
```
Deeper point: §4.7 wants one four-way text check to keep options A and B equivalent. **The two routes produce different compiled text for identical semantics, so no grep can verify both.** The equivalence check has to be behavioural — query `hasValidEnterpriseKey`, `hasValidSignedEnterpriseKey`, `hasValidEnterpriseValidityToken`, `getSubscriptionStatus` over GraphQL against each image — not a grep.

**2. Nobody opened the frontend, and nothing in the plan can see it.**
Production `dist/front` is 22.9 MB / 921 files / 726 assets / `index.html` 2494 B (`docker exec twenty-esc-server-1 du -sh … ; find … | wc -l`). The source image builds its own frontend (`Dockerfile:65-69`, `COPY --from=twenty-front-build … dist/front` at `:114`). `build-source-image.sh:147-157` extracts three files, **all server-side**; `verify-esc-image.sh` checks two, both server-side; `/healthz` (`health.controller.ts`) never renders a component. Every layer digest differs between the two images (`docker image inspect --format '{{range .RootFS.Layers}}…'`) — the matching 482 kB in `docker history` is layer accounting, not content.
Failure mode this leaves open: server boots, `/healthz` green, §2.5 returns `1`, compose healthy — **and the CRM serves a broken bundle.** §2.7 is the only cover and it runs *after* the swap. Close it before step 6:
```bash
# CT140, against the new image
docker create twenty-esc-src:v2.0.0-esc2   # cp /app/packages/twenty-server/dist/front out
find front -type f | wc -l ; du -sh front ; wc -c front/index.html
# must be ~921 / ~22.9M / ~2494 against the production baseline above
```

**3. The §2.3 smoke env is not production's env, so it cannot catch the failure class that caused the outage.**
`/root/twenty-esc/docker-compose.yml:25-31` sets `EMAIL_DRIVER: smtp` plus four `EMAIL_SMTP_*`/`EMAIL_FROM_*`, and `:21-24` four `API_RATE_LIMITING_*`, and `:19` `ESC_SSRF_ALLOWED_HOSTS`. §2.3's smoke A/B set **none** of them — so the smoke boots the default (logger) mail driver, a different provider graph from production, and never exercises the SSRF overlay at all. A DI fault on the SMTP path boots green in smoke and kills CT175. Close it by sourcing the real env:
```bash
# extract server env from the live compose and pass it verbatim to the smoke run
sudo docker inspect twenty-esc-server-1 --format '{{range .Config.Env}}{{println .}}{{end}}' > /root/esc-prod.env
docker run -d … --env-file /root/esc-prod.env twenty-esc-src:v2.0.0-esc2
```
Same omission applies to §3 step 5's one-shot migrate container.

**4. `enterprise.resolver.ts` — a second frontend-facing surface on the same service — was never opened.**
§1.2 traces only `workspace.resolver.ts:314,319,324`. `packages/twenty-server/src/engine/core-modules/enterprise/enterprise.resolver.ts` exposes two `@Query(() => String)` (`:44`, `:58`), `@Query(() => EnterpriseSubscriptionStatusDTO, { nullable: true })` (`:75`), and two mutations (`:86`, `:97`) off `EnterprisePlanService`. §2.7's human check (no banner / SSO / Settings → Security) does not cover whatever renders from those. Close by naming the licence/enterprise settings screen explicitly in §2.7.

**5. `scripts/verify-esc-features.sh` is on the build path and §1.2 leaves it verifying one method of four.**
Its own comment at `:48-53` records that `esc-apply.sh` runs it and a false FAIL there **aborted the overlay apply**. It checks only `isValid()` (`:37-61`), anchored on `/isValid\(\): boolean \{/`. Adding three overridden methods per §1.2 without extending this script means the source-side verifier silently stops covering three quarters of the parity it exists to protect. Same for `scripts/esc-modified-files.txt` (2 paths) and `scripts/PATCH_MANIFEST.md` — neither is mentioned anywhere in the plan.

## Refutations I re-checked myself

**6. The watchdog refutation was directionally right, its evidence is not reproducible, and neither the plan nor the refutation got §1.7 right.**
I queried the table it rests on:
```
sudo docker exec twenty-ingest-postgres-1 psql -U twenty_ingest -d twenty_ingest -tAc \
  "SELECT * FROM scheduled_run_watchdog_firing ORDER BY 2"
```
Nine rows. Schema is `job|text`, `created_at`. **Three of the ten rows the refuter cited are gone** — `lead-opportunity-sync 17:05:00.814`, `ingest-order-status-refresh 17:05:00.980` (the two they called "the FIRST hourly tick after the CRM went 502") and `idosell-order-sync 07:05`. The earliest surviving outage-window row is `ingest-address-sync 2026-09-22 02:05` — **8h39m after** the 17:26 BST cutover. The table is cleared on recovery, so it erases its own evidence and anyone re-checking gets a different answer.
The decisive part neither side stated: **the only identifying column is `job`.** Every row names an ingest job; none names the CRM. So §0.2's "nothing alerted" is too strong, *and* §1.7's remedy is aimed at the wrong defect — the real one is **attribution**, not absence. Fix §1.7's premise before building to it.

**7. The Node-pin refutation over-reached; §1.8 is viable as written.**
It claimed `verify.sh:255` blocks the fix. The allowlist there includes `esc/.*`, so `esc/overlay/packages/twenty-docker/twenty/Dockerfile` passes the gate. And `esc/esc-apply.sh` selects files with a generic `find "${OVERLAY_DIR}" -type f -print0` loop (not from `scripts/esc-modified-files.txt`), so a third overlay entry auto-applies. The refuter argued against pinning the *upstream* path, which §1.8 explicitly says not to do. Consequence the plan should still state: `build-source-image.sh:79` then trips on **three** dirtied paths, not two.

## Checked and sound — so nobody re-spends on them

- **SSRF overlay parity (never checked by the plan).** `diff -u <(git show v2.0.0:…is-private-ip.util.ts) esc/overlay/…is-private-ip.util.ts` → one hunk; semantics identical to `patch-ssrf-allowlist.cjs` (same split/trim/filter/`includes(addr)`, read at call time). §1.2's divergence class does **not** extend to SSRF.
- **§1.2's override is typeable.** `enterprise-license-info.dto.ts:6-18` is exactly `{isValid, licensee, expiresAt, subscriptionId}` and `getSubscriptionStatus(): Promise<{…} | null>` (`v2.0.0:…enterprise-plan.service.ts:307-314`) matches the patch payload field-for-field. `verify.sh`'s typecheck will accept it.
- **Migration and entity registration.** `core.datasource.ts:66` globs `dist/database/typeorm/core/migrations/common/*` and `:52` globs `dist/engine/core-modules/**/!(billing-*).entity.{ts,js}` under `IS_BILLING_ENABLED=false` (which compose sets at `:20`). Both esc files land.
- **`REACT_APP_SERVER_BASE_URL` is empty in both images** (`docker image inspect` Env) — the build script's line-24 claim, which nobody had verified, is true.
- **Worker command matches.** Compose `:45` is `["yarn","worker:prod"]`, so §2.3's smoke B tests the right entrypoint.

## What still takes the CRM down if every step is followed exactly

The frontend. Step 3 builds, §2.2/§2.3/§2.4 pass, §2.6 returns 0 so the operator either aborts a good cutover or loosens the check, step 5's migration lands, step 6 swaps, `/healthz` is green inside 10 minutes, §2.5 returns `1`, compose reports healthy — and the app is broken in the browser, discovered only at §2.7, after the swap, with `restart: always` and a detector (§1.7) built on a premise I've just shown is false. Put gap 2's `dist/front` comparison before step 6 and move §2.7's human check to a pre-cutover run of the new image on a spare port.