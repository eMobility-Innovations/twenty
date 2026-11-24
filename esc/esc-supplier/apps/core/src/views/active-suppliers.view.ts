import { defineView, getFieldUniversalIdentifier, ViewFilterOperand } from 'twenty-sdk/define';

import {
  ACTIVE_SUPPLIERS_FILTER_UNIVERSAL_IDENTIFIER,
  ACTIVE_SUPPLIERS_NAME_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  ACTIVE_SUPPLIERS_VIEW_UNIVERSAL_IDENTIFIER,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: ACTIVE_SUPPLIERS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Active suppliers',
  objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: ACTIVE_SUPPLIERS_NAME_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
    },
  ],
  filters: [
    {
      universalIdentifier: ACTIVE_SUPPLIERS_FILTER_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS_EMPTY,
      value: '',
    },
  ],
});
