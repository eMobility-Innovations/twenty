import { defineField, FieldType } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  SUPPLIER_LIFECYCLE_TRIAGE_FIT_SIGNAL_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier:
    SUPPLIER_LIFECYCLE_TRIAGE_FIT_SIGNAL_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.TEXT,
  name: 'lifecycleTriageFitSignal',
  label: 'Fit signal',
  description:
    'The signal from triage that says how well this supplier fits the current base.',
  icon: 'IconTarget',
  isNullable: true,
});
