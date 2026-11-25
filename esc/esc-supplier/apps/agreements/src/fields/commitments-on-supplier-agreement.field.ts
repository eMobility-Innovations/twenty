import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  SUPPLIER_AGREEMENT_COMMITMENT_AGREEMENT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENT_COMMITMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENT_COMMITMENTS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: SUPPLIER_AGREEMENT_COMMITMENTS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'commitments',
  label: 'Commitments',
  description: 'The commitments of this agreement',
  icon: 'IconListChecks',
  relationTargetObjectMetadataUniversalIdentifier: SUPPLIER_AGREEMENT_COMMITMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: SUPPLIER_AGREEMENT_COMMITMENT_AGREEMENT_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
