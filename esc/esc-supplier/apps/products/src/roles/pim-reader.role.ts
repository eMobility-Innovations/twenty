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

const READ_AND_UPDATE = {
  ...READ_ONLY,
  canUpdateAllRecords: true,
};

// What the API key of the PIM (Volkanos, its Atlas connector) may do: read the suppliers, and
// read and update the supplier price list — the PIM writes cost and the SKU link back into each
// supplier product every 5 minutes (Karol, 26 Nov 2026, RM #28117). No create, no record removal,
// no settings, no members, no other module's records. Assignable to API keys only.
export default defineRole({
  universalIdentifier: PIM_READER_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'ESC Supplier — PIM sync',
  description: 'For the API key of the PIM (Volkanos Atlas adapter): read suppliers; read and update supplier products',
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
      {
        objectUniversalIdentifier: SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
        ...READ_AND_UPDATE,
      },
    ],
  },
});
