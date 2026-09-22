import 'reflect-metadata';

import * as fs from 'fs';
import * as path from 'path';

import { DiscoveryService } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { type QueryRunner } from 'typeorm';

import { AddEscOnboardingFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-0/2-0-instance-command-fast-1790000100000-add-esc-onboarding';
import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { UpdateGlobalObjectContextCommandMenuItemsCommand } from 'src/database/commands/upgrade-version-command/1-23/1-23-workspace-command-1780000005000-update-global-object-context-command-menu-items.command';
import { BackfillRecordPageLayoutsCommand } from 'src/database/commands/upgrade-version-command/1-23/1-23-workspace-command-1780000001500-backfill-record-page-layouts.command';
import { AddEscOnboarding1790000100000 } from 'src/database/typeorm/core/migrations/common/1790000100000-add-esc-onboarding';
import { TWENTY_CROSS_UPGRADE_SUPPORTED_VERSIONS } from 'src/engine/core-modules/upgrade/constants/twenty-cross-upgrade-supported-version.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';

// The image entrypoint runs `yarn database:init:prod` — the only thing in the
// server that executes TypeORM migrations — ONLY when the `core` schema is
// absent. On CT175 it is not, so every deploy runs `yarn command:prod upgrade`
// instead, whose sequence is built purely from @RegisteredInstanceCommand /
// @RegisteredWorkspaceCommand bundles. A schema change shipped as a legacy
// TypeORM migration alone is therefore never applied there, with no boot-time
// symptom: the server starts clean and the first query throws
// `relation "core.escOnboarding" does not exist`.
//
// Measured on production 2026-09-22: core._typeorm_migrations topped out at
// 1775909335324 and to_regclass('core."escOnboarding"') was NULL.
//
// These tests hold the mechanism that fixes that, and the parity between the two
// copies of the DDL. Written to fail if any of it is undone.
const ESC_INSTANCE_COMMAND_NAME =
  '2.0.0_AddEscOnboardingFastInstanceCommand_1790000100000';

// What core."upgradeMigration" held for every workspace on CT175 on 2026-09-22 —
// the last 1.23.0 workspace command. `UpgradeSequenceRunnerService` resumes from
// this cursor and walks forward, so a new step only ever runs if it sorts AFTER it.
const PRODUCTION_CURSOR_NAME =
  '1.23.0_UpdateGlobalObjectContextCommandMenuItemsCommand_1780000005000';

const MIGRATIONS_DIR = path.join(
  __dirname,
  '../../../../database/typeorm/core/migrations/common',
);

// Fork-owned migrations are timestamped past this; everything below it is upstream's.
const FORK_MIGRATION_TIMESTAMP_FLOOR = 1790000000000;

// The registry reads `instance.constructor.name` and the class's own metadata, so a
// prototype stand-in is enough and avoids constructing commands that carry DI.
const asProvider = (commandClass: abstract new (...args: never) => object) => {
  const instance = Object.create(commandClass.prototype);

  return { instance, metatype: commandClass };
};

const buildSequence = async () => {
  const module = await Test.createTestingModule({
    providers: [
      UpgradeCommandRegistryService,
      UpgradeSequenceReaderService,
      {
        provide: DiscoveryService,
        useValue: {
          getProviders: () => [
            ...INSTANCE_COMMANDS.map(asProvider),
            asProvider(BackfillRecordPageLayoutsCommand),
            asProvider(UpdateGlobalObjectContextCommandMenuItemsCommand),
          ],
        },
      },
    ],
  }).compile();

  module.get(UpgradeCommandRegistryService).onModuleInit();

  return module.get(UpgradeSequenceReaderService).getUpgradeSequence();
};

const collectSql = async (
  run: (queryRunner: QueryRunner) => Promise<void>,
): Promise<string[]> => {
  const statements: string[] = [];
  const queryRunner = {
    query: async (sql: string) => {
      statements.push(sql);
    },
  } as unknown as QueryRunner;

  await run(queryRunner);

  return statements;
};

// Whitespace and the idempotency clauses are the only legitimate differences
// between the instance command's DDL and the legacy migration's.
const normaliseDdl = (sql: string): string =>
  sql
    .replace(/IF NOT EXISTS /g, '')
    .replace(/\s+/g, ' ')
    .trim();

describe('esc-onboarding migration path', () => {
  it('registers the table creation as an instance command, which is what `command:prod upgrade` executes', async () => {
    const sequence = await buildSequence();

    const step = sequence.find(({ name }) => name === ESC_INSTANCE_COMMAND_NAME);

    expect(step).toBeDefined();
    expect(step?.kind).toBe('fast-instance');
  });

  it('places that command after the cursor production is parked on, so the upgrade run reaches it', async () => {
    const sequence = await buildSequence();

    const cursorIndex = sequence.findIndex(
      ({ name }) => name === PRODUCTION_CURSOR_NAME,
    );
    const escIndex = sequence.findIndex(
      ({ name }) => name === ESC_INSTANCE_COMMAND_NAME,
    );

    expect(cursorIndex).toBeGreaterThanOrEqual(0);
    expect(escIndex).toBeGreaterThan(cursorIndex);
  });

  // A command registered at a TWENTY_NEXT_VERSIONS value — '2.1.0', which the
  // `2-1/` folder invites — is a legal TwentyAllVersion and never runs, because
  // the sequence only covers TWENTY_PREVIOUS_VERSIONS + TWENTY_CURRENT_VERSION.
  it('registers it at a version the upgrade sequence actually covers', () => {
    const metadata = getRegisteredInstanceCommandMetadata(
      AddEscOnboardingFastInstanceCommand,
    );

    expect(metadata).toBeDefined();
    expect(
      (TWENTY_CROSS_UPGRADE_SUPPORTED_VERSIONS as readonly string[]).includes(
        metadata?.version as string,
      ),
    ).toBe(true);
  });

  it('emits DDL identical to the legacy migration it mirrors', async () => {
    const commandSql = await collectSql((queryRunner) =>
      new AddEscOnboardingFastInstanceCommand().up(queryRunner),
    );
    const migrationSql = await collectSql((queryRunner) =>
      new AddEscOnboarding1790000100000().up(queryRunner),
    );

    expect(commandSql.map(normaliseDdl)).toEqual(
      migrationSql.map(normaliseDdl),
    );
  });

  // A fresh install runs the legacy migration AND this command in the same boot
  // (`database:init:prod`, then the entrypoint's `command:prod upgrade`), so both
  // statements must tolerate the table already existing.
  it('is idempotent, because a fresh install runs both copies', async () => {
    const statements = await collectSql((queryRunner) =>
      new AddEscOnboardingFastInstanceCommand().up(queryRunner),
    );

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('CREATE TABLE IF NOT EXISTS');
    expect(statements[1]).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
  });

  // The detector for the class, not the instance: any fork-owned schema change
  // shipped only as a legacy TypeORM migration is dead on the production deploy
  // path. This fails the moment one is added without its instance command.
  it('leaves no fork-owned TypeORM migration without a registered instance command', () => {
    const forkMigrationTimestamps = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => Number(file.split('-')[0]))
      .filter(
        (timestamp) =>
          Number.isFinite(timestamp) &&
          timestamp >= FORK_MIGRATION_TIMESTAMP_FLOOR,
      );

    const registeredTimestamps = INSTANCE_COMMANDS.map(
      (commandClass) =>
        getRegisteredInstanceCommandMetadata(commandClass)?.timestamp,
    ).filter((timestamp): timestamp is number => timestamp !== undefined);

    expect(forkMigrationTimestamps.length).toBeGreaterThan(0);
    expect(
      forkMigrationTimestamps.filter(
        (timestamp) => !registeredTimestamps.includes(timestamp),
      ),
    ).toEqual([]);
  });
});
