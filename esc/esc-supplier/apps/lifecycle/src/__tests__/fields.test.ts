import { FieldType } from 'twenty-sdk/define';

import { SUPPLIER_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/constants/core-identifiers';
import lifecycleNegotiationNotesOnSupplier from 'src/fields/lifecycle-negotiation-notes-on-supplier.field';
import lifecyclePendingDecisionOnSupplier from 'src/fields/lifecycle-pending-decision-on-supplier.field';
import lifecycleStatusOnSupplier from 'src/fields/lifecycle-status-on-supplier.field';
import lifecycleTriageDateOnSupplier from 'src/fields/lifecycle-triage-date-on-supplier.field';
import lifecycleTriageFitSignalOnSupplier from 'src/fields/lifecycle-triage-fit-signal-on-supplier.field';
import lifecycleTriageScoreOnSupplier from 'src/fields/lifecycle-triage-score-on-supplier.field';
import { describe, expect, it } from 'vitest';

// defineField returns a union over every field type. These tests read it through one loose shape.
type FieldDefinition = {
  errors: readonly unknown[];
  config: {
    name: string;
    type: string;
    label: string;
    objectUniversalIdentifier: string;
    isNullable?: boolean;
    defaultValue?: unknown;
    options?: readonly { value: string; label: string }[] | null;
  };
};
const read = (field: unknown) => field as FieldDefinition;
const status = read(lifecycleStatusOnSupplier);

const fieldCases: [string, FieldType, string, FieldDefinition][] = [
  ['lifecycleStatus', FieldType.SELECT, 'Status', read(lifecycleStatusOnSupplier)],
  ['lifecycleTriageScore', FieldType.NUMBER, 'Gap/overlap score', read(lifecycleTriageScoreOnSupplier)],
  ['lifecycleTriageFitSignal', FieldType.TEXT, 'Fit signal', read(lifecycleTriageFitSignalOnSupplier)],
  ['lifecycleTriageDate', FieldType.DATE, 'Triage date', read(lifecycleTriageDateOnSupplier)],
  [
    'lifecycleNegotiationNotes',
    FieldType.RICH_TEXT,
    'Negotiation notes',
    read(lifecycleNegotiationNotesOnSupplier),
  ],
  ['lifecyclePendingDecision', FieldType.TEXT, 'Pending decision', read(lifecyclePendingDecisionOnSupplier)],
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
    const optionValues = (status.config.options ?? []).map(
      (option) => option.value,
    );
    expect(optionValues).toEqual(['PARKED', 'ONBOARDING', 'ACTIVE', 'UNDER_REVIEW']);
  });

  it('should not offer a Historical value', () => {
    const words = (status.config.options ?? []).flatMap((option) => [
      option.value,
      option.label,
    ]);
    expect(words.some((word) => word.toUpperCase().includes('HISTORICAL'))).toBe(false);
  });

  it('should be empty until someone sets the status', () => {
    expect(status.config.isNullable).toBe(true);
    expect(status.config.defaultValue).toBeUndefined();
  });
});
