import { defineRole } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  PIM_READER_ROLE_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

const READ_ONLY = {
  canReadAllRecords: true,
  canCreateAllRecords: false,
  canUpdateAllRecords: false,
  canSoftDeleteAllRecords: false,
  canDestroyAllRecords: false,
};

// What the API key of the PIM (Volkanos, its Atlas connector) may do: read the suppliers and the
// supplier price list, nothing else. The CRM is where prices are entered; the PIM Atlas keeps the
// truth and pulls the rows from here (Karol, 26 Nov 2026, RM #28117). No settings, no members, no
// other module's records, no write and no delete. Assignable to API keys only.
export default defineRole({
  universalIdentifier: PIM_READER_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'ESC Supplier — PIM reader',
  description: 'For the API key of the PIM (Volkanos Atlas connector): read suppliers and supplier products only',
  canUpdateAllSettings: false,
  canAccessAllAgentChatChannels: false,
  canBeAssignedToAgents: false,
  canBeAssignedToUsers: false,
  canBeAssignedToApiKeys: true,
  recordsPermissions: {
    canReadAllRecords: false,
    canUpdateAllRecords: false,
    canSoftDeleteAllRecords: false,
    canDestroyAllRecords: false,
    objects: [
      { objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER, ...READ_ONLY },
      { objectUniversalIdentifier: SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER, ...READ_ONLY },
    ],
  },
});
