import { defineView, getFieldUniversalIdentifier, ViewFilterOperand } from 'twenty-sdk/define';

import {
  APPLICATION_UNIVERSAL_IDENTIFIER,
  ARCHIVED_SUPPLIERS_ARCHIVED_AT_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  ARCHIVED_SUPPLIERS_ARCHIVED_REASON_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  ARCHIVED_SUPPLIERS_FILTER_UNIVERSAL_IDENTIFIER,
  ARCHIVED_SUPPLIERS_NAME_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  ARCHIVED_SUPPLIERS_VIEW_UNIVERSAL_IDENTIFIER,
  SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_ARCHIVED_REASON_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: ARCHIVED_SUPPLIERS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Archived suppliers',
  objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: ARCHIVED_SUPPLIERS_NAME_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
    },
    {
      universalIdentifier: ARCHIVED_SUPPLIERS_ARCHIVED_AT_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      position: 1,
      isVisible: true,
    },
    {
      universalIdentifier: ARCHIVED_SUPPLIERS_ARCHIVED_REASON_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: SUPPLIER_ARCHIVED_REASON_FIELD_UNIVERSAL_IDENTIFIER,
      position: 2,
      isVisible: true,
    },
  ],
  filters: [
    {
      universalIdentifier: ARCHIVED_SUPPLIERS_FILTER_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS_NOT_EMPTY,
      value: '',
    },
  ],
});
