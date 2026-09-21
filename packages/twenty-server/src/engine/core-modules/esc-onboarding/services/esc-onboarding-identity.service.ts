import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { ESC_ONBOARDING_LOCAL_SUB_PREFIX } from 'src/engine/core-modules/esc-onboarding/constants/esc-onboarding.constants';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';

// Twenty matches an SSO login to an account by EMAIL and keeps no column for
// the identity-provider subject; it only stores the whole claims object on the
// connected account it creates at sign-in. This service is the one place that
// digs the Keycloak `sub` back out of that blob, so the rest of the wizard can
// key on a stable identity.
@Injectable()
export class EscOnboardingIdentityService {
  constructor(
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
  ) {}

  async resolveKeycloakSub(userId: string): Promise<string> {
    const claims = await this.findLatestOidcClaims(userId);
    const subject = claims?.['sub'];

    if (typeof subject === 'string' && subject.length > 0) {
      return subject;
    }

    // No identity-provider login on record. Never block the user — give them a
    // namespaced synthetic subject that a real Keycloak `sub` can never equal.
    return `${ESC_ONBOARDING_LOCAL_SUB_PREFIX}${userId}`;
  }

  private async findLatestOidcClaims(
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const connectedAccount = await this.connectedAccountRepository
      .createQueryBuilder('connectedAccount')
      .innerJoin(
        UserWorkspaceEntity,
        'userWorkspace',
        'userWorkspace.id = connectedAccount.userWorkspaceId',
      )
      .where('userWorkspace.userId = :userId', { userId })
      .andWhere('connectedAccount.oidcTokenClaims IS NOT NULL')
      .orderBy('connectedAccount.updatedAt', 'DESC')
      .select(['connectedAccount.oidcTokenClaims'])
      .getOne();

    return connectedAccount?.oidcTokenClaims ?? null;
  }
}
