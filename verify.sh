#!/usr/bin/env bash
# Local gate for the eMobility-Innovations fork of twentyhq/twenty.

set -euo pipefail

cd "$(dirname "$0")"

echo "gate: GitHub Actions workflows must remain absent"
./check-no-workflows.sh

echo "gate: org-specific application changes must have targeted checks"

# ---------------------------------------------------------------------------
# WHEN THIS CHECK CANNOT BE ANSWERED AT ALL, IT SKIPS BY NAME — IT DOES NOT PASS.
#
# This gate asks how the fork differs from `upstream/main`. The shared gate runner
# cannot answer it: the payload it receives is a clone carrying ONE remote, and the
# runner holds no credential to fetch another. That is deliberate — it is what keeps
# the runner a compute surface rather than an access surface — so `upstream` is not
# merely unfetched there, it does not exist.
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
# ⚠️ WHAT THIS COSTS, STATED RATHER THAN DISCOVERED LATER: pushes are offloaded, so
# the runner is where this normally runs, so this check now normally SKIPS. It has
# force only when someone runs ./verify.sh on a clone that has `upstream`. Making it
# travel would mean recording the upstream sync point in a tracked file and comparing
# against that instead of a remote ref — a change to how this fork does its syncing,
# not to how one check declines, so it is filed rather than slipped in here.
# ---------------------------------------------------------------------------
if ! git rev-parse --verify -q upstream/main >/dev/null; then
  if git remote get-url upstream >/dev/null 2>&1; then
    echo "fork-scope: upstream/main is unavailable; cannot prove the fork's change scope." >&2
    echo "fork-scope: the 'upstream' remote IS configured here, so this is answerable —" >&2
    echo "fork-scope: fetch it (git fetch upstream main), then run ./verify.sh again." >&2
    exit 1
  fi
  echo "fork-scope: SKIPPED — no 'upstream' remote exists in this checkout, so the" >&2
  echo "fork-scope:   fork's change scope cannot be measured by anyone from here." >&2
  echo "fork-scope:   remotes present: $(git remote | tr '\n' ' ' | sed 's/ $//')" >&2
  echo "fork-scope:   This is the shared gate runner's payload, which carries one" >&2
  echo "fork-scope:   remote and no credential to fetch another, by design." >&2
  echo "fork-scope:   THIS RUN DID NOT PROVE FORK SCOPE. Run ./verify.sh on a clone" >&2
  echo "fork-scope:   that has 'upstream' to prove it." >&2
else

unexpected="$({
  git diff --name-only upstream/main...HEAD
  git diff --name-only
  git diff --cached --name-only
  git ls-files --others --exclude-standard
} | sort -u | grep -Ev '^($|\.githooks/pre-push|\.githooks/pre-commit|\.sync-upstream\.conf|README\.md|check-no-workflows\.sh|docs/UPSTREAM-DIVERGENCE\.md|install-hooks\.sh|sync-upstream\.sh|verify\.sh|\.github/workflows/.*)$' || true)"

if [ -n "$unexpected" ]; then
  {
    echo "fork-scope: org-specific application paths now differ from upstream/main:"
    echo "$unexpected" | sed 's/^/    /'
    echo
    echo "  This deployment fork currently has no application-code delta, so reproducing"
    echo "  upstream's monorepo CI locally would check code this org does not change. Add"
    echo "  targeted gates for these paths before they are allowed into the fork."
  } >&2
  exit 1
fi

echo "fork-scope: no org-specific application-code changes — good."
fi

echo "verify: all local gates passed."
