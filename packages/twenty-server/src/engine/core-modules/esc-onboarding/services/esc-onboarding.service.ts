import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { FeatureFlagKey } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { ESC_ONBOARDING_SCRIPT_VERSION } from 'src/engine/core-modules/esc-onboarding/constants/esc-onboarding.constants';
import { type EscOnboardingStateDTO } from 'src/engine/core-modules/esc-onboarding/dtos/esc-onboarding-state.dto';
import { EscOnboardingEntity } from 'src/engine/core-modules/esc-onboarding/esc-onboarding.entity';
import { EscOnboardingIdentityService } from 'src/engine/core-modules/esc-onboarding/services/esc-onboarding-identity.service';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';

type EscOnboardingActor = {
  userId: string;
  email: string | null;
  workspaceId: string;
};

@Injectable()
export class EscOnboardingService {
  constructor(
    @InjectRepository(EscOnboardingEntity)
    private readonly escOnboardingRepository: Repository<EscOnboardingEntity>,
    private readonly escOnboardingIdentityService: EscOnboardingIdentityService,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  async isWizardEnabled(workspaceId: string): Promise<boolean> {
    return this.featureFlagService.isFeatureEnabled(
      FeatureFlagKey.IS_ESC_ONBOARDING_WIZARD_ENABLED,
      workspaceId,
    );
  }

  // Idempotent: called on every read, creates the row exactly once. A user can
  // therefore never reach the CRM without a row, and a concurrent first request
  // cannot produce two.
  async provision(actor: EscOnboardingActor): Promise<EscOnboardingEntity> {
    const existing = await this.escOnboardingRepository.findOne({
      where: { userId: actor.userId },
    });

    if (isDefined(existing)) {
      return this.refreshDisplayEmail(existing, actor.email);
    }

    const keycloakSub =
      await this.escOnboardingIdentityService.resolveKeycloakSub(actor.userId);

    await this.escOnboardingRepository
      .createQueryBuilder()
      .insert()
      .into(EscOnboardingEntity)
      .values({
        keycloakSub,
        userId: actor.userId,
        email: actor.email,
        isOnboarded: false,
        currentStep: null,
        completedSteps: [],
        scriptVersion: ESC_ONBOARDING_SCRIPT_VERSION,
      })
      .orIgnore()
      .execute();

    const provisioned = await this.escOnboardingRepository.findOne({
      where: { userId: actor.userId },
    });

    if (!isDefined(provisioned)) {
      // orIgnore swallowed the insert and the row is still not there: the only
      // way that happens is a keycloakSub already held by a DIFFERENT userId.
      throw new Error(
        `Could not provision onboarding for user ${actor.userId}: the resolved identity is already held by another user`,
      );
    }

    return provisioned;
  }

  async getState(actor: EscOnboardingActor): Promise<EscOnboardingStateDTO> {
    const [isWizardEnabled, row] = await Promise.all([
      this.isWizardEnabled(actor.workspaceId),
      this.provision(actor),
    ]);

    return this.toState(row, isWizardEnabled);
  }

  async advanceStep({
    actor,
    completedStep,
    nextStep,
  }: {
    actor: EscOnboardingActor;
    completedStep: string;
    nextStep?: string;
  }): Promise<EscOnboardingStateDTO> {
    const row = await this.provision(actor);
    const completedSteps = this.withStep(row.completedSteps, completedStep);

    await this.escOnboardingRepository.update(
      { keycloakSub: row.keycloakSub },
      { completedSteps, currentStep: nextStep ?? null },
    );

    return this.toState(
      { ...row, completedSteps, currentStep: nextStep ?? null },
      await this.isWizardEnabled(actor.workspaceId),
    );
  }

  async complete(actor: EscOnboardingActor): Promise<EscOnboardingStateDTO> {
    const row = await this.provision(actor);

    await this.escOnboardingRepository.update(
      { keycloakSub: row.keycloakSub },
      {
        isOnboarded: true,
        currentStep: null,
        scriptVersion: ESC_ONBOARDING_SCRIPT_VERSION,
      },
    );

    return this.toState(
      {
        ...row,
        isOnboarded: true,
        currentStep: null,
        scriptVersion: ESC_ONBOARDING_SCRIPT_VERSION,
      },
      await this.isWizardEnabled(actor.workspaceId),
    );
  }

  async resetOwn(actor: EscOnboardingActor): Promise<EscOnboardingStateDTO> {
    const row = await this.provision(actor);

    await this.escOnboardingRepository.update(
      { keycloakSub: row.keycloakSub },
      { isOnboarded: false, currentStep: null, completedSteps: [] },
    );

    return this.toState(
      { ...row, isOnboarded: false, currentStep: null, completedSteps: [] },
      await this.isWizardEnabled(actor.workspaceId),
    );
  }

  async resetByKeycloakSub(keycloakSub: string): Promise<number> {
    const result = await this.escOnboardingRepository.update(
      { keycloakSub },
      { isOnboarded: false, currentStep: null, completedSteps: [] },
    );

    return result.affected ?? 0;
  }

  // The release-time replay: everyone whose row predates the running script is
  // walked through it again on their next visit.
  async resetEveryoneBelowCurrentScriptVersion(): Promise<number> {
    const result = await this.escOnboardingRepository
      .createQueryBuilder()
      .update(EscOnboardingEntity)
      .set({
        isOnboarded: false,
        currentStep: null,
        completedSteps: [],
        scriptVersion: ESC_ONBOARDING_SCRIPT_VERSION,
      })
      .where('"scriptVersion" < :scriptVersion', {
        scriptVersion: ESC_ONBOARDING_SCRIPT_VERSION,
      })
      .execute();

    return result.affected ?? 0;
  }

  private async refreshDisplayEmail(
    row: EscOnboardingEntity,
    email: string | null,
  ): Promise<EscOnboardingEntity> {
    if (row.email === email) {
      return row;
    }

    await this.escOnboardingRepository.update(
      { keycloakSub: row.keycloakSub },
      { email },
    );

    return { ...row, email };
  }

  private withStep(completedSteps: string[], step: string): string[] {
    if (completedSteps.includes(step)) {
      return completedSteps;
    }

    return [...completedSteps, step];
  }

  private toState(
    row: EscOnboardingEntity,
    isWizardEnabled: boolean,
  ): EscOnboardingStateDTO {
    // A row left behind by an older script counts as not onboarded, which is
    // what makes a bumped script version replay without a data migration.
    const isOnboarded =
      row.isOnboarded && row.scriptVersion >= ESC_ONBOARDING_SCRIPT_VERSION;

    return {
      isWizardEnabled,
      isOnboarded,
      currentStep: row.currentStep,
      completedSteps: row.completedSteps ?? [],
      scriptVersion: row.scriptVersion,
      currentScriptVersion: ESC_ONBOARDING_SCRIPT_VERSION,
    };
  }
}
