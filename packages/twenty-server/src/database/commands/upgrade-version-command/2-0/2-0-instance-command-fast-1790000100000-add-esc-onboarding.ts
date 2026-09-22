import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// Fork-owned. This is the ONLY mechanism that creates core."escOnboarding" on an
// existing instance such as CT175.
//
// The legacy TypeORM migration of the same timestamp
// (database/typeorm/core/migrations/common/1790000100000-add-esc-onboarding.ts) is
// kept for fresh installs, but the image entrypoint runs `database:init:prod` ONLY
// when the `core` schema is absent; on every other boot it runs `command:prod
// upgrade`, which builds its sequence from @RegisteredInstanceCommand bundles and
// never reaches TypeORM. Shipping the table as a legacy migration alone means it is
// never created, with no boot-time symptom.
//
// Registered at '2.0.0' deliberately: TWENTY_CROSS_UPGRADE_SUPPORTED_VERSIONS is
// TWENTY_PREVIOUS_VERSIONS + TWENTY_CURRENT_VERSION, and '2.1.0' lives only in
// TWENTY_NEXT_VERSIONS — a command registered there is a legal TwentyAllVersion but
// is never placed in the upgrade sequence, so it would not run either.
//
// Both statements are idempotent because a fresh install runs the legacy migration
// and this command in the same boot.
@RegisteredInstanceCommand('2.0.0', 1790000100000)
export class AddEscOnboardingFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "core"."escOnboarding" (
        "keycloakSub" text NOT NULL,
        "userId" uuid NOT NULL,
        "email" text,
        "isOnboarded" boolean NOT NULL DEFAULT false,
        "currentStep" text,
        "completedSteps" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "scriptVersion" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ESC_ONBOARDING_KEYCLOAK_SUB" PRIMARY KEY ("keycloakSub")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ESC_ONBOARDING_USER_ID_UNIQUE" ON "core"."escOnboarding" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_ESC_ONBOARDING_USER_ID_UNIQUE"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."escOnboarding"`);
  }
}
