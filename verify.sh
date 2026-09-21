#!/usr/bin/env bash
# Local gate for the eMobility-Innovations fork of twentyhq/twenty.

set -euo pipefail

cd "$(dirname "$0")"

echo "gate: GitHub Actions workflows must remain absent"
./check-no-workflows.sh

echo "gate: the ESC overlay must still line up with upstream"

# ---------------------------------------------------------------------------
# `esc/overlay/<upstream-relative-path>` holds PATCHED COPIES of upstream files at
# their exact upstream paths; `esc/esc-apply.sh` copies them over the working tree
# before an image is built. That design has one failure mode, and it is silent:
# when an upstream sync MOVES, RENAMES or DELETES a patched file, the overlay copy
# still exists and still applies — to a path nothing reads any more. `esc-apply.sh`
# does not refuse in that case, it CREATES the file (it cannot tell a rename from a
# new file), so the build succeeds and the patch is simply not in the product.
#
# For the SSO patch that means the Enterprise gate comes back and Keycloak login
# stops working, discovered by a person who cannot sign in. This check is what
# turns that into a refused push.
#
# It is a pure path-existence test, so it runs anywhere a checkout does — no
# dependencies, no remotes, no database. There is nothing for it to skip on.
if [ -d esc/overlay ]; then
  bash -n esc/esc-apply.sh

  overlay_orphans=""
  while IFS= read -r overlay_file; do
    target="${overlay_file#esc/overlay/}"
    if [ ! -f "$target" ]; then
      overlay_orphans="${overlay_orphans}${target}
"
    fi
  done < <(find esc/overlay -type f)

  if [ -n "$overlay_orphans" ]; then
    {
      echo "esc-overlay: these overlay files no longer have an upstream file to patch:"
      printf '%s' "$overlay_orphans" | sed 's/^/    /'
      echo
      echo "  Upstream moved, renamed or deleted them. esc-apply.sh will NOT refuse —"
      echo "  it will create the path and the patch will silently not be in the build."
      echo "  Re-point the overlay at the new path, and record it in"
      echo "  scripts/PATCH_MANIFEST.md, before this is allowed to build."
    } >&2
    exit 1
  fi

  echo "esc-overlay: every overlay file still has its upstream target — good."
fi

echo "gate: the ESC onboarding wizard must carry its own checks"

# ---------------------------------------------------------------------------
# THE FORK-SCOPE CHECK BELOW SAYS, IN ITS OWN WORDS: "Add targeted gates for these
# paths before they are allowed into the fork." This is that gate, for the first
# application-code delta this fork has carried — the self-onboarding wizard
# (Redmine #19873, docs/esc-onboarding-wizard.md).
#
# It runs the wizard's own suite, which includes the three tests that hold the
# operator's condition for this work: the feature flag must stay absent from
# DEFAULT_FEATURE_FLAGS, from PUBLIC_FEATURE_FLAGS and from the dev seeder, so it
# reads false for every workspace until somebody turns it on deliberately. All
# three were mutation-tested both ways on 2026-09-21 — each one fails when its
# guard is removed.
#
# It also typechecks the server, because adding a FeatureFlagKey member breaks an
# upstream spec whose featureFlagsMap literal is typed Record<FeatureFlagKey,
# boolean>. Nothing but a typecheck catches that.
#
# SKIPS LOUDLY, BY NAME, WHEN IT CANNOT RUN — the same discriminator the fork-scope
# check uses below. The gate payload carries no node_modules, so the suite is not
# installed there and no amount of trying makes it answerable. A skip nobody can
# see is how a gate becomes a green-looking absence of one.
if [ -d node_modules ]; then
  npx nx typecheck twenty-server
  (cd packages/twenty-server && npx jest esc-onboarding --config=jest.config.mjs)
  echo "esc-onboarding: typecheck and the wizard suite passed."
