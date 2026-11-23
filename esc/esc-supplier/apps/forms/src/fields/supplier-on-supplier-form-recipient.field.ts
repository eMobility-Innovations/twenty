import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  SUPPLIER_FORMS_RECIPIENTS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// SET_NULL: deleting the record this points to never deletes the records that point to it.
export default defineField({
  universalIdentifier: SUPPLIER_FORM_RECIPIENT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'supplier',
  label: 'Supplier',
  icon: 'IconBuildingFactory2',
  relationTargetObjectMetadataUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: SUPPLIER_FORMS_RECIPIENTS_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'supplierId',
  },
});
