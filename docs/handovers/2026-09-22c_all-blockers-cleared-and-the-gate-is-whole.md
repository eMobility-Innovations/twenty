# 2026-09-22 — all seven preflight blockers cleared, and the boot gate is whole

## Status

**IN-PROGRESS, and the hard part is done.** All seven preflight blockers are fixed. Five are merged
to `emobility-unity`; two PRs are open. A source build of the fixed trunk **passed the boot smoke
test**, which means the gate that did not exist when the CRM went down for 16h41m now both fails on
the image that caused it and passes on the fixed one.

**Nothing is deployed.** CT175 was never written to — only read. The feature flag
`IS_ESC_ONBOARDING_WIZARD_ENABLED` stays off for every workspace.

| PR | What | State |
|---|---|---|
| [#23](https://github.com/eMobility-Innovations/twenty/pull/23) | blockers 1–4, the migration path | **merged** |
| [#24](https://github.com/eMobility-Innovations/twenty/pull/24) | blocker 5, all four enterprise methods + derived parity check | **merged** |
| [#25](https://github.com/eMobility-Innovations/twenty/pull/25) | blockers 6–7, boot smoke test + behavioural enterprise check | **merged** |
| [#26](https://github.com/eMobility-Innovations/twenty/pull/26) | docs correction — CT140 *does* have a checkout | **open** |
| [#27](https://github.com/eMobility-Innovations/twenty/pull/27) | Node digest pin, guard extraction, frontend check, 71 tests | **open** |

Trunk: `6bf101af`. Redmine [#19873](https://redmine.fiszu.com/issues/19873) journals 36171, 36176;
subtasks #19898 (36173) and #19903 (36174); and 14 new children **#20200–#20213**, all Resolved,
carrying 10.0h.

## The result that matters

`twenty-esc-src:v2.0.0-esc2`, built on CT140 from trunk `6bf101af`:

```
==> Checking the built image carries every ESC feature
  PASS enterprise reports valid on all four methods (executed, not grepped)
  PASS SSRF allowlist present
  PASS onboarding wizard module compiled in

==> Booting twenty-esc-src:v2.0.0-esc2 before calling it good
   ok — no production CRM container on this host
   ok — datastores up
   ok — 22 variables, database pinned to esc-smoke-pg
   ok — /healthz 200 — the Nest module graph resolved
   ok — table present after database:init:prod
   ok — reproduced — this is what the deploy path finds on CT175
   ok — table recreated by command:prod upgrade, recorded completed

SMOKE PASSED — it boots, it serves, and the deploy path creates its schema.
```

Two claims that were explicitly open are now closed:

1. **The boot gate is whole.** It was proven to FAIL on `twenty-esc-src:v2.0.0-esc1` with the real
   error — `Nest can't resolve dependencies … PermissionsService … in the EscOnboardingModule`,
   exit 1 — and now proven to PASS on the fixed image. A gate seen only to fail is half a gate.
2. **`command:prod upgrade` inside the real image reaches the instance command.** PR #23 said this
   was unproven. Step 5 of the smoke test reproduces CT175's exact state — `core` schema present,
   `escOnboarding` dropped, the command's `upgradeMigration` row deleted — and step 6 watches the
   upgrade put the table back and record itself `completed`. No production dump was needed.

## The image that exists is NOT the one to deploy

`twenty-esc-src:v2.0.0-esc2` runs **Node v24.21.0**, measured:
`docker run --rm --entrypoint node twenty-esc-src:v2.0.0-esc2 --version`. It was built before the
digest pin merged, so it carries the moving tag's runtime, not production's v24.15.0.

**Rebuild after #27 merges**, then re-run the smoke test. Deploying this image would mean shipping a
six-patch Node bump alongside a whole new build route, which is the thing the pin exists to avoid.

## What was done

### Blockers 1–4 — the migration never ran on CT175 (PR #23)

The table shipped as a legacy TypeORM migration only. The image entrypoint runs
`yarn database:init:prod` — the single code path in the server that executes TypeORM migrations —
**only when the `core` schema is absent.** On CT175 it is not, so every boot runs
`yarn command:prod upgrade`, whose sequence is built purely from `@RegisteredInstanceCommand` /
`@RegisteredWorkspaceCommand` bundles and never reaches TypeORM. The wizard would have shipped
**dead on arrival with no boot-time symptom.**

Now also a fast instance command. **Registered at `2.0.0`, and that is load-bearing:** the sequence
is `TWENTY_PREVIOUS_VERSIONS + TWENTY_CURRENT_VERSION`, and `'2.1.0'` lives only in
`TWENTY_NEXT_VERSIONS` — a command in the `2-1/` folder, which the preflight's own fix text
suggested, registers, logs as "pre-release", and never runs.

### Blocker 5 — the enterprise banner (PR #24)

All four methods the compiled patch overrides are now overridden in the source overlay, with the
licence values in constants equal to the compiled patch's. `verify-esc-features.sh` **derives** the
method list from `patch-enterprise.cjs`, so a fifth method there fails the verifier until the
overlay matches.

Measured on the real images rather than inferred from a diff:

```
production  twenty-esc-sso:v2.0.0-ssrf1  (CT175, --rm --network none --memory 512m)
  isValid=true hasValidEnterpriseValidityToken=true licenceIsValid=true subscriptionActive=true
  licensee "ESC Self-Hosted", subscriptionId "self-hosted-esc", expires 2036-09-19

pre-fix     twenty-esc-src:v2.0.0-esc1   (CT140)
  isValid=true hasValidEnterpriseValidityToken=false licenceIsValid=false subscriptionActive=false
```

The production line also confirms the overlay's constants match what production actually returns.

### Blockers 6–7 — the gates that did not exist (PR #25)

Two checks were wrong in **opposite** directions, and no grep can serve both routes: option B
regex-injects `return true;` onto a signature line, option A's `nest build` pretty-prints.

| Where | Was | Now |
|---|---|---|
| `scripts/verify-esc-image.sh:28` | grepped `isValid() { return true;` — **failed on a correct source image** | runs the probe in the running container |
| `esc/deploy/build-source-image.sh` | grepped for `return true`, which upstream ships twice — **could not fail** | runs the probe against the built image |

### PR #27 — the pin, the guard, the frontend check, and 71 tests

- **Node pinned by digest** to `node:24.15.0-alpine@sha256:d1b3b4da…`, the multi-arch index digest,
  verified by running the image and reading `node --version` back. Pinned to production's runtime,
  not the newer one — operator decision, so the cutover changes one thing.
- **The dirty-tree guard** refused on any dirty path, so `build-source-image.sh` could not run twice
  in one checkout: `esc-apply.sh` overlays files in and the second run saw its own writes. It now
  derives the expected set from `esc/overlay/`, and is extracted to `esc/deploy/lib/` so it can be
  tested without a 40-minute build.
- **`compare-dist-front.sh`** — the critic's frontend gap. A **collapse** check, not equality:
  asset filenames carry content hashes, so equality would fire on every correct build.
- **71 tests across six suites**, and they RUN on the shared gate runner. `verify.sh`'s wizard suite
  needs `node_modules` and skips itself there, so until now the runner's verdict covered no code at
  all. A fake `docker` on `PATH`, queued answers where a script asks the same question twice,
  per-image fixture trees, and every test asserts the exit code.

## Decisions & rationale — do not re-open

1. **The instance command, not a deploy step alone** — `upgrade` runs it every boot; a written step
   is a human remembering. Both shipped; the command is the mechanism, the step is the assertion.
2. **Registered at `2.0.0`, not `2.1.0`** — `2.1.0` would never run.
3. **Both copies of the DDL kept**, both idempotent: a fresh install runs both in one boot.
4. **Parity is behavioural, never a grep** — the two routes produce different compiled text for
   identical semantics.
5. **The frontend check is a collapse check** — see above.
6. **Node pinned to 24.15.0, production's runtime**, not the current `24-alpine` digest.
7. **Separate PRs per blocker, never stacked** — disjoint files, so no merge closes the one above it.
8. **Children on category Others (99)**, the category #19873 itself sits on; Website & IT has no
   Twenty/CRM category.

## Next steps, in order

1. **Merge #26 and #27.**
2. **Rebuild** `twenty-esc-src:v2.0.0-esc3` on CT140 from the merged trunk, so the image carries the
   pinned Node 24.15.0. The build runs the smoke test itself; do not pass `SKIP_BOOT_SMOKE=1`.
3. **`verify-esc-enterprise-behaviour.sh --compare`** the new image against
   `twenty-esc-sso:v2.0.0-ssrf1`. **This is blocked today:** the production image exists only in
   CT175's local store and is not on CT140. Either move it (`docker save | docker load`) or rebuild
   it there from `esc/deploy/Dockerfile.option-b`, which pulls the public upstream release. The
   filed "the CRM image has no home" finding is what really fixes this.
4. **`compare-dist-front.sh`** the new image against production's. Production's frontend is
   22.9 MB / 921 files / `index.html` 2494 B.
5. **A human opens the new image on a spare port** — no invalid-key banner, SSO login, Settings →
   Security, and the licence/enterprise settings screen. `enterprise.resolver.ts` is a second
   frontend-facing surface the plan never opened. A session cannot do this: the CRM is behind SSO
   with no credential entry.
6. **Then propose the cutover.** Operator's decision, not a step. Rollback image saved OFF the box
   first. `docker compose up -d`, never `down` — `twenty-ingest-app-1` shares `twenty-esc_default`.

## How to resume

```bash
cd ~/Projects/twenty-onboarding-wizard          # worktree, node_modules installed
git fetch origin && git log --oneline -1 origin/emobility-unity
gh pr list -R eMobility-Innovations/twenty

# the build host — note the sudo sh -c wrapper, it matters (see gotchas)
pangolin ssh esc-blades-ct140.ssh -- 'sudo sh -c "tail -40 /root/build-esc2.log"'
pangolin ssh esc-blades-ct140.ssh -- 'sudo sh -c "cd /root/twenty-esc-src && git log --oneline -1"'

./esc/deploy/tests/run-tests.sh                 # 71 tests, no dependencies
```

Redmine, from CT141 — **the REST API cannot be written to**, `PUT` 302s to `/oic/login` even from
inside the container:

```bash
base64 -i note.md | pangolin ssh 001esc-ct141.ssh -- 'base64 -d | sudo tee /tmp/note.md > /dev/null'
pangolin ssh 001esc-ct141.ssh -- 'sudo -u www-data sh -lc \
  "cd /var/lib/redmine && RAILS_ENV=production bundle exec rails runner /tmp/script.rb"'
```

`rails runner` cannot read `/dev/stdin`; the script must be a file on the box. Always read the
journal back — `save` returning true is not evidence the note says what you meant.

## Gotchas / anti-patterns

- **Anything touching `/root` on a CT goes inside `sudo sh -c '…'`, glob included.** The login user
  cannot read `/root`, so a bare `cd /root/x && …` fails and an `||` branch prints a conclusion, and
  a bare glob never expands. This produced two wrong statements in one session: a `chmod` that
  "could not find" files that were there, and a claim that CT140 had no checkout.
- **`pgrep -f <script>` matches the command line asking the question.** A watcher polling
  `pgrep -f build-source-image.sh` over SSH matched its own `sudo sh -c`, so it could never see the
  build end. Check for a specific pid, or exclude self.
- **An SSH timeout is not "the process is gone".** A watcher that treats a failed probe as a negative
  reported the build finished twice while it was still at step 49 of 68. Conclude only when the probe
  *succeeds*.
- **Free memory says nothing about whether a build is running.** A docker build copying
  `node_modules` between stages holds almost nothing; the process list is the evidence.
- **The `2-1/` folder is a trap** — a command registered at `2.1.0` never runs until `2.1.0` leaves
  `TWENTY_NEXT_VERSIONS`.
- **`awk` body isolation, twice over:** a substring match misses `async getLicenseInfo(`, and an end
  anchor of `/^  }/` stops inside a multi-line signature like
  `getSubscriptionStatus(): Promise<{ … } | null> {`.
- **A `#` comment after a line continuation inside `$( … )` eats the command.** The parity loop
  printed nothing at all, which reads exactly like a passing check.
- **Do not match the enterprise probe's JSON** — `isValid` appears at the top level *and* inside
  `reportsEnterpriseValid`. Match the single `ESC_ENTERPRISE_VERDICT:` line.
- **Greedy `sed` capture groups.** `s/^.*\([0-9]*\) test(s)/` captured the last digit only, so a
  71-test run reported 21. Anchoring at line start fails too: the summary line begins with a bold
  escape whose text contains a digit.
- **Verify a mutation actually applied before believing a check "missed" it.** One `sed` mutation
  silently did not apply and the check duly "passed".
- **CT140 is `gitlab.fiszu.com`**, the org's CI. The build's 9 GB cap is a guard on the host, not a
  tuning knob. A dedicated throwaway build CT is the right shape and does not exist.
- **`gh pr create` on a fork defaults to the parent repo.** Pass `-R eMobility-Innovations/twenty`.

## Not started — each needs its own ticket

1. The freshness watchdog cannot alert on a probe failure, and its firing table identifies only the
   *job*, never the CRM — attribution is the real defect. It watched the 16h41m outage and paged
   nobody.
2. The production CRM image is stored only in one host's local image store. **This blocks next step
   3 above.**
3. Image deletion on CT175 is unattributable.
4. `~/.claude/settings.local.json` on the workstation carries a plaintext root password in ~8
   allow-rules for `192.168.103.124` and `.106`. It is the old shared CT password, dead since
   2026-07-12, and should not exist anywhere. Reported to the operator, not touched.
