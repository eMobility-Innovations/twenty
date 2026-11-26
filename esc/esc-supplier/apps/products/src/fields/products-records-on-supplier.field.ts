import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  SUPPLIER_PRODUCT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCTS_RECORDS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// The reverse side on the CORE supplier object. It belongs to this module and leaves with it.
export default defineField({
  universalIdentifier: SUPPLIER_PRODUCTS_RECORDS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'productsRecords',
  label: 'Products',
  description: 'This supplier’s products from the products module',
  icon: 'IconPackage',
  relationTargetObjectMetadataUniversalIdentifier: SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    SUPPLIER_PRODUCT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
