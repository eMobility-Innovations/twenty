import { defineLogicFunction } from 'twenty-sdk/define';
import { RetryableLogicFunctionError } from 'twenty-sdk/logic-function';

import {
  NOTIFY_VOLKANOS_SUPPLIER_PRODUCT_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import {
  chunkSupplierProductEvents,
  mapSupplierProductEvents,
  type SupplierProductChangeEvent,
  type SupplierProductEventPayload,
} from './supplier-product-event-mapping';

const getEndpoint = (baseUrl: string | undefined) => {
  const url = URL.parse(baseUrl?.trim() ?? '');

  if (url?.protocol !== 'https:' || url.username || url.password) return undefined;

  return new URL('/api/integrator/v1/supplier-crm/changes/', url);
};

const postChanges = async (endpoint: URL, apiKey: string, events: SupplierProductChangeEvent[]) => {
  let status: number | undefined;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({ events }),
      redirect: 'manual',
    });
    if (response.ok) return;
    status = response.status;
  } catch {
    // Fetch errors have no response status. Keep request details out of the logs.
  }

  console.error('Volkanos supplier product notification failed', {
    ids: events.map(({ id }) => id),
    status: status ?? 'unavailable',
  });
  throw new RetryableLogicFunctionError(
    `Volkanos notification failed (HTTP status ${status ?? 'unavailable'})`,
  );
};

const handler = async (payload: SupplierProductEventPayload) => {
  const events = mapSupplierProductEvents(payload, () => new Date());
  if (!events.length) return;

  const endpoint = getEndpoint(process.env.VOLKANOS_BASE_URL);
  const apiKey = process.env.VOLKANOS_API_KEY?.trim();

  if (!endpoint || !apiKey) {
    console.warn('Volkanos notification skipped. Set VOLKANOS_BASE_URL (HTTPS) and VOLKANOS_API_KEY.', {
      ids: events.map(({ id }) => id),
    });
    return;
  }

  for (const chunk of chunkSupplierProductEvents(events)) {
    await postChanges(endpoint, apiKey, chunk);
  }
};

export default defineLogicFunction({
  universalIdentifier: NOTIFY_VOLKANOS_SUPPLIER_PRODUCT_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'notify-volkanos-supplier-product',
  handler,
  eventTriggerSettings: {
    on: 'recordEvent',
    objectUniversalIdentifier: SUPPLIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
    action: '*',
    batchMode: true,
  },
});
