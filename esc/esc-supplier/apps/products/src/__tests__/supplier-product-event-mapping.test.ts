import {
  chunkSupplierProductEvents,
  mapSupplierProductEvents,
  type SupplierProductChangeEvent,
} from 'src/logic-functions/supplier-product-event-mapping';
import { describe, expect, it } from 'vitest';

const recordId = '4a9241e9-37a9-4f3a-b488-2ca3846fe2fb';
const archivedAt = '2026-11-25T09:00:00.000Z';
const occurredAt = '2026-11-26T09:00:00.000Z';
const now = () => new Date(occurredAt);

describe('supplier product event mapping', () => {
  it.each([
    ['created', 'created'],
    ['deleted', 'archived'],
    ['restored', 'restored'],
    ['destroyed', 'deleted'],
  ])('maps supplierProduct.%s to %s', (name, action) => {
    expect(
      mapSupplierProductEvents(
        { name: `supplierProduct.${name}`, recordId, properties: {} },
        now,
      ),
    ).toEqual([{ object: 'supplierProduct', id: recordId, action, occurredAt }]);
  });

  it.each([
    [null, archivedAt, 'archived'],
    [archivedAt, null, 'restored'],
    [archivedAt, archivedAt, 'updated'],
    [archivedAt, occurredAt, 'updated'],
    [null, null, 'updated'],
  ])('maps archivedAt from %s to %s as %s', (before, after, action) => {
    expect(
      mapSupplierProductEvents(
        {
          name: 'supplierProduct.updated',
          recordId,
          properties: { before: { archivedAt: before }, after: { archivedAt: after } },
        },
        now,
      ),
    ).toEqual([{ object: 'supplierProduct', id: recordId, action, occurredAt }]);
  });

  it('uses the diff when snapshots omit archivedAt and treats a missing archive change as updated', () => {
    const events = mapSupplierProductEvents(
      {
        name: 'supplierProduct.updated',
        events: [
          {
            recordId,
            properties: { diff: { archivedAt: { before: null, after: archivedAt } } },
          },
          { recordId, properties: { diff: {} } },
        ],
      },
      now,
    );

    expect(events.map(({ action }) => action)).toEqual(['archived', 'updated']);
  });

  it('normalizes a record event timestamp to UTC', () => {
    expect(
      mapSupplierProductEvents(
        {
          name: 'supplierProduct.created',
          recordId,
          timestamp: '2026-11-25T10:00:00+01:00',
          properties: {},
        },
        now,
      ),
    ).toEqual([{ object: 'supplierProduct', id: recordId, action: 'created', occurredAt: archivedAt }]);
  });
});

describe('supplier product event chunks', () => {
  it.each([
    { count: 0, expectedSizes: [] },
    { count: 200, expectedSizes: [200] },
    { count: 201, expectedSizes: [200, 1] },
    { count: 401, expectedSizes: [200, 200, 1] },
  ])('chunks $count events without changing their order', ({ count, expectedSizes }) => {
    const events: SupplierProductChangeEvent[] = Array.from(
      { length: count },
      (_, index) => ({ object: 'supplierProduct', id: String(index), action: 'created', occurredAt }),
    );
    const chunks = chunkSupplierProductEvents(events);

    expect(chunks.map((chunk) => chunk.length)).toEqual(expectedSizes);
    expect(chunks.flat()).toEqual(events);
  });
});
