#!/usr/bin/env sh
# Asserts that the ESC onboarding table EXISTS on a deployed instance, and that the
# instance command which creates it is RECORDED as completed.
#
# Why this exists: the image entrypoint runs TypeORM migrations only when the `core`
# schema is absent, so on an existing instance the legacy migration never executes.
# The table now ships as a fast instance command, which `yarn command:prod upgrade`
# does run — but a deploy that silently skipped it looks exactly like one that
# worked, until the first wizard query throws. So the deploy asserts it.
#
# Usage, on the host running the stack:
#     DOCKER='sudo docker' esc/deploy/assert-esc-schema.sh
#
# Exit 0 = both assertions hold. Exit 1 = the deploy is NOT done.
set -eu

DOCKER="${DOCKER:-docker}"
DB_CONTAINER="${DB_CONTAINER:-twenty-esc-db-1}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-default}"
COMMAND_NAME="${COMMAND_NAME:-2.0.0_AddEscOnboardingFastInstanceCommand_1790000100000}"

psql_tuple() {
  # shellcheck disable=SC2086
  $DOCKER exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1"
}

table=$(psql_tuple "SELECT coalesce(to_regclass('core.\"escOnboarding\"')::text, 'MISSING')")

if [ "$table" = "MISSING" ]; then
  echo "assert-esc-schema: FAIL — core.\"escOnboarding\" does not exist on ${DB_CONTAINER}." >&2
  echo "assert-esc-schema:   The upgrade step did not create it. Do NOT call this deploy done." >&2
  echo "assert-esc-schema:   Run it explicitly, then re-run this script:" >&2
  echo "assert-esc-schema:     $DOCKER exec twenty-esc-server-1 yarn command:prod upgrade" >&2
  exit 1
fi

status=$(psql_tuple "SELECT coalesce(max(status), 'ABSENT') FROM core.\"upgradeMigration\" WHERE name = '${COMMAND_NAME}' AND \"workspaceId\" IS NULL")

if [ "$status" != "completed" ]; then
  echo "assert-esc-schema: FAIL — the table exists but ${COMMAND_NAME}" >&2
  echo "assert-esc-schema:   is recorded as '${status}', not 'completed'. Something other than the" >&2
  echo "assert-esc-schema:   upgrade path created the table, or the command failed after creating it." >&2
  echo "assert-esc-schema:   Read the row before deciding: it is not safe to assume." >&2
  exit 1
fi

echo "assert-esc-schema: OK — core.\"escOnboarding\" exists (${table}) and ${COMMAND_NAME} is completed."
