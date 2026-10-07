import { gql } from '@apollo/client';

import { type EscTourProgressEvent } from '@/esc-tour/hooks/useEscTourStore';

/**
 * Per-person tour progress, stored as a Twenty CUSTOM OBJECT (RM #22314).
 *
 * WHY A CUSTOM OBJECT AND NOT A TABLE
 *
 * The 2026-09-22 decision (RM #19873, journal 36187) dropped `core."escOnboarding"`: a fork
 * TypeORM migration never runs on an existing instance — the image entrypoint migrates only
 * when the `core` schema is absent — and shipping one needs a server rebuild, the path that
 * took the CRM down for 16h41m. A custom object is DATA: it is created through the metadata
 * API (`esc/deploy/provision-esc-tour-progress.sh`), lives in the workspace schema Twenty
 * already manages, and is read and written through the GraphQL API the workspace generates
 * for it. No table of ours, no migration, no server recompile; delivery stays the front-only
 * image layer.
 *
 * The operation shapes are upstream's own, not guessed: `create<X>(data:)` and
 * `update<X>(id:, data:)` (packages/twenty-front/src/modules/object-record/utils/
 * getCreateOneRecordMutationResponseField.ts, getUpdateOneRecordMutationResponseField.ts,
 * and the fixtures in object-record/hooks/__mocks__/useCreateOneRecord.ts,
 * useUpdateOneRecord.ts), and the plural query returns `edges { node }`.
 */
export const ESC_TOUR_PROGRESS_OBJECT = {
  nameSingular: 'escTourProgress',
  namePlural: 'escTourProgresses',
} as const;

/**
 * `notStarted` is written on the first load after this ships, before the person has ever
 * pressed Tour. It is what lets the report answer "who has never opened it", which a row
 * created only on first open could never say.
 */
export type EscTourProgressOutcome =
  'notStarted' | 'inProgress' | 'completed' | 'dismissed';

export type EscTourProgressRecord = {
  id: string;
  lastStepId: string | null;
  outcome: EscTourProgressOutcome;
  scriptVersion: number | null;
  furthestStepIndex: number | null;
};

/** The two calls this module makes. An `ApolloClient` satisfies it; so does a test fake. */
export type EscTourProgressGqlClient = {
  query: (options: {
    query: unknown;
    variables: Record<string, unknown>;
    fetchPolicy: 'network-only';
  }) => Promise<{ data?: unknown }>;
  mutate: (options: {
    mutation: unknown;
    variables: Record<string, unknown>;
  }) => Promise<{ data?: unknown }>;
};

const RECORD_FIELDS = 'id lastStepId outcome scriptVersion furthestStepIndex';

export const FIND_ESC_TOUR_PROGRESS = gql`
  query FindEscTourProgress($filter: EscTourProgressFilterInput) {
    escTourProgresses(filter: $filter, first: 1) {
      edges { node { ${RECORD_FIELDS} } }
    }
  }
`;

export const CREATE_ESC_TOUR_PROGRESS = gql`
  mutation CreateOneEscTourProgress($input: EscTourProgressCreateInput!) {
    createEscTourProgress(data: $input) { ${RECORD_FIELDS} }
  }
`;

export const UPDATE_ESC_TOUR_PROGRESS = gql`
  mutation UpdateOneEscTourProgress(
    $idToUpdate: UUID!
    $input: EscTourProgressUpdateInput!
  ) {
    updateEscTourProgress(id: $idToUpdate, data: $input) { ${RECORD_FIELDS} }
  }
`;

type FindResult = {
  escTourProgresses?: { edges?: { node: EscTourProgressRecord }[] };
};

export const loadEscTourProgress = async (
  client: EscTourProgressGqlClient,
  workspaceMemberId: string,
): Promise<EscTourProgressRecord | null> => {
  const { data } = await client.query({
    query: FIND_ESC_TOUR_PROGRESS,
    variables: { filter: { workspaceMemberId: { eq: workspaceMemberId } } },
    fetchPolicy: 'network-only',
  });

  return (data as FindResult)?.escTourProgresses?.edges?.[0]?.node ?? null;
};

export const createEscTourProgress = async (
  client: EscTourProgressGqlClient,
  workspaceMemberId: string,
  name: string,
): Promise<EscTourProgressRecord> => {
  const { data } = await client.mutate({
    mutation: CREATE_ESC_TOUR_PROGRESS,
    variables: {
      input: { name, workspaceMemberId, outcome: 'notStarted' },
    },
  });

  const created = (data as { createEscTourProgress?: EscTourProgressRecord })
    ?.createEscTourProgress;

  if (created === undefined) {
    throw new Error('createEscTourProgress returned no record');
  }

  return created;
};

const OUTCOME_BY_EVENT: Record<
  EscTourProgressEvent['kind'],
  EscTourProgressOutcome
> = {
  opened: 'inProgress',
  advanced: 'inProgress',
  completed: 'completed',
  dismissed: 'dismissed',
};

/**
 * The fields one event writes. `furthestStepIndex` only ever grows, so Back and Start over
 * never make somebody look as if they gave up earlier than they did — the drop-out report
 * (#22316) is read off it.
 */
export const buildEscTourProgressUpdate = (
  event: EscTourProgressEvent,
  furthestStepIndex: number,
  now: Date,
): Record<string, unknown> => ({
  lastStepId: event.stepId,
  lastStepIndex: event.stepIndex,
  furthestStepIndex: Math.max(furthestStepIndex, event.stepIndex),
  totalSteps: event.totalSteps,
  scriptVersion: event.scriptVersion,
  outcome: OUTCOME_BY_EVENT[event.kind],
  ...(event.kind === 'completed' ? { completedAt: now.toISOString() } : {}),
});

export const updateEscTourProgress = async (
  client: EscTourProgressGqlClient,
  id: string,
  input: Record<string, unknown>,
): Promise<void> => {
  await client.mutate({
    mutation: UPDATE_ESC_TOUR_PROGRESS,
    variables: { idToUpdate: id, input },
  });
};

/**
 * Where a person should resume, from what the server holds. Only an unfinished run of the
 * SAME script resumes: a finished or abandoned one starts fresh, and a position from an
 * older script may name a step that means something else now.
 */
export const escTourResumeStepIdFrom = (
  record: EscTourProgressRecord | null,
  scriptVersion: number,
): string | null =>
  record !== null &&
  record.outcome === 'inProgress' &&
  record.scriptVersion === scriptVersion
    ? record.lastStepId
    : null;