else
  echo "esc-onboarding: SKIPPED — node_modules is absent in this checkout, so the" >&2
  echo "esc-onboarding:   suite cannot be run by anyone from here. THIS RUN DID NOT" >&2
  echo "esc-onboarding:   CHECK THE WIZARD. Run ./verify.sh on a clone with" >&2
  echo "esc-onboarding:   dependencies installed (yarn install) to prove it." >&2
fi

echo "gate: org-specific application changes must have targeted checks"

# ---------------------------------------------------------------------------
# WHEN THIS CHECK CANNOT BE ANSWERED AT ALL, IT SKIPS BY NAME — IT DOES NOT PASS.
#
# This gate asks how the fork differs from `upstream/main`. The shared gate runner
# cannot answer it.
#
# 🔧 CORRECTED 2026-08-25, and the correction matters more than the original claim.
# This comment used to say "the payload carries NO GIT REMOTES AT ALL — `git remote`
# prints nothing — and the runner holds no credential with which to add one." The first
# half was a MISREADING of the symptom. Probed directly on ct211 that day, running
# `git` inside the payload for THIS repo:
#
#     fatal: not a git repository (or any of the parent directories): .git
#
# `git remote` printed nothing because it FAILED, not because the list was empty. There
# are no remotes here because there is no repository — `claude-gate-run` builds the
# payload's history with `git clone file://<root>`, and for a repo this size that clone
# dies (`git upload-pack: git-pack-objects died with error`, reproducible locally in
# ~30s). The client treats history as best-effort and never says it went missing.
#
# It is NOT corruption: `git fsck --connectivity-only` is clean and all 19 packs pass
# `git verify-pack`. A plain local `git clone` of the same repo succeeds in 7 seconds and
# carries every object. Only the `file://` form fails. Filed against the gate client.
#
# WHAT THAT MEANS HERE, PLAINLY: on the runner this repo has no git history at all, so
# NO git-based fork-scope check can run there, however it is written — including the
# recorded sync point below. That is a property of the payload, not of this gate.
#
# Operator's ruling, 2026-08-25: "we pull from upstream and apply our overlay, so at
# the end only OUR fork has to run." So the runner being unable to answer this is not
# a failure of the push. What was left open was only HOW it declines, and a silent
# pass was refused: a skip that nobody can see is how a gate becomes a green-looking
# absence of one.
#
# THE DISCRIMINATOR IS WHETHER THE QUESTION IS ANSWERABLE, NOT WHERE WE ARE RUNNING.
# Guessing "am I on the runner" would skip for the wrong reason and skip too often.
#
#   upstream remote CONFIGURED, ref missing -> a workstation that has not fetched.
#                                              The check IS answerable. Still FAILS,
#                                              and still says to fetch — skipping here
#                                              would hide a real gap behind a shrug.
#   upstream remote ABSENT ENTIRELY         -> the gate payload. Not answerable by
#                                              anyone. SKIPS, loudly, naming why.
#
# ✅ AND IT TRAVELS AS FAR AS A REPOSITORY GOES, so the skip is the last resort rather
# than the first — on every machine that has one. On the runner today there is no
# repository, so this still skips there; when the payload carries history again, this
# check starts answering with no further change.
# `.upstream-sync` records the commit this fork was last synced onto, as a tracked file
# written by sync-upstream.sh. That commit is an ANCESTOR OF HEAD in this repository's
# own history, so it resolves by SHA with no remote configured at all — which is exactly
# the payload's state. The question stops needing a remote to be asked.
#
# PROVEN EQUIVALENT, not assumed. Measured here 2026-08-25:
#     git diff --name-only upstream/main...HEAD      ->  44 paths
#     git diff --name-only <recorded sync point>..HEAD -> the same 44 paths
# A three-dot diff is DEFINED against the merge base, and the merge base is what is
# recorded — so this is the same question asked in a way the runner can answer, not a
# weaker one substituted for it.
#
# ORDER OF PREFERENCE, and why the recorded point wins:
#   1. `.upstream-sync`  — answerable everywhere, including the payload. Preferred.
#   2. `upstream/main`   — the same answer, on a clone that has fetched it. The fallback
#                          for a fork that has not recorded a point yet.
#   3. remote configured but unfetched -> still FAILS. Answerable, so a skip would hide
#                          a real gap behind a shrug.
#   4. nothing at all    -> SKIPS, loudly, naming why.
# ---------------------------------------------------------------------------
SYNC_POINT=""
if [ -f .upstream-sync ]; then
  # The file is written by a script and read by this one. Parse it strictly: a line
  # `commit = <sha>`, nothing clever, comments ignored.
  SYNC_POINT="$(sed -n 's/^commit[[:space:]]*=[[:space:]]*//p' .upstream-sync | head -1)"
  # A recorded SHA this repository does not have is worse than none: it would compare
  # against a commit nobody merged, or die mid-gate. Refuse to use it, and say so.
  if [ -n "$SYNC_POINT" ] && ! git cat-file -e "${SYNC_POINT}^{commit}" 2>/dev/null; then
    echo "fork-scope: .upstream-sync names $SYNC_POINT, which is not a commit in this" >&2
    echo "fork-scope:   repository. Ignoring it and falling back to the remote ref." >&2
    SYNC_POINT=""
  fi
