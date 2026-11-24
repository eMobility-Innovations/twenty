import supplier, { SupplierLanguage, SupplierType } from 'src/objects/supplier.object';
import { describe, expect, it } from 'vitest';

const field = (name: string) => supplier.config.fields?.find((f) => f.name === name);
const optionValues = (name: string) =>
  ((field(name) as { options?: { value: string }[] })?.options ?? []).map((o) => o.value);

describe('supplier object', () => {
  it('should pass the SDK validation', () => {
    expect(supplier.errors).toEqual([]);
    expect(supplier.warnings).toEqual([]);
  });

  it('should keep the names every module relates to', () => {
    expect(supplier.config.nameSingular).toBe('supplier');
    expect(supplier.config.namePlural).toBe('suppliers');
  });

  it('should offer supplier, forwarder and courier as types', () => {
    expect(optionValues('supplierType')).toEqual(Object.values(SupplierType));
    expect(field('supplierType')?.defaultValue).toBe("'SUPPLIER'");
  });

  it('should offer English and Chinese as languages', () => {
    expect(optionValues('language')).toEqual(Object.values(SupplierLanguage));
  });

  it('should keep the Credit Tracker id optional', () => {
    expect(field('creditTrackerId')?.isNullable).toBe(true);
  });

  it('should keep both archive fields optional', () => {
    expect(field('archivedAt')).toMatchObject({ isNullable: true, defaultValue: null });
    expect(field('archivedReason')).toMatchObject({ isNullable: true });
  });
});
