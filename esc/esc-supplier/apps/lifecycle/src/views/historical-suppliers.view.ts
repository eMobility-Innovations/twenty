import { defineView, getFieldUniversalIdentifier, ViewFilterOperand } from 'twenty-sdk/define';

import {
  SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_ARCHIVED_REASON_FIELD_UNIVERSAL_IDENTIFIER,
  CORE_APPLICATION_UNIVERSAL_IDENTIFIER,
} from 'src/constants/core-identifiers';
import {
  SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  HISTORICAL_SUPPLIERS_VIEW_UNIVERSAL_IDENTIFIER,
  HISTORICAL_SUPPLIERS_NAME_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  HISTORICAL_SUPPLIERS_ARCHIVED_AT_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  HISTORICAL_SUPPLIERS_ARCHIVED_REASON_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  HISTORICAL_SUPPLIERS_STATUS_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  HISTORICAL_SUPPLIERS_FILTER_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: HISTORICAL_SUPPLIERS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Historical suppliers',
  objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: HISTORICAL_SUPPLIERS_NAME_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: CORE_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
    },
    {
      universalIdentifier: HISTORICAL_SUPPLIERS_ARCHIVED_AT_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier:
        SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      position: 1,
      isVisible: true,
    },
    {
      universalIdentifier:
        HISTORICAL_SUPPLIERS_ARCHIVED_REASON_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier:
        SUPPLIER_ARCHIVED_REASON_FIELD_UNIVERSAL_IDENTIFIER,
      position: 2,
      isVisible: true,
    },
    {
      universalIdentifier: HISTORICAL_SUPPLIERS_STATUS_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier:
        SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      position: 3,
      isVisible: true,
    },
  ],
  filters: [
    {
      universalIdentifier: HISTORICAL_SUPPLIERS_FILTER_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS_NOT_EMPTY,
      value: '',
    },
  ],
});
