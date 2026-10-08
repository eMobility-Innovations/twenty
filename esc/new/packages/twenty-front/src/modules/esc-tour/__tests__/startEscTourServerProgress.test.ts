import {
  closeEscTour,
  ESC_TOUR_SCRIPT_VERSION,
  goToNextEscTourStep,
  openEscTour,
  resetEscTourStore,
  subscribeToEscTourProgress,
} from '@/esc-tour/hooks/useEscTourStore';
import {
  CREATE_ESC_TOUR_PROGRESS,
  type EscTourProgressGqlClient,
  type EscTourProgressRecord,
  UPDATE_ESC_TOUR_PROGRESS,
} from '@/esc-tour/progress/escTourProgressClient';
import { startEscTourServerProgress } from '@/esc-tour/progress/startEscTourServerProgress';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';

const STEPS: EscTourStep[] = [
  { id: 'one', title: 'One', body: 'b' },
  { id: 'two', title: 'Two', body: 'b' },
  { id: 'three', title: 'Three', body: 'b' },
];

const NOW = new Date('2026-10-07T12:00:00.000Z');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

type Call = {
  kind: 'query' | 'create' | 'update';
  variables: Record<string, unknown>;
};

const fakeClient = (
  existing: EscTourProgressRecord | null,
  options: { failQuery?: Error; failUpdate?: Error } = {},
) => {
  const calls: Call[] = [];
  const client: EscTourProgressGqlClient = {
    query: async ({ variables }) => {
      calls.push({ kind: 'query', variables });
      if (options.failQuery) throw options.failQuery;
      return {
        data: {
          escTourProgresses: { edges: existing ? [{ node: existing }] : [] },
        },
      };
    },
    mutate: async ({ mutation, variables }) => {
      if (mutation === CREATE_ESC_TOUR_PROGRESS) {
        calls.push({ kind: 'create', variables });
        return {
          data: {
            createEscTourProgress: {
              id: 'new-row',
              lastStepId: null,
              outcome: 'notStarted',
              scriptVersion: null,
              furthestStepIndex: null,
            },
          },
        };
      }
      expect(mutation).toBe(UPDATE_ESC_TOUR_PROGRESS);
      calls.push({ kind: 'update', variables });
      if (options.failUpdate) throw options.failUpdate;
      return { data: {} };
    },
  };

  return { client, calls };
};

const row = (patch: Partial<EscTourProgressRecord>): EscTourProgressRecord => ({
  id: 'row-1',
  lastStepId: null,
  outcome: 'notStarted',
  scriptVersion: ESC_TOUR_SCRIPT_VERSION,
  furthestStepIndex: 0,
  ...patch,
});

const start = (client: EscTourProgressGqlClient, warn = jest.fn()) => ({
  stop: startEscTourServerProgress({
    client,
    workspaceMemberId: 'member-1',
    displayName: 'Sam Agent',
    now: () => NOW,
    warn,
  }),
  warn,
});

describe('startEscTourServerProgress', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetEscTourStore();
  });

  it('looks the person up by workspace member id', async () => {
    const { client, calls } = fakeClient(row({}));

    start(client);
    await flush();

    expect(calls[0]).toEqual({
      kind: 'query',
      variables: { filter: { workspaceMemberId: { eq: 'member-1' } } },
    });
  });

  it('creates a notStarted row on first load when the person has none', async () => {
    const { client, calls } = fakeClient(null);

    start(client);
    await flush();

    expect(calls[1]).toEqual({
      kind: 'create',
      variables: {
        input: {
          name: 'Sam Agent',
          workspaceMemberId: 'member-1',
          outcome: 'notStarted',
        },
      },
    });
  });

  it('does not create a row when one exists', async () => {
    const { client, calls } = fakeClient(row({}));

    start(client);
    await flush();

    expect(calls.map((call) => call.kind)).toEqual(['query']);
  });

  it('resumes an unfinished run of the same script from the server', async () => {
    const { client } = fakeClient(
      row({ outcome: 'inProgress', lastStepId: 'two' }),
    );
    const opened: string[] = [];

    subscribeToEscTourProgress((event) => opened.push(event.stepId));
    start(client);
    await flush();
    openEscTour(STEPS);

    expect(opened[0]).toBe('two');
  });

  it.each([
    ['a completed run', row({ outcome: 'completed', lastStepId: 'two' })],
    ['a dismissed run', row({ outcome: 'dismissed', lastStepId: 'two' })],
    [
      'a run of an older script',
      row({ outcome: 'inProgress', lastStepId: 'two', scriptVersion: -1 }),
    ],
  ])('does not resume %s', async (_label, existing) => {
    const { client } = fakeClient(existing);
    const opened: string[] = [];

    subscribeToEscTourProgress((event) => opened.push(event.stepId));
    start(client);
    await flush();
    openEscTour(STEPS);

    expect(opened[0]).toBe('one');
  });

  it('writes each event to the row, in order', async () => {
    const { client, calls } = fakeClient(row({}));

    start(client);
    await flush();
    openEscTour(STEPS);
    goToNextEscTourStep();
    goToNextEscTourStep();
    goToNextEscTourStep();
    await flush();

    const updates = calls.filter((call) => call.kind === 'update');

    expect(
      updates.map((call) => (call.variables.input as any).outcome),
    ).toEqual(['inProgress', 'inProgress', 'inProgress', 'completed']);
    expect(updates[3].variables).toEqual({
      idToUpdate: 'row-1',
      input: {
        lastStepId: 'three',
        lastStepIndex: 2,
        furthestStepIndex: 2,
        totalSteps: 3,
        scriptVersion: ESC_TOUR_SCRIPT_VERSION,
        outcome: 'completed',
        completedAt: NOW.toISOString(),
      },
    });
  });

  it('queues events that arrive before the first load finishes', async () => {
    const { client, calls } = fakeClient(null);

    start(client);
    openEscTour(STEPS);
    await flush();

    expect(calls.map((call) => call.kind)).toEqual([
      'query',
      'create',
      'update',
    ]);
    expect(calls[2].variables.idToUpdate).toBe('new-row');
  });

  it('never lowers furthestStepIndex when the reader goes back and closes', async () => {
    const { client, calls } = fakeClient(row({ furthestStepIndex: 1 }));

    start(client);
    await flush();
    openEscTour(STEPS);
    closeEscTour();
    await flush();

    const last = calls.filter((call) => call.kind === 'update').pop();

    expect(last?.variables.input).toEqual(
      expect.objectContaining({
        outcome: 'dismissed',
        lastStepIndex: 0,
        furthestStepIndex: 1,
      }),
    );
  });

  it('turns itself off with ONE warning when the object is not provisioned', async () => {
    const { client, calls } = fakeClient(null, {
      failQuery: new Error('Cannot query field "escTourProgresses"'),
    });
    const { warn } = start(client);

    await flush();
    openEscTour(STEPS);
    goToNextEscTourStep();
    await flush();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('saved progress is off');
    expect(calls.filter((call) => call.kind !== 'query')).toEqual([]);
  });

  it('a failing write never stops the tour and warns once', async () => {
    const { client } = fakeClient(row({}), { failUpdate: new Error('403') });
    const { warn } = start(client);

    await flush();
    openEscTour(STEPS);
    goToNextEscTourStep();
    goToNextEscTourStep();
    await flush();

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('stops writing once stopped', async () => {
    const { client, calls } = fakeClient(row({}));
    const { stop } = start(client);

    await flush();
    stop();
    openEscTour(STEPS);
    await flush();

    expect(calls.filter((call) => call.kind === 'update')).toEqual([]);
  });
});
