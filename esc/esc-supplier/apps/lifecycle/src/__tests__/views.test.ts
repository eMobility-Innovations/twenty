import { getFieldUniversalIdentifier, ViewFilterOperand } from 'twenty-sdk/define';

import {
  CORE_APPLICATION_UNIVERSAL_IDENTIFIER,
  SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_ARCHIVED_REASON_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/core-identifiers';
import historicalSuppliers from 'src/views/historical-suppliers.view';
import parkedSuppliersTriage from 'src/views/parked-suppliers-triage.view';
import suppliersByStatus from 'src/views/suppliers-by-status.view';
import {
  SUPPLIER_LIFECYCLE_PENDING_DECISION_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_TRIAGE_DATE_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_TRIAGE_FIT_SIGNAL_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_LIFECYCLE_TRIAGE_SCORE_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import { describe, expect, it } from 'vitest';

type ViewDefinition = {
  errors: string[];
  config: {
    name: string;
    objectUniversalIdentifier: string;
    fields: { fieldMetadataUniversalIdentifier: string }[];
    filters: { fieldMetadataUniversalIdentifier: string; operand: ViewFilterOperand }[];
  };
};

const columns = (view: ViewDefinition) =>
  view.config.fields.map((field) => field.fieldMetadataUniversalIdentifier);
const filters = (view: ViewDefinition) =>
  view.config.filters.map((filter) => [
    filter.fieldMetadataUniversalIdentifier,
    filter.operand,
  ]);

const coreNameFieldMetadataUniversalIdentifier = getFieldUniversalIdentifier({
  applicationUniversalIdentifier: CORE_APPLICATION_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
  name: 'name',
});

describe('lifecycle views on the core supplier', () => {
  it('should define the three views without errors on the supplier object', () => {
    for (const view of [suppliersByStatus, parkedSuppliersTriage, historicalSuppliers]) {
      expect(view.errors).toEqual([]);
      expect(view.config.objectUniversalIdentifier).toBe(
        SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
      );
    }
  });

  it('should show suppliers by status, excluding historical ones', () => {
    expect(suppliersByStatus.config.name).toBe('Suppliers by status');
    expect(columns(suppliersByStatus)).toEqual([
      coreNameFieldMetadataUniversalIdentifier,
      SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_LIFECYCLE_TRIAGE_DATE_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_LIFECYCLE_PENDING_DECISION_FIELD_UNIVERSAL_IDENTIFIER,
    ]);
    expect(filters(suppliersByStatus)).toEqual([
      [SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER, ViewFilterOperand.IS_EMPTY],
    ]);
  });

  it('should show parked suppliers for triage', () => {
    expect(parkedSuppliersTriage.config.name).toBe('Parked suppliers (triage)');
    expect(columns(parkedSuppliersTriage)).toEqual([
      coreNameFieldMetadataUniversalIdentifier,
      SUPPLIER_LIFECYCLE_TRIAGE_SCORE_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_LIFECYCLE_TRIAGE_FIT_SIGNAL_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_LIFECYCLE_TRIAGE_DATE_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_LIFECYCLE_PENDING_DECISION_FIELD_UNIVERSAL_IDENTIFIER,
    ]);
    expect(filters(parkedSuppliersTriage)).toEqual([
      [SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER, ViewFilterOperand.IS_EMPTY],
      [SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER, ViewFilterOperand.IS],
    ]);
  });

  it('should show historical suppliers', () => {
    expect(historicalSuppliers.config.name).toBe('Historical suppliers');
    expect(columns(historicalSuppliers)).toEqual([
      coreNameFieldMetadataUniversalIdentifier,
      SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_ARCHIVED_REASON_FIELD_UNIVERSAL_IDENTIFIER,
      SUPPLIER_LIFECYCLE_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
    ]);
    expect(filters(historicalSuppliers)).toEqual([
      [SUPPLIER_ARCHIVED_AT_FIELD_UNIVERSAL_IDENTIFIER, ViewFilterOperand.IS_NOT_EMPTY],
    ]);
  });
});
