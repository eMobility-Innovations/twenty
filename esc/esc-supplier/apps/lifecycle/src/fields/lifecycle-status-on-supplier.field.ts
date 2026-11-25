import { defineField, FieldType } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// No Historical option on purpose: Historical is not a state we store, it is the core archivedAt.
export default defineField({
  universalIdentifier:
    SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.SELECT,
  name: 'lifecycleStatus',
  label: 'Status',
  description:
    'Where this supplier stands with us (empty until set); a supplier is Historical when the core archivedAt field is filled, and no second flag is kept for it.',
  icon: 'IconGauge',
  isNullable: true,
  options: [
    { value: 'PARKED', label: 'Parked', position: 0, color: 'gray' },
    { value: 'ONBOARDING', label: 'Onboarding', position: 1, color: 'blue' },
    { value: 'ACTIVE', label: 'Active', position: 2, color: 'green' },
    {
      value: 'UNDER_REVIEW',
      label: 'Under review',
      position: 3,
      color: 'orange',
    },
  ],
});
