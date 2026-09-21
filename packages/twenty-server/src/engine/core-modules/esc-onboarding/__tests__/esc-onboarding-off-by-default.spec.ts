import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FeatureFlagKey } from 'twenty-shared/types';

import { PUBLIC_FEATURE_FLAGS } from 'src/engine/core-modules/feature-flag/constants/public-feature-flag.const';
import { DEFAULT_FEATURE_FLAGS } from 'src/engine/workspace-manager/workspace-migration/constant/default-feature-flags';

// The operator's condition for this branch: the wizard is off for everyone
// until they say otherwise. `FeatureFlagService.isFeatureEnabled` returns false
// for a key with no row, so "off for everyone" holds exactly as long as nothing
// writes a row on its own. These are the three places that would.
describe('the onboarding wizard is off by default', () => {
  it('should not be enabled for a newly created workspace', () => {
    expect(DEFAULT_FEATURE_FLAGS).not.toContain(
      FeatureFlagKey.IS_ESC_ONBOARDING_WIZARD_ENABLED,
    );
  });

  it('should not be self-enablable from Settings > Lab', () => {
    expect(PUBLIC_FEATURE_FLAGS.map((flag) => flag.key)).not.toContain(
      FeatureFlagKey.IS_ESC_ONBOARDING_WIZARD_ENABLED,
    );
  });

  it('should not be seeded in the development environment', () => {
    // The seeder writes rows through a query runner, so there is no value to
    // assert against without a database. Its list is static, so the file itself
    // is the honest thing to check.
    const seeder = readFileSync(
      join(
        __dirname,
        '../../../workspace-manager/dev-seeder/core/utils/seed-feature-flags.util.ts',
      ),
      'utf-8',
    );

    expect(seeder).not.toContain('IS_ESC_ONBOARDING_WIZARD_ENABLED');
  });
});
