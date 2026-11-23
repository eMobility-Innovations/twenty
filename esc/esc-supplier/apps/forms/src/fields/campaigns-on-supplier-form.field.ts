import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  SUPPLIER_FORM_CAMPAIGNS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_CAMPAIGN_FORM_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: SUPPLIER_FORM_CAMPAIGNS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_FORM_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'campaigns',
  label: 'Campaigns',
  icon: 'IconSend',
  relationTargetObjectMetadataUniversalIdentifier: SUPPLIER_FORM_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: SUPPLIER_FORM_CAMPAIGN_FORM_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
