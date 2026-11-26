import {
  FieldType,
  getFieldUniversalIdentifier,
  RelationType,
  ViewFilterOperand,
} from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  APPLICATION_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_COST_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_COST_VALID_FROM_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_PRODUCT_KEY_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_SKU_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_SUPPLIER_CODE_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCTS_RECORDS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCTS_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import productsRecordsOnSupplier from 'src/fields/products-records-on-supplier.field';
import supplierOnSupplierProduct from 'src/fields/supplier-on-supplier-product.field';
import supplierProductsMenuItem from 'src/navigation-menu-items/supplier-products.navigation-menu-item';
import supplierProduct from 'src/objects/supplier-product.object';
import archivedSupplierProducts from 'src/views/archived-supplier-products.view';
import productsWithoutACost from 'src/views/products-without-a-cost.view';
import productsWithoutAKey from 'src/views/products-without-a-key.view';
import supplierProductsView from 'src/views/supplier-products.view';
import { describe, expect, it } from 'vitest';

// Only what these tests read. defineObject returns a wide config; the tests pin a slice of it.
type Field = {
  name: string;
  type: string;
  isNullable?: boolean;
  isSearchable?: boolean;
  isUnique?: boolean;
};
const fields = (object: { config: { fields?: readonly unknown[] } }) =>
  (object.config.fields ?? []) as Field[];
const fieldNames = (object: { config: { fields?: readonly unknown[] } }) =>
  fields(object).map((entry) => entry.name);
const objectField = (object: { config: { fields?: readonly unknown[] } }, name: string) =>
  fields(object).find((entry) => entry.name === name);

const fieldTypeCases: [string, FieldType][] = [
  ['supplierCode', FieldType.TEXT],
  ['sku', FieldType.TEXT],
  ['cost', FieldType.CURRENCY],
  ['costValidFrom', FieldType.DATE],
  ['productKey', FieldType.TEXT],
  ['notes', FieldType.TEXT],
  ['archivedAt', FieldType.DATE_TIME],
];

describe('products module object', () => {
  it('should define supplierProduct without errors or warnings', () => {
    expect(supplierProduct.errors).toEqual([]);
    expect(supplierProduct.warnings).toEqual([]);
    expect(supplierProduct.config.nameSingular).toBe('supplierProduct');
    expect(supplierProduct.config.namePlural).toBe('supplierProducts');
    expect(supplierProduct.config.labelSingular).toBe('Supplier product');
    expect(supplierProduct.config.labelPlural).toBe('Supplier products');
  });

  it('should define exactly these fields, in order', () => {
    expect(fieldNames(supplierProduct)).toEqual([
      'supplierCode',
      'sku',
      'cost',
      'costValidFrom',
      'productKey',
      'notes',
      'archivedAt',
    ]);
  });

  it.each(fieldTypeCases)('should type %s as %s', (name, type) => {
    expect(objectField(supplierProduct, name)?.type).toBe(type);
  });

  it('should make supplierCode and sku searchable', () => {
    expect(objectField(supplierProduct, 'supplierCode')?.isSearchable).toBe(true);
    expect(objectField(supplierProduct, 'sku')?.isSearchable).toBe(true);
  });

  it('should make productKey nullable and the one unique field', () => {
    expect(objectField(supplierProduct, 'productKey')?.isNullable).toBe(true);
    expect(fields(supplierProduct).filter((entry) => entry.isUnique).map((entry) => entry.name)).toEqual(
      ['productKey'],
    );
  });

  it('should carry no source field: a row is found by productKey, not a source marker', () => {
    expect(fieldNames(supplierProduct).includes('source')).toBe(false);
  });

  it('should leave archivedAt empty until a product goes out of use', () => {
    expect(objectField(supplierProduct, 'archivedAt')?.isNullable).toBe(true);
  });
});

// defineField returns a union over every field type; only a relation field has these properties.
type Relation = {
  config: {
    universalSettings?: { relationType?: unknown } | null;
    relationTargetObjectMetadataUniversalIdentifier?: string;
    relationTargetFieldMetadataUniversalIdentifier?: string;
  };
};
const relation = (field: unknown) => field as Relation;

