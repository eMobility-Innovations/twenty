import { defineField, FieldType } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  SUPPLIER_LIFECYCLE_TRIAGE_DATE_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier:
    SUPPLIER_LIFECYCLE_TRIAGE_DATE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.DATE,
  name: 'lifecycleTriageDate',
  label: 'Triage date',
  description: 'When this supplier was triaged.',
  icon: 'IconCalendar',
  isNullable: true,
});
