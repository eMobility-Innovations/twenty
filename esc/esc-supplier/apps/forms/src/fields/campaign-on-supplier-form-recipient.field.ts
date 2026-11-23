import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import {
  SUPPLIER_FORM_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_CAMPAIGN_RECIPIENTS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// SET_NULL: deleting the record this points to never deletes the records that point to it.
export default defineField({
  universalIdentifier: SUPPLIER_FORM_RECIPIENT_CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'campaign',
  label: 'Campaign',
  icon: 'IconSend',
  relationTargetObjectMetadataUniversalIdentifier: SUPPLIER_FORM_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: SUPPLIER_FORM_CAMPAIGN_RECIPIENTS_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'campaignId',
  },
});
