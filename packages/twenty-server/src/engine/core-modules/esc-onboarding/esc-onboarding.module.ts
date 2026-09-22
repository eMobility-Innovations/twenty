import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TypeORMModule } from 'src/database/typeorm/typeorm.module';
import { EscOnboardingAdminResolver } from 'src/engine/core-modules/esc-onboarding/esc-onboarding-admin.resolver';
import { EscOnboardingEntity } from 'src/engine/core-modules/esc-onboarding/esc-onboarding.entity';
import { EscOnboardingResolver } from 'src/engine/core-modules/esc-onboarding/esc-onboarding.resolver';
import { EscOnboardingIdentityService } from 'src/engine/core-modules/esc-onboarding/services/esc-onboarding-identity.service';
import { EscOnboardingService } from 'src/engine/core-modules/esc-onboarding/services/esc-onboarding.service';
import { FeatureFlagModule } from 'src/engine/core-modules/feature-flag/feature-flag.module';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';

@Module({
  imports: [
    TypeORMModule,
    TypeOrmModule.forFeature([EscOnboardingEntity, ConnectedAccountEntity]),
    FeatureFlagModule,
    // SettingsPermissionGuard on the admin resolver injects PermissionsService.
    // A guard's dependencies are resolved in the module that DECLARES the resolver,
    // not where the guard is defined — leaving this out compiles, typechecks and
    // passes every unit test, then kills the server at Nest bootstrap.
    PermissionsModule,
  ],
  exports: [EscOnboardingService],
  providers: [
    EscOnboardingService,
    EscOnboardingIdentityService,
    EscOnboardingResolver,
    EscOnboardingAdminResolver,
  ],
})
export class EscOnboardingModule {}