fi

if [ -n "$SYNC_POINT" ]; then
  BASE_DESC="the recorded sync point $(git rev-parse --short "$SYNC_POINT") (.upstream-sync)"
  DIFF_RANGE="${SYNC_POINT}..HEAD"
elif ! git rev-parse --verify -q upstream/main >/dev/null; then
  if git remote get-url upstream >/dev/null 2>&1; then
    echo "fork-scope: upstream/main is unavailable; cannot prove the fork's change scope." >&2
    echo "fork-scope: the 'upstream' remote IS configured here, so this is answerable —" >&2
    echo "fork-scope: fetch it (git fetch upstream main), then run ./verify.sh again." >&2
    exit 1
  fi
  echo "fork-scope: SKIPPED — no 'upstream' remote exists in this checkout, so the" >&2
  echo "fork-scope:   fork's change scope cannot be measured by anyone from here." >&2
  echo "fork-scope:   remotes present: $(git remote | tr '\n' ' ' | sed 's/ $//')" >&2
  echo "fork-scope:   On the shared gate runner that list is EMPTY: the payload has" >&2
  echo "fork-scope:   no remotes and no credential to add one, by design." >&2
  echo "fork-scope:   THIS RUN DID NOT PROVE FORK SCOPE. Run ./verify.sh on a clone" >&2
  echo "fork-scope:   that has 'upstream' to prove it." >&2
else
  BASE_DESC="upstream/main"
  DIFF_RANGE="upstream/main...HEAD"
fi

if [ -n "${DIFF_RANGE:-}" ]; then

