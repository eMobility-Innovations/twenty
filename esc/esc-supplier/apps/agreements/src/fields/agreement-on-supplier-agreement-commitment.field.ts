import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import {
  SUPPLIER_AGREEMENT_COMMITMENT_AGREEMENT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENT_COMMITMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENT_COMMITMENTS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// SET_NULL: deleting the agreement never deletes the commitments that point to it.
export default defineField({
  universalIdentifier: SUPPLIER_AGREEMENT_COMMITMENT_AGREEMENT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_AGREEMENT_COMMITMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'agreement',
  label: 'Agreement',
  description: 'The agreement this commitment belongs to',
  icon: 'IconFileCertificate',
  relationTargetObjectMetadataUniversalIdentifier: SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: SUPPLIER_AGREEMENT_COMMITMENTS_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'agreementId',
  },
});
