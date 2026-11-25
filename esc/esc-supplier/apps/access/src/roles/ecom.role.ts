import { defineRole } from 'twenty-sdk/define';

import {
  SUPPLIER_AGREEMENT_COMMITMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_ANSWER_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_NEGOTIATION_NOTES_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_PENDING_DECISION_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_TRIAGE_DATE_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_TRIAGE_FIT_SIGNAL_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_TRIAGE_SCORE_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/module-identifiers';
import { ECOM_ROLE_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

const NEVER_DELETES = { canSoftDeleteAllRecords: false, canDestroyAllRecords: false };

// Ecom edits the supplier's basic data and the forms records; the status, the triage result and
// the agreements are read-only for it; it never deletes a record. canBeAssignedToApiKeys is true
// so the role can be tested with an API key.
export default defineRole({
  universalIdentifier: ECOM_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Ecom',
  description:
    'For the Ecom team: edits the supplier basics and the forms records, reads everything else',
  canUpdateAllSettings: false,
  canAccessAllAgentChatChannels: false,
  canBeAssignedToAgents: false,
  canBeAssignedToUsers: true,
  canBeAssignedToApiKeys: true,
  recordsPermissions: {
    canReadAllRecords: true,
    canUpdateAllRecords: false,
    canSoftDeleteAllRecords: false,
    canDestroyAllRecords: false,
    objects: [
      {
        // The six lifecycle fields (status, the triage result, the notes) stay read-only for Ecom.
        objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
        canReadAllRecords: true,
        canCreateAllRecords: true,
        canUpdateAllRecords: true,
        ...NEVER_DELETES,
        uneditableFields: [
          SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
          SUPPLIER_LIFECYCLE_TRIAGE_SCORE_FIELD_UNIVERSAL_IDENTIFIER,
          SUPPLIER_LIFECYCLE_TRIAGE_FIT_SIGNAL_FIELD_UNIVERSAL_IDENTIFIER,
          SUPPLIER_LIFECYCLE_TRIAGE_DATE_FIELD_UNIVERSAL_IDENTIFIER,
          SUPPLIER_LIFECYCLE_NEGOTIATION_NOTES_FIELD_UNIVERSAL_IDENTIFIER,
          SUPPLIER_LIFECYCLE_PENDING_DECISION_FIELD_UNIVERSAL_IDENTIFIER,
        ],
      },
      {
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
        canUpdateAllRecords: true,
        ...NEVER_DELETES,
      },
      {
        objectUniversalIdentifier: SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
        canReadAllRecords: true,
        canCreateAllRecords: true,
        canUpdateAllRecords: true,
        ...NEVER_DELETES,
      },
      {
        objectUniversalIdentifier: SUPPLIER_FORM_ANSWER_OBJECT_UNIVERSAL_IDENTIFIER,
        canReadAllRecords: true,
        canCreateAllRecords: true,
        canUpdateAllRecords: true,
        ...NEVER_DELETES,
      },
      {
        objectUniversalIdentifier: SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
        canReadAllRecords: true,
        canCreateAllRecords: false,
        canUpdateAllRecords: false,
        ...NEVER_DELETES,
      },
      {
        objectUniversalIdentifier:
          SUPPLIER_AGREEMENT_COMMITMENT_OBJECT_UNIVERSAL_IDENTIFIER,
        canReadAllRecords: true,
        canCreateAllRecords: false,
        canUpdateAllRecords: false,
        ...NEVER_DELETES,
      },
    ],
  },
});
