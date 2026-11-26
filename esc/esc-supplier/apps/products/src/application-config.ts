import { defineApplication } from 'twenty-sdk/define';

import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  VOLKANOS_API_KEY_VARIABLE_UNIVERSAL_IDENTIFIER,
  VOLKANOS_BASE_URL_VARIABLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  applicationVariables: {
    VOLKANOS_BASE_URL: {
      universalIdentifier: VOLKANOS_BASE_URL_VARIABLE_UNIVERSAL_IDENTIFIER,
      description: 'HTTPS base URL for Volkanos supplier CRM notifications',
    },
    VOLKANOS_API_KEY: {
      universalIdentifier: VOLKANOS_API_KEY_VARIABLE_UNIVERSAL_IDENTIFIER,
      description: 'Volkanos application API key for supplier CRM notifications',
      isSecret: true,
    },
  },
});
