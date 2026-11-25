import { defineField, FieldType } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  SUPPLIER_LIFECYCLE_TRIAGE_SCORE_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier:
    SUPPLIER_LIFECYCLE_TRIAGE_SCORE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.NUMBER,
  name: 'lifecycleTriageScore',
  label: 'Gap/overlap score',
  description: 'The score from triaging this supplier against the current base.',
  icon: 'IconChartBarHorizontal',
  isNullable: true,
  universalSettings: { dataType: 'int' },
});
