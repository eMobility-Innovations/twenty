import { ESC_TOUR_STEPS } from '@/esc-tour/constants/escTourSteps';
import {
  closeEscTour,
  ESC_TOUR_RESUME_KEY,
  type EscTourProgressEvent,
  getEscTourSnapshot,
  goToNextEscTourStep,
  openEscTour,
  resetEscTourStore,
  skipUnreachableEscTourStep,
  subscribeToEscTourProgress,
} from '@/esc-tour/hooks/useEscTourStore';
import {
  CREATE_ESC_TOUR_PROGRESS,
  type EscTourProgressGqlClient,
  type EscTourProgressRecord,
} from '@/esc-tour/progress/escTourProgressClient';
import {
  ESC_TOUR_REPLAY_OPEN_DELAY_MS,
  startEscTourServerProgress,
} from '@/esc-tour/progress/startEscTourServerProgress';
import {
  ESC_TOUR_CHAPTER_VERSIONS,
  ESC_TOUR_LEGACY_SEEN_CHAPTERS,
} from '@/esc-tour/replay/escTourReplay';
import { resetEscTourTeam } from '@/esc-tour/team/escTourTeam';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';
import { escTourChaptersOf } from '@/esc-tour/utils/escTourChaptersOf';

const NOW = new Date('2026-10-09T09:00:00.000Z');

const CHAPTERED: EscTourStep[] = [
  { id: 'a1', title: 'A1', body: 'b', chapter: 'Where you are' },
  { id: 'a2', title: 'A2', body: 'b', chapter: 'Where you are' },
  { id: 'b1', title: 'B1', body: 'b', chapter: 'The left panel' },
];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const ORIGINAL_VERSIONS = { ...ESC_TOUR_CHAPTER_VERSIONS };

const fakeClient = (existing: EscTourProgressRecord) => {
  const updates: Record<string, unknown>[] = [];
  const client: EscTourProgressGqlClient = {
    query: async () => ({
      data: { escTourProgresses: { edges: [{ node: existing }] } },
    }),
    mutate: async ({ mutation, variables }) => {
      if (mutation === CREATE_ESC_TOUR_PROGRESS) {
        throw new Error('no create expected');
      }
      updates.push(variables.input as Record<string, unknown>);
      return { data: {} };
    },
  };

  return { client, updates };
};

const row = (patch: Partial<EscTourProgressRecord>): EscTourProgressRecord => ({
  id: 'row-1',
  lastStepId: null,
  outcome: 'completed',
  scriptVersion: 1,
  furthestStepIndex: 0,
  ...patch,
});

/** Starts the writer with a scheduler the test fires by hand. */
const start = (client: EscTourProgressGqlClient) => {
  const scheduled: { open: () => void; delayMs: number }[] = [];
  const stop = startEscTourServerProgress({
    client,
    workspaceMemberId: 'member-1',
    displayName: 'Sam Agent',
    now: () => NOW,
    warn: jest.fn(),
    schedule: (open, delayMs) => scheduled.push({ open, delayMs }),
  });

  return { scheduled, stop };
};

describe('replay on load (RM #22315)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetEscTourStore();
    resetEscTourTeam();
  });

  afterEach(() => {
    for (const key of Object.keys(ESC_TOUR_CHAPTER_VERSIONS)) {
      delete ESC_TOUR_CHAPTER_VERSIONS[key];
    }
    Object.assign(ESC_TOUR_CHAPTER_VERSIONS, ORIGINAL_VERSIONS);
  });

  it('schedules nothing when no chapter changed and nobody asked', async () => {
    const { client } = fakeClient(row({}));
    const { scheduled } = start(client);

    await flush();

    expect(scheduled).toEqual([]);
  });

  it('opens the changed chapter by itself, after the first-paint wait, marked as a replay', async () => {
    ESC_TOUR_CHAPTER_VERSIONS['Getting around'] = 2;
    const { client } = fakeClient(row({}));
    const { scheduled } = start(client);

    await flush();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delayMs).toBe(ESC_TOUR_REPLAY_OPEN_DELAY_MS);

    scheduled[0].open();

    const state = getEscTourSnapshot();

    expect(state.isOpen).toBe(true);
    expect(state.isReplay).toBe(true);
    expect(escTourChaptersOf(state.showableSteps)).toEqual(['Getting around']);
  });

  it('marks EVERY replayed chapter seen when it is skipped on its first step, so it is asked once', async () => {
    ESC_TOUR_CHAPTER_VERSIONS['Where you are'] = 2;
    ESC_TOUR_CHAPTER_VERSIONS['Getting around'] = 2;
    const { client, updates } = fakeClient(row({}));
    const { scheduled } = start(client);

    await flush();
    scheduled[0].open();
    expect(escTourChaptersOf(getEscTourSnapshot().showableSteps)).toEqual([
      'Where you are',
      'Getting around',
    ]);
    closeEscTour();
    await flush();

    const closing = updates[updates.length - 1];

    expect(closing.endReason).toBe('closed');
    expect(JSON.parse(closing.seenChapterVersions as string)).toEqual({
      ...ESC_TOUR_LEGACY_SEEN_CHAPTERS,
      'Where you are': 2,
      'Getting around': 2,
    });
  });

  it('an admin request opens the whole script from the top and clears the request', async () => {
    window.sessionStorage.setItem(ESC_TOUR_RESUME_KEY, ESC_TOUR_STEPS[3].id);
    const { client, updates } = fakeClient(
      row({
        outcome: 'inProgress',
        lastStepId: ESC_TOUR_STEPS[3].id,
        replayRequested: true,
      }),
    );
    const { scheduled } = start(client);

    await flush();
    scheduled[0].open();
    await flush();

    const state = getEscTourSnapshot();

    expect(state.isReplay).toBe(true);
    expect(state.stepIndex).toBe(0);
    expect(state.isResumed).toBe(false);
    expect(updates).toContainEqual({ replayRequested: false });
  });

  it('leaves the request in place when the person opened the tour first', async () => {
    const { client, updates } = fakeClient(row({ replayRequested: true }));
    const { scheduled } = start(client);

    await flush();
    openEscTour(CHAPTERED);
    scheduled[0].open();
    await flush();

    expect(getEscTourSnapshot().isReplay).toBe(false);
    expect(updates).not.toContainEqual({ replayRequested: false });
  });

  it('does not open once stopped', async () => {
    const { client } = fakeClient(row({ replayRequested: true }));
    const { scheduled, stop } = start(client);

    await flush();
    stop();
    scheduled[0].open();

    expect(getEscTourSnapshot().isOpen).toBe(false);
  });

  it('a run abandoned part-way records only the chapters it reached', async () => {
    const { client, updates } = fakeClient(row({ outcome: 'notStarted' }));

    start(client);
    await flush();
    openEscTour(CHAPTERED);
    goToNextEscTourStep();
    closeEscTour();
    await flush();

    expect(
      JSON.parse(updates[updates.length - 1].seenChapterVersions as string),
    ).toEqual({ 'Where you are': 1 });
  });

  it('a finished run records every chapter of the run', async () => {
    const { client, updates } = fakeClient(row({ outcome: 'notStarted' }));

    start(client);
    await flush();
    openEscTour(CHAPTERED);
    goToNextEscTourStep();
    goToNextEscTourStep();
    goToNextEscTourStep();
    await flush();

    expect(
      JSON.parse(updates[updates.length - 1].seenChapterVersions as string),
    ).toEqual({ 'Where you are': 1, 'The left panel': 1 });
  });

  it('only a closing write carries the seen map', async () => {
    const { client, updates } = fakeClient(row({ outcome: 'notStarted' }));

    start(client);
    await flush();
    openEscTour(CHAPTERED);
    goToNextEscTourStep();
    await flush();

    expect(updates.every((input) => !('seenChapterVersions' in input))).toBe(
      true,
    );
  });
});

