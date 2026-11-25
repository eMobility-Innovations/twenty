import { defineApplicationRole } from 'twenty-sdk/define';

import {
  APP_DISPLAY_NAME,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// The default function role every app carries. Unlike the other supplier apps it grants nothing:
// the access app has no objects, fields or views of its own, so its function role reads nothing.
export default defineApplicationRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: `${APP_DISPLAY_NAME} default function role`,
  description: `${APP_DISPLAY_NAME} default function role`,
  recordsPermissions: {
    canReadAllRecords: false,
    canUpdateAllRecords: false,
    canSoftDeleteAllRecords: false,
    canDestroyAllRecords: false,
  },
  canUpdateAllSettings: false,
  canBeAssignedToUsers: false,
  canBeAssignedToApiKeys: false,
  canBeAssignedToAgents: false,
});
