import { defineView, getFieldUniversalIdentifier, ViewFilterOperand } from 'twenty-sdk/define';

import {
  SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  CORE_APPLICATION_UNIVERSAL_IDENTIFIER,
} from 'src/constants/core-identifiers';
import {
  SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_TRIAGE_DATE_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_PENDING_DECISION_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIERS_BY_STATUS_VIEW_UNIVERSAL_IDENTIFIER,
  SUPPLIERS_BY_STATUS_NAME_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIERS_BY_STATUS_STATUS_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIERS_BY_STATUS_TRIAGE_DATE_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIERS_BY_STATUS_PENDING_DECISION_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIERS_BY_STATUS_FILTER_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: SUPPLIERS_BY_STATUS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Suppliers by status',
  objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: SUPPLIERS_BY_STATUS_NAME_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: CORE_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
    },
    {
      universalIdentifier: SUPPLIERS_BY_STATUS_STATUS_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier:
        SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      position: 1,
      isVisible: true,
    },
    {
      universalIdentifier: SUPPLIERS_BY_STATUS_TRIAGE_DATE_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier:
        SUPPLIER_LIFECYCLE_TRIAGE_DATE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 2,
      isVisible: true,
    },
    {
      universalIdentifier: SUPPLIERS_BY_STATUS_PENDING_DECISION_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier:
        SUPPLIER_LIFECYCLE_PENDING_DECISION_FIELD_UNIVERSAL_IDENTIFIER,
      position: 3,
      isVisible: true,
    },
  ],
  filters: [
    {
      universalIdentifier: SUPPLIERS_BY_STATUS_FILTER_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS_EMPTY,
      value: '',
    },
  ],
});
