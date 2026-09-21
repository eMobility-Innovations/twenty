import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEscOnboarding1790000100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "core"."escOnboarding" (
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
      `CREATE UNIQUE INDEX "IDX_ESC_ONBOARDING_USER_ID_UNIQUE" ON "core"."escOnboarding" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "core"."IDX_ESC_ONBOARDING_USER_ID_UNIQUE"`,
    );
    await queryRunner.query(`DROP TABLE "core"."escOnboarding"`);
  }
}
