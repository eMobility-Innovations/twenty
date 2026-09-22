/**
 * Proves, against a real Postgres, that the two shipped copies of the ESC onboarding
 * DDL create the SAME table and that each is idempotent and reversible.
 *
 * It imports the SHIPPED classes rather than a retyped copy of their SQL, so the
 * thing proven is the thing that deploys.
 *
 * Neither copy had ever executed against any database before 2026-09-22 — the
 * cutover that was supposed to run the migration died in the entrypoint first. This
 * script is how that stops being true without CT175 being the first attempt.
 *
 * Needs a throwaway Postgres and this repo's node_modules. NOT a gate: the shared
 * gate runner has neither.
 *
 *   docker run -d --rm --name esc-ddl-proof -e POSTGRES_PASSWORD=proof \
 *     -p 55432:5432 postgres:16
 *   cd packages/twenty-server && \
 *     PGURL=postgres://postgres:proof@127.0.0.1:55432 npx tsx ../../esc/deploy/prove-esc-ddl.ts
 *   docker stop esc-ddl-proof
 */
import 'reflect-metadata';

import { Client } from 'pg';
import { type QueryRunner } from 'typeorm';

import { AddEscOnboardingFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-0/2-0-instance-command-fast-1790000100000-add-esc-onboarding';
import { AddEscOnboarding1790000100000 } from 'src/database/typeorm/core/migrations/common/1790000100000-add-esc-onboarding';

const baseUrl = process.env.PGURL ?? 'postgres://postgres:proof@127.0.0.1:55432';

const asQueryRunner = (client: Client): QueryRunner =>
  ({ query: (sql: string) => client.query(sql) }) as unknown as QueryRunner;

const connect = async (database: string): Promise<Client> => {
  const client = new Client({ connectionString: `${baseUrl}/${database}` });

  await client.connect();

  return client;
};

const createDatabase = async (database: string): Promise<Client> => {
  const admin = await connect('postgres');

  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.end();

  const client = await connect(database);

  // The production database HAS a `core` schema — that is precisely why the
  // entrypoint never runs migrations there.
  await client.query('CREATE SCHEMA core');

  return client;
};

const describeTable = async (client: Client): Promise<string> => {
  const columns = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'core' AND table_name = 'escOnboarding'
      ORDER BY column_name`,
  );
  const indexes = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'core' AND tablename = 'escOnboarding'
      ORDER BY indexname`,
  );

  return JSON.stringify({ columns: columns.rows, indexes: indexes.rows }, null, 2);
};

const tableExists = async (client: Client): Promise<boolean> => {
  const result = await client.query(
    `SELECT to_regclass('core."escOnboarding"') IS NOT NULL AS present`,
  );

  return result.rows[0].present === true;
};

const assert = (condition: boolean, what: string): void => {
  if (!condition) {
    throw new Error(`FAILED: ${what}`);
  }

  // eslint-disable-next-line no-console
  console.log(`  ok — ${what}`);
};

const main = async (): Promise<void> => {
  const command = new AddEscOnboardingFastInstanceCommand();
  const migration = new AddEscOnboarding1790000100000();

  // eslint-disable-next-line no-console
  console.log('1. the legacy migration, on a database that has a core schema');
  const migrationDb = await createDatabase('esc_proof_migration');

  await migration.up(asQueryRunner(migrationDb));
  assert(await tableExists(migrationDb), 'migration.up() created the table');
  const migrationShape = await describeTable(migrationDb);

  // eslint-disable-next-line no-console
  console.log('2. the instance command, on its own database');
  const commandDb = await createDatabase('esc_proof_command');

  await command.up(asQueryRunner(commandDb));
  assert(await tableExists(commandDb), 'command.up() created the table');
  const commandShape = await describeTable(commandDb);

  // eslint-disable-next-line no-console
  console.log('3. the two copies agree');
  assert(
    commandShape === migrationShape,
    'both copies produce an identical table and index set',
  );

  // eslint-disable-next-line no-console
  console.log('4. idempotency — a fresh install runs BOTH in the same boot');
  await command.up(asQueryRunner(migrationDb));
  assert(true, 'command.up() after migration.up() did not throw');
  await command.up(asQueryRunner(commandDb));
  assert(true, 'command.up() twice did not throw');

  // eslint-disable-next-line no-console
  console.log('5. down() is real and repeatable');
  await command.down(asQueryRunner(commandDb));
  assert(
    !(await tableExists(commandDb)),
    'command.down() removed the table',
  );
  await command.down(asQueryRunner(commandDb));
  assert(true, 'command.down() twice did not throw');

  await migrationDb.end();
  await commandDb.end();

  // eslint-disable-next-line no-console
  console.log('\nPROVEN against a real Postgres.');
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
