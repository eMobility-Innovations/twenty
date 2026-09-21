import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { EscOnboardingResetResultDTO } from 'src/engine/core-modules/esc-onboarding/dtos/esc-onboarding-reset-result.dto';
import { ResetEscOnboardingInput } from 'src/engine/core-modules/esc-onboarding/dtos/reset-esc-onboarding.input';
import { EscOnboardingService } from 'src/engine/core-modules/esc-onboarding/services/esc-onboarding.service';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@UseGuards(
  WorkspaceAuthGuard,
  UserAuthGuard,
  SettingsPermissionGuard(PermissionFlagType.SECURITY),
)
@UsePipes(ResolverValidationPipe)
@UseFilters(PreventNestToAutoLogGraphqlErrorsFilter)
@MetadataResolver()
export class EscOnboardingAdminResolver {
  constructor(private readonly escOnboardingService: EscOnboardingService) {}

  @Mutation(() => EscOnboardingResetResultDTO)
  async resetEscOnboardingForUser(
    @Args('input') input: ResetEscOnboardingInput,
  ): Promise<EscOnboardingResetResultDTO> {
    const resetCount = await this.escOnboardingService.resetByKeycloakSub(
      input.keycloakSub,
    );

    return { resetCount };
  }

  @Mutation(() => EscOnboardingResetResultDTO)
  async resetEscOnboardingForEveryone(): Promise<EscOnboardingResetResultDTO> {
    const resetCount =
      await this.escOnboardingService.resetEveryoneBelowCurrentScriptVersion();

    return { resetCount };
  }
}
