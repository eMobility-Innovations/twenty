// The in-use products whose cost is missing, so someone can find and fill it (RM #28117)
import { defineView, getFieldUniversalIdentifier, ViewFilterOperand } from 'twenty-sdk/define';

import {
  APPLICATION_UNIVERSAL_IDENTIFIER,
  PRODUCTS_WITHOUT_A_COST_ARCHIVED_AT_FILTER_UNIVERSAL_IDENTIFIER,
  PRODUCTS_WITHOUT_A_COST_COST_FILTER_UNIVERSAL_IDENTIFIER,
  PRODUCTS_WITHOUT_A_COST_COST_VALID_FROM_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  PRODUCTS_WITHOUT_A_COST_COST_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  PRODUCTS_WITHOUT_A_COST_NAME_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  PRODUCTS_WITHOUT_A_COST_SKU_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  PRODUCTS_WITHOUT_A_COST_SUPPLIER_CODE_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  PRODUCTS_WITHOUT_A_COST_SUPPLIER_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
  PRODUCTS_WITHOUT_A_COST_VIEW_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_COST_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_COST_VALID_FROM_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_SKU_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_SUPPLIER_CODE_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: PRODUCTS_WITHOUT_A_COST_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Products without a cost',
  objectUniversalIdentifier: SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: PRODUCTS_WITHOUT_A_COST_NAME_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
    },
    {
      universalIdentifier: PRODUCTS_WITHOUT_A_COST_SUPPLIER_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier:
        SUPPLIER_PRODUCT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
      position: 1,
      isVisible: true,
    },
    {
      universalIdentifier: PRODUCTS_WITHOUT_A_COST_SUPPLIER_CODE_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier:
        SUPPLIER_PRODUCT_SUPPLIER_CODE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 2,
      isVisible: true,
    },
    {
      universalIdentifier: PRODUCTS_WITHOUT_A_COST_SKU_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: SUPPLIER_PRODUCT_SKU_FIELD_UNIVERSAL_IDENTIFIER,
      position: 3,
      isVisible: true,
    },
    {
      universalIdentifier: PRODUCTS_WITHOUT_A_COST_COST_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: SUPPLIER_PRODUCT_COST_FIELD_UNIVERSAL_IDENTIFIER,
      position: 4,
      isVisible: true,
    },
    {
      universalIdentifier: PRODUCTS_WITHOUT_A_COST_COST_VALID_FROM_VIEW_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier:
        SUPPLIER_PRODUCT_COST_VALID_FROM_FIELD_UNIVERSAL_IDENTIFIER,
      position: 5,
      isVisible: true,
    },
  ],
  filters: [
    {
      universalIdentifier: PRODUCTS_WITHOUT_A_COST_COST_FILTER_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: SUPPLIER_PRODUCT_COST_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS_EMPTY,
      subFieldName: 'amountMicros',
      value: '',
    },
    {
      universalIdentifier: PRODUCTS_WITHOUT_A_COST_ARCHIVED_AT_FILTER_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier:
        SUPPLIER_PRODUCT_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS_EMPTY,
      value: '',
    },
  ],
});
