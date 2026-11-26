const MAX_EVENTS_PER_REQUEST = 200;

type SupplierProductSnapshot = { archivedAt?: string | null };

type SupplierProductRecordEvent = {
  recordId: string;
  timestamp?: string;
  properties: {
    before?: SupplierProductSnapshot;
    after?: SupplierProductSnapshot;
    diff?: {
      archivedAt?: {
        before: SupplierProductSnapshot['archivedAt'];
        after: SupplierProductSnapshot['archivedAt'];
      };
    };
  };
};

export type SupplierProductEventPayload = { name: string; timestamp?: string } & (
  | SupplierProductRecordEvent
  | { events: readonly SupplierProductRecordEvent[] }
);

export type SupplierProductChangeEvent = {
  object: 'supplierProduct';
  id: string;
  action: 'created' | 'updated' | 'archived' | 'restored' | 'deleted';
  occurredAt: string;
};

const mapUpdate = ({
  before,
  after,
  diff,
}: SupplierProductRecordEvent['properties']): SupplierProductChangeEvent['action'] => {
  const change = diff?.archivedAt;

  if (!change && (!before || !after)) return 'updated';

  const wasArchived = Boolean(change ? change.before : before?.archivedAt);
  const isArchived = Boolean(change ? change.after : after?.archivedAt);

  if (!wasArchived && isArchived) return 'archived';
  if (wasArchived && !isArchived) return 'restored';

  return 'updated';
};

const getAction = (
  name: string,
  properties: SupplierProductRecordEvent['properties'],
): SupplierProductChangeEvent['action'] | undefined => {
  switch (name) {
    case 'supplierProduct.created':
      return 'created';
    case 'supplierProduct.updated':
      return mapUpdate(properties);
    case 'supplierProduct.deleted':
      return 'archived';
    case 'supplierProduct.restored':
      return 'restored';
    case 'supplierProduct.destroyed':
      return 'deleted';
    default:
      return undefined;
  }
};

const toIsoTimestamp = (timestamp: string | undefined, now: () => Date): string => {
  const time = timestamp ? Date.parse(timestamp) : NaN;

  return Number.isNaN(time) ? now().toISOString() : new Date(time).toISOString();
};

export const mapSupplierProductEvents = (
  payload: SupplierProductEventPayload,
  now: () => Date,
): SupplierProductChangeEvent[] => {
  const records = 'events' in payload ? payload.events : [payload];

  return records.flatMap((record): SupplierProductChangeEvent[] => {
    const action = getAction(payload.name, record.properties);
    if (!action) return [];

    return [
      {
        object: 'supplierProduct',
        id: record.recordId,
        action,
        occurredAt: toIsoTimestamp(record.timestamp ?? payload.timestamp, now),
      },
    ];
  });
};

export const chunkSupplierProductEvents = (
  events: readonly SupplierProductChangeEvent[],
): SupplierProductChangeEvent[][] => {
  const chunks: SupplierProductChangeEvent[][] = [];

  for (let start = 0; start < events.length; start += MAX_EVENTS_PER_REQUEST) {
    chunks.push(events.slice(start, start + MAX_EVENTS_PER_REQUEST));
  }

  return chunks;
};
