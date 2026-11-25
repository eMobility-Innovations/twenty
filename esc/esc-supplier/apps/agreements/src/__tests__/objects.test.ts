import { RelationType } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import {
  SUPPLIER_AGREEMENT_COMMITMENT_AGREEMENT_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENT_COMMITMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENT_COMMITMENTS_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
  SUPPLIER_AGREEMENTS_RECORDS_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import agreementsRecordsOnSupplier from 'src/fields/agreements-records-on-supplier.field';
import agreementOnSupplierAgreementCommitment from 'src/fields/agreement-on-supplier-agreement-commitment.field';
import commitmentsOnSupplierAgreement from 'src/fields/commitments-on-supplier-agreement.field';
import supplierOnSupplierAgreement from 'src/fields/supplier-on-supplier-agreement.field';
import commitment, { SupplierAgreementCommitmentKind } from 'src/objects/supplier-agreement-commitment.object';
import agreement, { SupplierAgreementType } from 'src/objects/supplier-agreement.object';
import { describe, expect, it } from 'vitest';

type Field = { name: string; isNullable?: boolean; options?: { value: string }[] | null };
const fields = (object: { config: { fields?: readonly unknown[] } }) =>
  (object.config.fields ?? []) as Field[];
const fieldNames = (object: { config: { fields?: readonly unknown[] } }) =>
  fields(object).map((f) => f.name);
const field = (object: { config: { fields?: readonly unknown[] } }, name: string) =>
  fields(object).find((f) => f.name === name);
const optionValues = (
  object: { config: { fields?: readonly unknown[] } },
  name: string,
) => field(object, name)?.options?.map((o) => o.value) ?? [];

describe('agreements module objects', () => {
  it.each([
    ['supplierAgreement', 'supplierAgreements', 'Agreement', 'Agreements', agreement],
    ['supplierAgreementCommitment', 'supplierAgreementCommitments', 'Commitment', 'Commitments', commitment],
  ])('should define %s without errors', (singular, plural, labelSingular, labelPlural, object) => {
    expect(object.errors).toEqual([]);
    expect(object.warnings).toEqual([]);
    expect(object.config.nameSingular).toBe(singular);
    expect(object.config.namePlural).toBe(plural);
    expect(object.config.labelSingular).toBe(labelSingular);
    expect(object.config.labelPlural).toBe(labelPlural);
  });

  it('should offer the agreement types the logic reads, in order', () => {
    expect(optionValues(agreement, 'agreementType')).toEqual(Object.values(SupplierAgreementType));
  });

  it('should offer the commitment kinds the logic reads, in order', () => {
    expect(optionValues(commitment, 'kind')).toEqual(
      Object.values(SupplierAgreementCommitmentKind),
    );
  });

  it('should define exactly these fields on each object', () => {
    expect(fieldNames(agreement)).toEqual([
      'agreementType',
      'startDate',
      'endDate',
      'warrantyResponseDays',
      'warrantyLabourPaidBy',
      'warrantyReplacementTerms',
      'performanceReviewedOn',
      'agreementReviewedOn',
      'notes',
      'archivedAt',
    ]);
    expect(fieldNames(commitment)).toEqual([
      'kind',
      'startDate',
      'dueDate',
      'targetUnits',
      'amount',
      'details',
      'completedAt',
      'archivedAt',
    ]);
  });

  it('should carry no payment or credit field: those live on the supplier', () => {
    for (const object of [agreement, commitment]) {
      expect(fieldNames(object).filter((name) => /payment|credit/i.test(name))).toEqual([]);
    }
  });

  it('should archive both objects instead of deleting them', () => {
    for (const object of [agreement, commitment]) {
      expect(field(object, 'archivedAt')?.isNullable).toBe(true);
    }
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

describe('agreements module relations', () => {
  it('should hang agreements on the core supplier, each side naming the other', () => {
    expect(supplierOnSupplierAgreement.errors).toEqual([]);
    expect(agreementsRecordsOnSupplier.errors).toEqual([]);
    expect(supplierOnSupplierAgreement.config.name).toBe('supplier');
    expect(supplierOnSupplierAgreement.config.objectUniversalIdentifier).toBe(
      SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(relation(supplierOnSupplierAgreement).config.universalSettings?.relationType).toBe(
      RelationType.MANY_TO_ONE,
    );
    expect(relation(supplierOnSupplierAgreement).config.relationTargetObjectMetadataUniversalIdentifier).toBe(
      SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(relation(supplierOnSupplierAgreement).config.relationTargetFieldMetadataUniversalIdentifier).toBe(
      SUPPLIER_AGREEMENTS_RECORDS_FIELD_UNIVERSAL_IDENTIFIER,
    );
    expect(agreementsRecordsOnSupplier.config.name).toBe('agreementsRecords');
    expect(agreementsRecordsOnSupplier.config.objectUniversalIdentifier).toBe(
      SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(relation(agreementsRecordsOnSupplier).config.universalSettings?.relationType).toBe(
      RelationType.ONE_TO_MANY,
    );
    expect(relation(agreementsRecordsOnSupplier).config.relationTargetObjectMetadataUniversalIdentifier).toBe(
      SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(relation(agreementsRecordsOnSupplier).config.relationTargetFieldMetadataUniversalIdentifier).toBe(
      SUPPLIER_AGREEMENT_SUPPLIER_FIELD_UNIVERSAL_IDENTIFIER,
    );
  });

  it('should hang commitments on the agreement, each side naming the other', () => {
    expect(agreementOnSupplierAgreementCommitment.errors).toEqual([]);
    expect(commitmentsOnSupplierAgreement.errors).toEqual([]);
    expect(agreementOnSupplierAgreementCommitment.config.name).toBe('agreement');
    expect(agreementOnSupplierAgreementCommitment.config.objectUniversalIdentifier).toBe(
      SUPPLIER_AGREEMENT_COMMITMENT_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(relation(agreementOnSupplierAgreementCommitment).config.universalSettings?.relationType).toBe(
      RelationType.MANY_TO_ONE,
    );
    expect(
      relation(agreementOnSupplierAgreementCommitment).config.relationTargetObjectMetadataUniversalIdentifier,
    ).toBe(SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER);
    expect(
      relation(agreementOnSupplierAgreementCommitment).config.relationTargetFieldMetadataUniversalIdentifier,
    ).toBe(SUPPLIER_AGREEMENT_COMMITMENTS_FIELD_UNIVERSAL_IDENTIFIER);
    expect(commitmentsOnSupplierAgreement.config.name).toBe('commitments');
    expect(commitmentsOnSupplierAgreement.config.objectUniversalIdentifier).toBe(
      SUPPLIER_AGREEMENT_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(relation(commitmentsOnSupplierAgreement).config.universalSettings?.relationType).toBe(
      RelationType.ONE_TO_MANY,
    );
    expect(
      relation(commitmentsOnSupplierAgreement).config.relationTargetObjectMetadataUniversalIdentifier,
    ).toBe(SUPPLIER_AGREEMENT_COMMITMENT_OBJECT_UNIVERSAL_IDENTIFIER);
    expect(relation(commitmentsOnSupplierAgreement).config.relationTargetFieldMetadataUniversalIdentifier).toBe(
      SUPPLIER_AGREEMENT_COMMITMENT_AGREEMENT_FIELD_UNIVERSAL_IDENTIFIER,
    );
  });
});