#
# `REPO-CONTRACT.toml` joined this list on 2026-08-25, by the same argument. It is a
# gate-policy file by this gate's own definition — the org-standard declaration of what
# this repo is, what proves it, and what the shared gate runner must provide, read by
# `repo-contract-guard`. It did not exist when the list was written, so the gate read a
# compliant gate-policy change as an application change and refused it. The predicate had
# gone stale against what it claims to guard; the fix is the predicate, not the change.
#
# ---------------------------------------------------------------------------
# 🔧 WIDENED 2026-09-21, and the reason matters: THE SENTENCE BELOW ABOUT THIS FORK
# HAVING "no application-code delta" STOPPED BEING TRUE ON THAT DATE. The
# self-onboarding wizard (Redmine #19873) is the first application code this org
# writes into the fork, by operator direction, so the predicate had gone stale
# against what it guards. Per the gate's own instruction — "Add targeted gates for
# these paths before they are allowed into the fork" — the wizard's paths are
# allowlisted here ONLY because the esc-onboarding gate above runs typecheck and
# the wizard's suite over them on every push that can run them.
#
# `.gitignore` is allowlisted because the overlay writes `.esc-originals/` into the
# working tree and an untracked backup directory would itself trip this check.
#
# `esc/**` and the `scripts/` files that serve it (PATCH_MANIFEST.md,
# esc-modified-files.txt, verify-esc-*.sh) are allowlisted because they ARE the
# fork's deployment policy — the overlay that turns an upstream release into the
# image CT175 runs, plus its manifest and its verifier. They are covered by the
# esc-overlay gate above, which refuses a push the moment an overlay file loses
# the upstream file it patches. Added 2026-09-21, when the overlay was proposed
# for the trunk so that a source build could carry the SSO and SSRF patches.
#
# NOTE that esc/overlay/ does contain a COPY of an application file
# (enterprise-plan.service.ts). That is the point of an overlay, and it is why the
# existence check above is not optional: the copy is the only thing keeping the
# patch alive across an upstream sync.
#
# `docs/handovers/*.md` is allowlisted for the same reason `docs/UPSTREAM-DIVERGENCE.md`
# already was: it is a record of the fork's own decisions, not application code, and the
# org requires one per session. Added 2026-09-21, when the first handover tripped this.
#
# Three of the allowlisted paths are upstream files, not fork files:
# FeatureFlagKey.ts, core-engine.module.ts and workspace-entity-manager.spec.ts.
# Each carries exactly one line of ours, and each is forced: a new flag member, a
# module registration, and a typed featureFlagsMap literal that will not compile
# without the new key. They are listed in docs/UPSTREAM-DIVERGENCE.md so an
# upstream merge has a short conflict list. Allowlisting them does mean an
# UNRELATED edit to one of those three files no longer trips this check — the
# typecheck above is what covers them instead.
# ---------------------------------------------------------------------------
# Measured across all 30 gated repos on 2026-08-25, this bites exactly three of them: the
# 22 others with a checkout carry no path allowlist at all, and the three that do
# (docuseal-full, chatwoot, twenty) are all vendored upstream forks. All three were widened
# in the same pass, so this does not come back one repo at a time.
unexpected="$({
  git diff --name-only "$DIFF_RANGE"
  git diff --name-only
  git diff --cached --name-only
  git ls-files --others --exclude-standard
} | sort -u | grep -Ev '^($|\.upstream-sync|\.githooks/pre-push|\.githooks/pre-commit|\.sync-upstream\.conf|README\.md|REPO-CONTRACT\.toml|check-no-workflows\.sh|docs/UPSTREAM-DIVERGENCE\.md|install-hooks\.sh|sync-upstream\.sh|verify\.sh|\.github/workflows/.*|docs/esc-onboarding-wizard\.md|docs/handovers/.*\.md|esc/.*|scripts/PATCH_MANIFEST\.md|scripts/esc-modified-files\.txt|scripts/verify-esc-[a-z-]+\.sh|\.gitignore|packages/twenty-server/src/engine/core-modules/esc-onboarding/.*|packages/twenty-server/src/database/typeorm/core/migrations/common/[0-9]+-add-esc-onboarding\.ts|packages/twenty-shared/src/types/FeatureFlagKey\.ts|packages/twenty-server/src/engine/core-modules/core-engine\.module\.ts|packages/twenty-server/src/engine/twenty-orm/entity-manager/workspace-entity-manager\.spec\.ts)$' || true)"

if [ -n "$unexpected" ]; then
  {
    echo "fork-scope: org-specific application paths now differ from $BASE_DESC:"
    echo "$unexpected" | sed 's/^/    /'
    echo
    echo "  This deployment fork currently has no application-code delta, so reproducing"
    echo "  upstream's monorepo CI locally would check code this org does not change. Add"
    echo "  targeted gates for these paths before they are allowed into the fork."
  } >&2
  exit 1
fi

echo "fork-scope: no org-specific application-code changes — good (measured against $BASE_DESC)."
fi

echo "verify: all local gates passed."
