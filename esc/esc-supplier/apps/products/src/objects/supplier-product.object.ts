import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SUPPLIER_PRODUCT_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_COST_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_COST_VALID_FROM_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_NOTES_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_PRODUCT_KEY_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_SKU_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_SUPPLIER_CODE_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// What one supplier offers under one of our SKUs, at what cost (RM #28117).
// The product's name at the supplier is the built-in `name` field.
export default defineObject({
  universalIdentifier: SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'supplierProduct',
  namePlural: 'supplierProducts',
  labelSingular: 'Supplier product',
  labelPlural: 'Supplier products',
  description: 'What one supplier offers under one of our SKUs',
  icon: 'IconPackage',
  fields: [
    {
      universalIdentifier: SUPPLIER_PRODUCT_SUPPLIER_CODE_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'supplierCode',
      type: FieldType.TEXT,
      label: 'Supplier code',
      description:
        "The supplier's own product code; when the supplier has no code of its own, our SKU is written here",
      icon: 'IconBarcode',
      isNullable: true,
      isSearchable: true,
    },
    {
      universalIdentifier: SUPPLIER_PRODUCT_SKU_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'sku',
      type: FieldType.TEXT,
      label: 'SKU',
      description: 'Our SKU',
      icon: 'IconTag',
      isNullable: true,
      isSearchable: true,
    },
    {
      universalIdentifier: SUPPLIER_PRODUCT_COST_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'cost',
      type: FieldType.CURRENCY,
      label: 'Cost',
      description: 'What the supplier charges us for one unit',
      icon: 'IconCoins',
      isNullable: true,
    },
    {
      universalIdentifier: SUPPLIER_PRODUCT_COST_VALID_FROM_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'costValidFrom',
      type: FieldType.DATE,
      label: 'Cost valid from',
      description: 'The date from which this cost holds',
      icon: 'IconCalendar',
      isNullable: true,
    },
    {
      universalIdentifier: SUPPLIER_PRODUCT_PRODUCT_KEY_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'productKey',
      type: FieldType.TEXT,
      label: 'Product key',
      description:
        "The text `<the supplier's pimSupplierIdx>:<supplierCode>`; the one unique field, by which a CSV import finds an existing row",
      icon: 'IconKey',
      isNullable: true,
      isUnique: true,
    },
    {
      universalIdentifier: SUPPLIER_PRODUCT_NOTES_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'notes',
      type: FieldType.TEXT,
      label: 'Notes',
      description: 'Free text on this product',
      icon: 'IconNote',
      isNullable: true,
    },
    {
      universalIdentifier: SUPPLIER_PRODUCT_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      name: 'archivedAt',
      type: FieldType.DATE_TIME,
      label: 'Archived at',
      description: 'When this row went out of use; empty while in use',
      icon: 'IconArchive',
      isNullable: true,
      defaultValue: null,
    },
  ],
});
