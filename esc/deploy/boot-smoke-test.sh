#!/usr/bin/env bash
#
# Boots an image and asserts it SERVES. Then asserts the ESC onboarding table is
# created by the path production actually takes.
#
# WHY: on 2026-09-21 a cutover took esc.crm.fiszu.com down for 16h41m because
# EscOnboardingModule did not import PermissionsModule. `nx typecheck`, 23 unit
# tests, oxlint, prettier and ./verify.sh were all green, and
# esc/deploy/build-source-image.sh reported PASS — it greps three files INSIDE the
# image, which proved the module was compiled in and proved nothing about whether
# the server starts. A gate that never boots the thing is not a gate.
#
#   ./esc/deploy/boot-smoke-test.sh twenty-esc-src:v2.0.0-esc2
#
# Exit 0 only if the server answered /healthz AND the onboarding table exists
# after the upgrade path ran. Any other outcome is a non-zero exit and the last
# lines of the server log.
#
# NEVER RUN THIS ON CT175. It starts a second CRM server; CT175 has 8 GB and is
# running production Postgres, Redis and two CRM stacks. Build host: CT140.
#
# Everything it creates is named esc-smoke-* and is removed on exit, including on
# failure and on Ctrl-C. It never touches a network or volume it did not create.
set -euo pipefail

IMAGE="${1:-}"
KEEP="${ESC_SMOKE_KEEP:-0}"
BOOT_TIMEOUT="${ESC_SMOKE_BOOT_TIMEOUT:-300}"
DOCKER="${DOCKER:-docker}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_TEMPLATE="${SCRIPT_DIR}/smoke.env.template"

NET=esc-smoke-net
PG=esc-smoke-pg
REDIS=esc-smoke-redis
SERVER=esc-smoke-server
ENV_FILE=""

PG_PASSWORD=smoke
PG_DB=default

# Keys whose ABSENCE changes the provider graph. The outage was a DI fault; a smoke
# run whose env differs from production's cannot be trusted to find the next one.
ESC_SMOKE_REQUIRED_KEYS="EMAIL_DRIVER EMAIL_SMTP_HOST EMAIL_SMTP_PORT EMAIL_FROM_ADDRESS EMAIL_SYSTEM_ADDRESS API_RATE_LIMITING_SHORT_LIMIT API_RATE_LIMITING_LONG_LIMIT ESC_SSRF_ALLOWED_HOSTS ENTERPRISE_KEY IS_BILLING_ENABLED STORAGE_TYPE SERVER_URL"

ESC_COMMAND_NAME="2.0.0_AddEscOnboardingFastInstanceCommand_1790000100000"

say()  { printf '\n== %s\n' "$1"; }
ok()   { printf '   ok — %s\n' "$1"; }
die()  { printf '\nSMOKE FAILED: %s\n' "$1" >&2; return 1; }

cleanup() {
  local rc=$?

  [ -n "${ENV_FILE}" ] && rm -f "${ENV_FILE}"

  if [ "${KEEP}" = "1" ]; then
    printf '\nESC_SMOKE_KEEP=1 — leaving %s, %s, %s and network %s up.\n' \
      "${SERVER}" "${PG}" "${REDIS}" "${NET}"
    return $rc
  fi

  $DOCKER rm -f "${SERVER}" "${PG}" "${REDIS}" >/dev/null 2>&1 || true
  $DOCKER network rm "${NET}" >/dev/null 2>&1 || true

  return $rc
}
trap cleanup EXIT INT TERM

server_logs() {
  printf '\n--- last 60 lines of %s ---\n' "${SERVER}" >&2
  $DOCKER logs --tail 60 "${SERVER}" 2>&1 >&2 || true
  printf -- '--- end of log ---\n' >&2
}

psql_tuple() {
  $DOCKER exec "${PG}" psql -U postgres -d "${PG_DB}" -tAc "$1"
}

if [ -z "${IMAGE}" ]; then
  echo "usage: $0 <image-tag>   e.g. twenty-esc-src:v2.0.0-esc2" >&2
  exit 2
fi

if [ ! -f "${ENV_TEMPLATE}" ]; then
  die "no env template at ${ENV_TEMPLATE}" || exit 1
fi

# A missing key here means the smoke boots a different provider graph from
# production's, which is the one thing this test exists to avoid.
for key in ${ESC_SMOKE_REQUIRED_KEYS}; do
  grep -qE "^${key}=" "${ENV_TEMPLATE}" ||
    { die "smoke.env.template is missing ${key} — it would boot a different provider graph from production"; exit 1; }
done

say "0. this host is not production"
if $DOCKER ps --format '{{.Names}}' | grep -qx 'twenty-esc-server-1'; then
  die "twenty-esc-server-1 is running here — this is CT175. Run the smoke test on the build host."
  exit 1
fi
ok "no production CRM container on this host"

say "1. throwaway Postgres and Redis"
$DOCKER network create "${NET}" >/dev/null
$DOCKER run -d --name "${PG}" --network "${NET}" \
  -e POSTGRES_PASSWORD="${PG_PASSWORD}" -e POSTGRES_DB="${PG_DB}" \
  postgres:16-alpine >/dev/null
$DOCKER run -d --name "${REDIS}" --network "${NET}" redis:7-alpine >/dev/null

