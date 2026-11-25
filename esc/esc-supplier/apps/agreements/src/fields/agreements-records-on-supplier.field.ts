import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  SUPPLIER_AGREEMENT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENTS_RECORDS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// The reverse side on the CORE supplier object. It belongs to this module and leaves with it.
export default defineField({
  universalIdentifier: SUPPLIER_AGREEMENTS_RECORDS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'agreementsRecords',
  label: 'Agreements',
  description: 'This supplier’s agreements from the agreements module',
  icon: 'IconFileCertificate',
  relationTargetObjectMetadataUniversalIdentifier: SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: SUPPLIER_AGREEMENT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
