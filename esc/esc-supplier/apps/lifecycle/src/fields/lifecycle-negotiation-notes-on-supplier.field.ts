import { defineField, FieldType } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  SUPPLIER_LIFECYCLE_NEGOTIATION_NOTES_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier:
    SUPPLIER_LIFECYCLE_NEGOTIATION_NOTES_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RICH_TEXT,
  name: 'lifecycleNegotiationNotes',
  label: 'Negotiation notes',
  description: 'Notes from the negotiation with this supplier.',
  icon: 'IconFileText',
  isNullable: true,
});