for _ in $(seq 1 60); do
  $DOCKER exec "${PG}" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
$DOCKER exec "${PG}" pg_isready -U postgres >/dev/null 2>&1 ||
  { die "throwaway Postgres never became ready"; exit 1; }
ok "datastores up"

say "2. production's key set, throwaway values"
ENV_FILE="$(mktemp)"
chmod 600 "${ENV_FILE}"
grep -vE '^(#|$)' "${ENV_TEMPLATE}" \
  | grep -vE '^(PG_DATABASE_URL|REDIS_URL|APP_SECRET)=' > "${ENV_FILE}"
{
  echo "PG_DATABASE_URL=postgres://postgres:${PG_PASSWORD}@${PG}:5432/${PG_DB}"
  echo "REDIS_URL=redis://${REDIS}:6379"
  echo "APP_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
} >> "${ENV_FILE}"

# Belt and braces: a smoke run that reached a real database would be worse than no
# smoke run at all.
grep -q "PG_DATABASE_URL=postgres://postgres:${PG_PASSWORD}@${PG}:5432/${PG_DB}" "${ENV_FILE}" ||
  { die "refusing to start: PG_DATABASE_URL is not the throwaway container"; exit 1; }
ok "$(wc -l < "${ENV_FILE}" | tr -d ' ') variables, database pinned to ${PG}"

say "3. boot ${IMAGE}"
$DOCKER run -d --name "${SERVER}" --network "${NET}" \
  --env-file "${ENV_FILE}" \
  --memory 3g \
  "${IMAGE}" >/dev/null

booted=0
for _ in $(seq 1 "$((BOOT_TIMEOUT / 5))"); do
  if ! $DOCKER ps --format '{{.Names}}' | grep -qx "${SERVER}"; then
    server_logs
    die "the container exited before it served — this is the failure class that caused the 2026-09-21 outage"
    exit 1
  fi

  code="$($DOCKER exec "${SERVER}" sh -c \
    'curl -s -o /dev/null -w "%{http_code}" --max-time 4 http://127.0.0.1:3000/healthz' 2>/dev/null || echo 000)"

  if [ "${code}" = "200" ]; then
    booted=1
    break
  fi

  sleep 5
done

if [ "${booted}" != "1" ]; then
  server_logs
  die "/healthz never returned 200 within ${BOOT_TIMEOUT}s"
  exit 1
fi
ok "/healthz 200 — the Nest module graph resolved"

say "4. the fresh-install path created the table"
table="$(psql_tuple "SELECT coalesce(to_regclass('core.\"escOnboarding\"')::text, 'MISSING')")"
[ "${table}" != "MISSING" ] ||
  { server_logs; die "core.\"escOnboarding\" absent after a fresh install — database:init:prod did not apply the migration"; exit 1; }
ok "table present after database:init:prod"

# ---------------------------------------------------------------------------
# The part that matters for CT175, and the reason a fresh-install check alone is
# not enough. The entrypoint runs `database:init:prod` ONLY when the `core` schema
# is absent. On CT175 it is not, so the ONLY thing that runs is
# `command:prod upgrade`. Reproduce exactly that state — core schema present,
# escOnboarding gone, no completed row for the command — and assert the upgrade
# path puts the table back. No production dump needed.
# ---------------------------------------------------------------------------
say "5. CT175's real state: core schema present, table absent"
psql_tuple "DROP TABLE core.\"escOnboarding\"" >/dev/null
psql_tuple "DELETE FROM core.\"upgradeMigration\" WHERE name = '${ESC_COMMAND_NAME}'" >/dev/null

table="$(psql_tuple "SELECT coalesce(to_regclass('core.\"escOnboarding\"')::text, 'MISSING')")"
[ "${table}" = "MISSING" ] || { die "could not reproduce the pre-migration state"; exit 1; }
ok "reproduced — this is what the deploy path finds on CT175"

say "6. command:prod upgrade creates it"
if ! $DOCKER exec "${SERVER}" sh -c 'cd /app && yarn command:prod upgrade' >/tmp/esc-smoke-upgrade.log 2>&1; then
  tail -40 /tmp/esc-smoke-upgrade.log >&2
  die "command:prod upgrade exited non-zero"
  exit 1
fi

table="$(psql_tuple "SELECT coalesce(to_regclass('core.\"escOnboarding\"')::text, 'MISSING')")"
status="$(psql_tuple "SELECT coalesce(max(status), 'ABSENT') FROM core.\"upgradeMigration\" WHERE name = '${ESC_COMMAND_NAME}' AND \"workspaceId\" IS NULL")"

[ "${table}" != "MISSING" ] ||
  { tail -40 /tmp/esc-smoke-upgrade.log >&2; die "upgrade ran but core.\"escOnboarding\" still does not exist — the instance command is not in the executed sequence"; exit 1; }
[ "${status}" = "completed" ] ||
  { die "table exists but ${ESC_COMMAND_NAME} is recorded '${status}' — something other than the upgrade path created it"; exit 1; }

ok "table recreated by command:prod upgrade, recorded completed"

printf '\nSMOKE PASSED for %s — it boots, it serves, and the deploy path creates its schema.\n' "${IMAGE}"
