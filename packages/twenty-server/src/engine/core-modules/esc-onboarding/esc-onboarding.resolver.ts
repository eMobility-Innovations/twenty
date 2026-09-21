import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { AdvanceEscOnboardingStepInput } from 'src/engine/core-modules/esc-onboarding/dtos/advance-esc-onboarding-step.input';
import { EscOnboardingStateDTO } from 'src/engine/core-modules/esc-onboarding/dtos/esc-onboarding-state.dto';
import { EscOnboardingService } from 'src/engine/core-modules/esc-onboarding/services/esc-onboarding.service';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@UseGuards(WorkspaceAuthGuard, UserAuthGuard)
@UsePipes(ResolverValidationPipe)
@UseFilters(PreventNestToAutoLogGraphqlErrorsFilter)
@MetadataResolver()
export class EscOnboardingResolver {
  constructor(private readonly escOnboardingService: EscOnboardingService) {}

  // Deliberately NOT gated on the feature flag: the front has to be able to ask
  // whether the wizard is on, and a guard that throws would make "off" look
  // like a broken page.
  @Query(() => EscOnboardingStateDTO)
  @UseGuards(NoPermissionGuard)
  async escOnboardingState(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<EscOnboardingStateDTO> {
    return this.escOnboardingService.getState({
      userId: user.id,
      email: user.email,
      workspaceId: workspace.id,
    });
  }

  @Mutation(() => EscOnboardingStateDTO)
  @UseGuards(NoPermissionGuard)
  async advanceEscOnboardingStep(
    @Args('input') input: AdvanceEscOnboardingStepInput,
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<EscOnboardingStateDTO> {
    return this.escOnboardingService.advanceStep({
      actor: {
        userId: user.id,
        email: user.email,
        workspaceId: workspace.id,
      },
      completedStep: input.completedStep,
      nextStep: input.nextStep,
    });
  }

  @Mutation(() => EscOnboardingStateDTO)
  @UseGuards(NoPermissionGuard)
  async completeEscOnboarding(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<EscOnboardingStateDTO> {
    return this.escOnboardingService.complete({
      userId: user.id,
      email: user.email,
      workspaceId: workspace.id,
    });
  }

  // Replay for oneself, which is what the Help menu entry calls.
  @Mutation(() => EscOnboardingStateDTO)
  @UseGuards(NoPermissionGuard)
  async resetEscOnboarding(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<EscOnboardingStateDTO> {
    return this.escOnboardingService.resetOwn({
      userId: user.id,
      email: user.email,
      workspaceId: workspace.id,
    });
  }
}