describe('drop-out telemetry (RM #22316)', () => {
  let events: EscTourProgressEvent[];

  beforeEach(() => {
    window.sessionStorage.clear();
    resetEscTourStore();
    events = [];
    subscribeToEscTourProgress((event) => events.push(event));
  });

  it('names the chapter of every step and how far into the run the reader got', () => {
    openEscTour(CHAPTERED);
    goToNextEscTourStep();
    goToNextEscTourStep();

    expect(
      events.map((event) => [event.chapter, event.reachedChapters]),
    ).toEqual([
      ['Where you are', ['Where you are']],
      ['Where you are', ['Where you are']],
      ['The left panel', ['Where you are', 'The left panel']],
    ]);
    expect(events[0].chapters).toEqual(['Where you are', 'The left panel']);
  });

  it('only a closing event says how the run ended', () => {
    openEscTour(CHAPTERED);
    goToNextEscTourStep();

    expect(events.every((event) => event.endReason === undefined)).toBe(true);
  });

  it('Next on the last step is finished', () => {
    openEscTour(CHAPTERED);
    goToNextEscTourStep();
    goToNextEscTourStep();
    goToNextEscTourStep();

    expect(events[events.length - 1]).toEqual(
      expect.objectContaining({ kind: 'completed', endReason: 'finished' }),
    );
  });

  it('Skip part-way is closed, at the step walked away from', () => {
    openEscTour(CHAPTERED);
    goToNextEscTourStep();
    closeEscTour();

    expect(events[events.length - 1]).toEqual(
      expect.objectContaining({
        kind: 'dismissed',
        endReason: 'closed',
        stepId: 'a2',
        chapter: 'Where you are',
      }),
    );
  });

  it('a run that closes itself because nothing is left to show is stranded, not closed', () => {
    openEscTour([{ id: 'far', title: 'Far', body: 'b', route: '/objects/x' }]);
    skipUnreachableEscTourStep('far');

    expect(events[events.length - 1]).toEqual(
      expect.objectContaining({
        kind: 'dismissed',
        endReason: 'stranded',
        stepId: 'far',
      }),
    );
  });

  it('a replay starts at its first step even when this tab holds a position', () => {
    window.sessionStorage.setItem(ESC_TOUR_RESUME_KEY, 'a2');
    openEscTour(CHAPTERED, { isReplay: true });

    expect(getEscTourSnapshot().stepIndex).toBe(0);
    expect(events[0].stepId).toBe('a1');
  });

  it('a replay says so on its events', () => {
    openEscTour(CHAPTERED, { isReplay: true });

    expect(events[0].isReplay).toBe(true);
  });
});

describe('the update written for a closing run (RM #22316)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetEscTourStore();
    resetEscTourTeam();
  });

  it('stamps endReason, endedAt and the chapter; a new run clears the old ending', async () => {
    const { client, updates } = fakeClient(row({ outcome: 'notStarted' }));

    start(client);
    await flush();
    openEscTour(CHAPTERED);
    closeEscTour();
    openEscTour(CHAPTERED);
    await flush();

    expect(updates[1]).toEqual(
      expect.objectContaining({
        outcome: 'dismissed',
        endReason: 'closed',
        endedAt: NOW.toISOString(),
        lastChapter: 'Where you are',
      }),
    );
    expect(updates[2]).toEqual(
      expect.objectContaining({
        outcome: 'inProgress',
        endReason: null,
        endedAt: null,
      }),
    );
  });
});
