import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  SUPPLIER_PRODUCT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCTS_RECORDS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// SET_NULL: deleting the supplier never deletes the products that point to it.
export default defineField({
  universalIdentifier: SUPPLIER_PRODUCT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'supplier',
  label: 'Supplier',
  description: 'The supplier this product is offered by',
  icon: 'IconBuildingFactory2',
  relationTargetObjectMetadataUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    SUPPLIER_PRODUCTS_RECORDS_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'supplierId',
  },
});
