import { defineRole } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  FORMS_INGEST_ROLE_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_ANSWER_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

const NEVER_DELETES = { canSoftDeleteAllRecords: false, canDestroyAllRecords: false };

// What the API key of twenty-ingest may do. That service answers the no-login form page, the
// one part of the supplier CRM a stranger can reach, so its key gets the forms data and
// nothing else: no settings, no members, no other module's records, and it never deletes.
export default defineRole({
  universalIdentifier: FORMS_INGEST_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'ESC Supplier — Forms ingest',
  description: 'For the API key of twenty-ingest: suppliers and the forms records only',
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
      {
        // The recipient import adds a missing supplier and never overwrites an existing one.
        objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
        canReadAllRecords: true,
        canCreateAllRecords: true,
        canUpdateAllRecords: false,
        ...NEVER_DELETES,
      },
      {
        // Publishing a new version retires the previous one, which is an update.
        objectUniversalIdentifier: SUPPLIER_FORM_OBJECT_UNIVERSAL_IDENTIFIER,
        canReadAllRecords: true,
        canCreateAllRecords: true,
        canUpdateAllRecords: true,
        ...NEVER_DELETES,
      },
      {
        objectUniversalIdentifier: SUPPLIER_FORM_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
        canReadAllRecords: true,
        canCreateAllRecords: true,
        canUpdateAllRecords: false,
        ...NEVER_DELETES,
      },
      {
        // Opened / answered status and timestamps are written on the recipient.
        objectUniversalIdentifier: SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
        canReadAllRecords: true,
        canCreateAllRecords: true,
        canUpdateAllRecords: true,
        ...NEVER_DELETES,
      },
      {
        // Append-only, enforced here for this key: it can add an answer and never change one.
        objectUniversalIdentifier: SUPPLIER_FORM_ANSWER_OBJECT_UNIVERSAL_IDENTIFIER,
        canReadAllRecords: true,
        canCreateAllRecords: true,
        canUpdateAllRecords: false,
        ...NEVER_DELETES,
      },
    ],
  },
});
