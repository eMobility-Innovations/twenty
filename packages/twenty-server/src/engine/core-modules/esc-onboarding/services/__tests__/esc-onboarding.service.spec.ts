import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { FeatureFlagKey } from 'twenty-shared/types';

import { ESC_ONBOARDING_SCRIPT_VERSION } from 'src/engine/core-modules/esc-onboarding/constants/esc-onboarding.constants';
import { EscOnboardingEntity } from 'src/engine/core-modules/esc-onboarding/esc-onboarding.entity';
import { EscOnboardingIdentityService } from 'src/engine/core-modules/esc-onboarding/services/esc-onboarding-identity.service';
import { EscOnboardingService } from 'src/engine/core-modules/esc-onboarding/services/esc-onboarding.service';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const KEYCLOAK_SUB = 'kc-sub-abc';

const ACTOR = {
  userId: USER_ID,
  email: 'someone@escooterclinic.co.uk',
  workspaceId: WORKSPACE_ID,
};

const buildRow = (
  overrides: Partial<EscOnboardingEntity> = {},
): EscOnboardingEntity =>
  ({
    keycloakSub: KEYCLOAK_SUB,
    userId: USER_ID,
    email: ACTOR.email,
    isOnboarded: false,
    currentStep: null,
    completedSteps: [],
    scriptVersion: ESC_ONBOARDING_SCRIPT_VERSION,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as EscOnboardingEntity;

describe('EscOnboardingService', () => {
  let service: EscOnboardingService;
  let findOne: jest.Mock;
  let update: jest.Mock;
  let execute: jest.Mock;
  let isFeatureEnabled: jest.Mock;

  beforeEach(async () => {
    findOne = jest.fn();
    update = jest.fn().mockResolvedValue({ affected: 1 });
    execute = jest.fn().mockResolvedValue({ affected: 0 });
    isFeatureEnabled = jest.fn().mockResolvedValue(false);

    const queryBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscOnboardingService,
        {
          provide: getRepositoryToken(EscOnboardingEntity),
          useValue: {
            findOne,
            update,
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
          },
        },
        {
          provide: EscOnboardingIdentityService,
          useValue: {
            resolveKeycloakSub: jest.fn().mockResolvedValue(KEYCLOAK_SUB),
          },
        },
        {
          provide: FeatureFlagService,
          useValue: { isFeatureEnabled },
        },
      ],
    }).compile();

    service = module.get(EscOnboardingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('the flag', () => {
    it('should report the wizard disabled when the workspace has no flag row', async () => {
      findOne.mockResolvedValue(buildRow());

      const state = await service.getState(ACTOR);

      expect(isFeatureEnabled).toHaveBeenCalledWith(
        FeatureFlagKey.IS_ESC_ONBOARDING_WIZARD_ENABLED,
        WORKSPACE_ID,
      );
      expect(state.isWizardEnabled).toBe(false);
    });

    it('should report the wizard enabled only when the flag is on', async () => {
      findOne.mockResolvedValue(buildRow());
      isFeatureEnabled.mockResolvedValue(true);

      const state = await service.getState(ACTOR);

      expect(state.isWizardEnabled).toBe(true);
    });
  });

  describe('provisioning', () => {
    it('should create a row on the first authenticated request', async () => {
      findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(buildRow());

      const row = await service.provision(ACTOR);

      expect(execute).toHaveBeenCalledTimes(1);
      expect(row.keycloakSub).toBe(KEYCLOAK_SUB);
      expect(row.isOnboarded).toBe(false);
    });

    it('should not insert a second time for a user who already has a row', async () => {
      findOne.mockResolvedValue(buildRow());

      await service.provision(ACTOR);

      expect(execute).not.toHaveBeenCalled();
    });

    it('should default a freshly provisioned user to not-onboarded', async () => {
      findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(buildRow());

      const state = await service.getState(ACTOR);

      expect(state.isOnboarded).toBe(false);
    });

    it('should refuse rather than return a foreign row when the resolved identity is already held by another user', async () => {
      findOne.mockResolvedValue(null);

      await expect(service.provision(ACTOR)).rejects.toThrow(
        /already held by another user/,
      );
    });

    it('should refresh the display email when it has changed, without changing the key', async () => {
      findOne.mockResolvedValue(buildRow({ email: 'old@remotecrew.co.uk' }));

      const row = await service.provision(ACTOR);

      expect(update).toHaveBeenCalledWith(
        { keycloakSub: KEYCLOAK_SUB },
        { email: ACTOR.email },
      );
      expect(row.keycloakSub).toBe(KEYCLOAK_SUB);
    });
  });

  describe('step progress', () => {
    it('should record a completed step and the resume point', async () => {
      findOne.mockResolvedValue(buildRow());

      const state = await service.advanceStep({
        actor: ACTOR,
        completedStep: 'welcome',
        nextStep: 'create-a-person',
      });

      expect(update).toHaveBeenCalledWith(
        { keycloakSub: KEYCLOAK_SUB },
        { completedSteps: ['welcome'], currentStep: 'create-a-person' },
      );
      expect(state.currentStep).toBe('create-a-person');
      expect(state.completedSteps).toEqual(['welcome']);
    });

    it('should not record the same step twice when a step is replayed', async () => {
      findOne.mockResolvedValue(buildRow({ completedSteps: ['welcome'] }));

      const state = await service.advanceStep({
        actor: ACTOR,
        completedStep: 'welcome',
      });

      expect(state.completedSteps).toEqual(['welcome']);
    });

    it('should mark the user onboarded on completion', async () => {
      findOne.mockResolvedValue(buildRow({ completedSteps: ['welcome'] }));

      const state = await service.complete(ACTOR);

      expect(state.isOnboarded).toBe(true);
      expect(state.currentStep).toBeNull();
    });
  });

  describe('script version', () => {
    it('should treat a user finished on an older script as not onboarded', async () => {
      findOne.mockResolvedValue(
        buildRow({
          isOnboarded: true,
          scriptVersion: ESC_ONBOARDING_SCRIPT_VERSION - 1,
        }),
      );

      const state = await service.getState(ACTOR);

      expect(state.isOnboarded).toBe(false);
      expect(state.currentScriptVersion).toBe(ESC_ONBOARDING_SCRIPT_VERSION);
    });

    it('should treat a user finished on the current script as onboarded', async () => {
      findOne.mockResolvedValue(buildRow({ isOnboarded: true }));

      const state = await service.getState(ACTOR);

      expect(state.isOnboarded).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear progress for the signed-in user', async () => {
      findOne.mockResolvedValue(
        buildRow({ isOnboarded: true, completedSteps: ['welcome'] }),
      );

      const state = await service.resetOwn(ACTOR);

      expect(state.isOnboarded).toBe(false);
      expect(state.completedSteps).toEqual([]);
    });

    it('should reset one user by Keycloak sub and report how many rows changed', async () => {
      update.mockResolvedValue({ affected: 1 });

      await expect(service.resetByKeycloakSub(KEYCLOAK_SUB)).resolves.toBe(1);
      expect(update).toHaveBeenCalledWith(
        { keycloakSub: KEYCLOAK_SUB },
        { isOnboarded: false, currentStep: null, completedSteps: [] },
      );
    });

    it('should report zero when the Keycloak sub matches nobody', async () => {
      update.mockResolvedValue({ affected: 0 });

      await expect(service.resetByKeycloakSub('nobody')).resolves.toBe(0);
    });

    it('should replay only the users left behind by an older script', async () => {
      execute.mockResolvedValue({ affected: 7 });

      await expect(
        service.resetEveryoneBelowCurrentScriptVersion(),
      ).resolves.toBe(7);
    });
  });
});
