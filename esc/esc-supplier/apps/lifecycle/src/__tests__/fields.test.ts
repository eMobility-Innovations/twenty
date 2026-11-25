import { FieldType } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import lifecycleNegotiationNotesOnSupplier from 'src/fields/lifecycle-negotiation-notes-on-supplier.field';
import lifecyclePendingDecisionOnSupplier from 'src/fields/lifecycle-pending-decision-on-supplier.field';
import lifecycleStatusOnSupplier from 'src/fields/lifecycle-status-on-supplier.field';
import lifecycleTriageDateOnSupplier from 'src/fields/lifecycle-triage-date-on-supplier.field';
import lifecycleTriageFitSignalOnSupplier from 'src/fields/lifecycle-triage-fit-signal-on-supplier.field';
import lifecycleTriageScoreOnSupplier from 'src/fields/lifecycle-triage-score-on-supplier.field';
import { describe, expect, it } from 'vitest';

type FieldDefinition = {
  errors: string[];
  config: {
    name: string;
    type: FieldType;
    label: string;
    objectUniversalIdentifier: string;
    isNullable: boolean;
    defaultValue?: unknown;
    options?: { value: string; label: string }[];
  };
};

const fieldCases: [string, FieldType, string, FieldDefinition][] = [
  ['lifecycleStatus', FieldType.SELECT, 'Status', lifecycleStatusOnSupplier],
  ['lifecycleTriageScore', FieldType.NUMBER, 'Gap/overlap score', lifecycleTriageScoreOnSupplier],
  ['lifecycleTriageFitSignal', FieldType.TEXT, 'Fit signal', lifecycleTriageFitSignalOnSupplier],
  ['lifecycleTriageDate', FieldType.DATE, 'Triage date', lifecycleTriageDateOnSupplier],
  [
    'lifecycleNegotiationNotes',
    FieldType.RICH_TEXT,
    'Negotiation notes',
    lifecycleNegotiationNotesOnSupplier,
  ],
  ['lifecyclePendingDecision', FieldType.TEXT, 'Pending decision', lifecyclePendingDecisionOnSupplier],
];

describe('lifecycle fields on the core supplier', () => {
  it.each(fieldCases)(
    'should define %s on the supplier object',
    (name, type, label, field) => {
      expect(field.errors).toEqual([]);
      expect(field.config.name).toBe(name);
      expect(field.config.type).toBe(type);
      expect(field.config.label).toBe(label);
      expect(field.config.objectUniversalIdentifier).toBe(
        SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER,
      );
    },
  );

  it('should offer exactly the four lifecycle statuses, in order', () => {
    const optionValues = (lifecycleStatusOnSupplier.config.options ?? []).map(
      (option) => option.value,
    );
    expect(optionValues).toEqual(['PARKED', 'ONBOARDING', 'ACTIVE', 'UNDER_REVIEW']);
  });

  it('should not offer a Historical value', () => {
    const words = (lifecycleStatusOnSupplier.config.options ?? []).flatMap((option) => [
      option.value,
      option.label,
    ]);
    expect(words.some((word) => word.toUpperCase().includes('HISTORICAL'))).toBe(false);
  });

  it('should be empty until someone sets the status', () => {
    const status = lifecycleStatusOnSupplier.config;
    expect(status.isNullable).toBe(true);
    expect(status.defaultValue).toBeUndefined();
  });
});
