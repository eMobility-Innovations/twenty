import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  SUPPLIER_FORM_ANSWERS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_ANSWER_FORM_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_ANSWER_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: SUPPLIER_FORM_ANSWERS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_FORM_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'answers',
  label: 'Answers',
  icon: 'IconChecklist',
  relationTargetObjectMetadataUniversalIdentifier: SUPPLIER_FORM_ANSWER_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: SUPPLIER_FORM_ANSWER_FORM_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
