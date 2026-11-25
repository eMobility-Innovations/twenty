import { defineField, FieldType } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  SUPPLIER_LIFECYCLE_PENDING_DECISION_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier:
    SUPPLIER_LIFECYCLE_PENDING_DECISION_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.TEXT,
  name: 'lifecyclePendingDecision',
  label: 'Pending decision',
  description: 'The decision for this supplier that is still open.',
  icon: 'IconHourglassHigh',
  isNullable: true,
});