describe('products module relations', () => {
  it('should hang products on the core supplier, each side naming the other', () => {
    expect(supplierOnSupplierProduct.errors).toEqual([]);
    expect(productsRecordsOnSupplier.errors).toEqual([]);
    expect(supplierOnSupplierProduct.config.name).toBe('supplier');
    expect(supplierOnSupplierProduct.config.objectUniversalIdentifier).toBe(
      SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(relation(supplierOnSupplierProduct).config.universalSettings?.relationType).toBe(
      RelationType.MANY_TO_ONE,
    );
    expect(
      relation(supplierOnSupplierProduct).config.relationTargetObjectMetadataUniversalIdentifier,
    ).toBe(SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER);
    expect(
      relation(supplierOnSupplierProduct).config.relationTargetFieldMetadataUniversalIdentifier,
    ).toBe(SUPPLIER_PRODUCTS_RECORDS_FIELD_UNIVERSAL_IDENTIFIER);
    expect(productsRecordsOnSupplier.config.name).toBe('productsRecords');
    expect(productsRecordsOnSupplier.config.objectUniversalIdentifier).toBe(
      SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(relation(productsRecordsOnSupplier).config.universalSettings?.relationType).toBe(
      RelationType.ONE_TO_MANY,
    );
    expect(
      relation(productsRecordsOnSupplier).config.relationTargetObjectMetadataUniversalIdentifier,
    ).toBe(SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER);
    expect(
      relation(productsRecordsOnSupplier).config.relationTargetFieldMetadataUniversalIdentifier,
    ).toBe(SUPPLIER_PRODUCT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER);
  });
});

// Only what these tests read. The SDK types both lists as optional and the operand as a wider union.
type ViewDefinition = {
  config: {
    fields?: readonly { fieldMetadataUniversalIdentifier: string }[];
    filters?: readonly {
      fieldMetadataUniversalIdentifier: string;
      operand?: unknown;
      subFieldName?: string;
    }[];
  };
};
const columns = (view: ViewDefinition) =>
  (view.config.fields ?? []).map((entry) => entry.fieldMetadataUniversalIdentifier);
const filters = (view: ViewDefinition) =>
  (view.config.filters ?? []).map((entry) => [entry.fieldMetadataUniversalIdentifier, entry.operand]);
const viewFilter = (view: ViewDefinition, id: string) =>
  (view.config.filters ?? []).find((entry) => entry.fieldMetadataUniversalIdentifier === id);

const productNameFieldMetadataUniversalIdentifier = getFieldUniversalIdentifier({
  applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  name: 'name',
});

describe('products views on the supplierProduct object', () => {
  it('should define the four views without errors on the supplierProduct object', () => {
    for (const view of [
      supplierProductsView,
      productsWithoutACost,
      productsWithoutAKey,
      archivedSupplierProducts,
    ]) {
      expect(view.errors).toEqual([]);
      expect(view.config.objectUniversalIdentifier).toBe(SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER);
    }
  });

  it('should show the in-use products', () => {
    expect(supplierProductsView.config.name).toBe('Supplier products');
    expect(columns(supplierProductsView)).toEqual([
      productNameFieldMetadataUniversalIdentifier,
      SUPPLIER_PRODUCT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_SUPPLIER_CODE_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_SKU_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_COST_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_COST_VALID_FROM_FIELD_UNIVERSAL_IDENTIFIER,
    ]);
    expect(filters(supplierProductsView)).toEqual([
      [SUPPLIER_PRODUCT_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER, ViewFilterOperand.IS_EMPTY],
    ]);
  });

  it('should show the in-use products without a cost', () => {
    expect(productsWithoutACost.config.name).toBe('Products without a cost');
    expect(columns(productsWithoutACost)).toEqual([
      productNameFieldMetadataUniversalIdentifier,
      SUPPLIER_PRODUCT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_SUPPLIER_CODE_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_SKU_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_COST_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_COST_VALID_FROM_FIELD_UNIVERSAL_IDENTIFIER,
    ]);
    expect(filters(productsWithoutACost)).toEqual([
      [SUPPLIER_PRODUCT_COST_FIELD_UNIVERSAL_IDENTIFIER, ViewFilterOperand.IS_EMPTY],
      [SUPPLIER_PRODUCT_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER, ViewFilterOperand.IS_EMPTY],
    ]);
    expect(
      viewFilter(productsWithoutACost, SUPPLIER_PRODUCT_COST_FIELD_UNIVERSAL_IDENTIFIER)?.subFieldName,
    ).toBe('amountMicros');
  });

  it('should show the in-use products without a key', () => {
    expect(productsWithoutAKey.config.name).toBe('Products without a key');
    expect(columns(productsWithoutAKey)).toEqual([
      productNameFieldMetadataUniversalIdentifier,
      SUPPLIER_PRODUCT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_SUPPLIER_CODE_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_SKU_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_COST_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_COST_VALID_FROM_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_PRODUCT_KEY_FIELD_UNIVERSAL_IDENTIFIER,
    ]);
    expect(filters(productsWithoutAKey)).toEqual([
      [SUPPLIER_PRODUCT_PRODUCT_KEY_FIELD_UNIVERSAL_IDENTIFIER, ViewFilterOperand.IS_EMPTY],
      [SUPPLIER_PRODUCT_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER, ViewFilterOperand.IS_EMPTY],
    ]);
  });

  it('should show the out-of-use products', () => {
    expect(archivedSupplierProducts.config.name).toBe('Archived supplier products');
    expect(columns(archivedSupplierProducts)).toEqual([
      productNameFieldMetadataUniversalIdentifier,
      SUPPLIER_PRODUCT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_SUPPLIER_CODE_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_SKU_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_PRODUCT_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
    ]);
    expect(filters(archivedSupplierProducts)).toEqual([
      [SUPPLIER_PRODUCT_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER, ViewFilterOperand.IS_NOT_EMPTY],
    ]);
  });
});

// defineNavigationMenuItem returns a config these tests read through one loose shape.
type NavigationMenuItem = {
  errors: readonly unknown[];
  config: {
    name: string;
    viewUniversalIdentifier: string;
  };
};
const readMenuItem = (item: unknown) => item as NavigationMenuItem;

describe('products navigation', () => {
  it('should open the Supplier products view', () => {
    const item = readMenuItem(supplierProductsMenuItem);
    expect(item.errors).toEqual([]);
    expect(item.config.name).toBe('supplierProducts');
    expect(item.config.viewUniversalIdentifier).toBe(SUPPLIER_PRODUCTS_VIEW_UNIVERSAL_IDENTIFIER);
  });
});
