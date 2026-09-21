import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { EscOnboardingIdentityService } from 'src/engine/core-modules/esc-onboarding/services/esc-onboarding-identity.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const buildQueryBuilder = (result: unknown) => ({
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(result),
});

describe('EscOnboardingIdentityService', () => {
  let service: EscOnboardingIdentityService;
  let connectedAccountRepository: jest.Mocked<
    Pick<Repository<ConnectedAccountEntity>, 'createQueryBuilder'>
  >;

  const buildService = async (queryResult: unknown) => {
    connectedAccountRepository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(buildQueryBuilder(queryResult)),
    } as unknown as jest.Mocked<
      Pick<Repository<ConnectedAccountEntity>, 'createQueryBuilder'>
    >;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscOnboardingIdentityService,
        {
          provide: getRepositoryToken(ConnectedAccountEntity),
          useValue: connectedAccountRepository,
        },
      ],
    }).compile();

    service = module.get(EscOnboardingIdentityService);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return the Keycloak sub when the connected account carries one', async () => {
    await buildService({
      oidcTokenClaims: { sub: 'kc-sub-abc', email: 'a@b.c' },
    });

    await expect(service.resolveKeycloakSub(USER_ID)).resolves.toBe(
      'kc-sub-abc',
    );
  });

  it('should fall back to a namespaced synthetic subject when the user has never signed in through the identity provider', async () => {
    await buildService(null);

    await expect(service.resolveKeycloakSub(USER_ID)).resolves.toBe(
      `local:${USER_ID}`,
    );
  });

  it('should fall back when the claims object exists but holds no sub', async () => {
    await buildService({ oidcTokenClaims: { email: 'a@b.c' } });

    await expect(service.resolveKeycloakSub(USER_ID)).resolves.toBe(
      `local:${USER_ID}`,
    );
  });

  it('should never key on the email claim', async () => {
    await buildService({ oidcTokenClaims: { email: 'a@b.c' } });

    const resolved = await service.resolveKeycloakSub(USER_ID);

    expect(resolved).not.toContain('a@b.c');
  });
});
