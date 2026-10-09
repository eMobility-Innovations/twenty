import {
  closeEscTour,
  ESC_TOUR_RESUME_KEY,
  ESC_TOUR_SCRIPT_VERSION,
  type EscTourProgressEvent,
  goToNextEscTourStep,
  goToPreviousEscTourStep,
  openEscTour,
  resetEscTourStore,
  restartEscTour,
  seedEscTourResumeStepId,
  skipUnreachableEscTourStep,
  subscribeToEscTourProgress,
} from '@/esc-tour/hooks/useEscTourStore';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';

// Route-less, anchor-less steps are always showable, so these tests are about the
// store's bookkeeping and nothing to do with the DOM.
const STEPS: EscTourStep[] = [
  { id: 'one', title: 'One', body: 'b' },
  { id: 'two', title: 'Two', body: 'b' },
  { id: 'three', title: 'Three', body: 'b' },
];

const ROUTED_STEPS: EscTourStep[] = [
  { id: 'one', title: 'One', body: 'b' },
  { id: 'routed', title: 'R', body: 'b', route: '/objects/x', anchor: '#nope' },
  { id: 'three', title: 'Three', body: 'b' },
];

const record = () => {
  const events: EscTourProgressEvent[] = [];
  const unsubscribe = subscribeToEscTourProgress((event) => events.push(event));

  return { events, unsubscribe };
};

describe('esc-tour progress events', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetEscTourStore();
  });

  it('emits opened with the first step, the total and the script version', () => {
    const { events } = record();

    openEscTour(STEPS);

    expect(events).toEqual([
      {
        kind: 'opened',
        stepId: 'one',
        stepIndex: 0,
        totalSteps: 3,
        scriptVersion: ESC_TOUR_SCRIPT_VERSION,
        // RM #22315/#22316: the chapter fields and the replay flag ride on every event.
        chapter: null,
        chapters: [],
        reachedChapters: [],
        isReplay: false,
      },
    ]);
  });

  it('emits advanced on next and on back, naming the step now shown', () => {
    openEscTour(STEPS);
    const { events } = record();

    goToNextEscTourStep();
    goToPreviousEscTourStep();

    expect(events.map((event) => [event.kind, event.stepId])).toEqual([
      ['advanced', 'two'],
      ['advanced', 'one'],
    ]);
  });

  it('emits completed — not dismissed — when next is pressed on the last step', () => {
    openEscTour(STEPS);
    goToNextEscTourStep();
    goToNextEscTourStep();
    const { events } = record();

    goToNextEscTourStep();

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'completed',
        stepId: 'three',
        stepIndex: 2,
      }),
    ]);
  });

  it('emits dismissed with the step the reader walked away from', () => {
    openEscTour(STEPS);
    goToNextEscTourStep();
    const { events } = record();

    closeEscTour();

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'dismissed',
        stepId: 'two',
        stepIndex: 1,
      }),
    ]);
  });

  it('emits nothing when closing a tour that is not open', () => {
    const { events } = record();

    closeEscTour();

    expect(events).toEqual([]);
  });

  it('emits advanced on restart', () => {
    openEscTour(STEPS);
    goToNextEscTourStep();
    const { events } = record();

    restartEscTour();

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'advanced',
        stepId: 'one',
        stepIndex: 0,
      }),
    ]);
  });

  it('emits dismissed when every remaining step turns out unreachable', () => {
    openEscTour([
      { id: 'routed', title: 'R', body: 'b', route: '/x', anchor: '#nope' },
    ]);
    const { events } = record();

    skipUnreachableEscTourStep('routed');

    expect(events).toEqual([
      expect.objectContaining({ kind: 'dismissed', stepId: 'routed' }),
    ]);
  });

  it('emits advanced, with the new total, when a mid-run step is dropped', () => {
    openEscTour(ROUTED_STEPS);
    goToNextEscTourStep();
    const { events } = record();

    skipUnreachableEscTourStep('routed');

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'advanced',
        stepId: 'three',
        totalSteps: 2,
      }),
    ]);
  });

  it('stops delivering events after unsubscribe', () => {
    const { events, unsubscribe } = record();

    unsubscribe();
    openEscTour(STEPS);

    expect(events).toEqual([]);
  });

  it('a listener that throws does not break the tour or the other listeners', () => {
    subscribeToEscTourProgress(() => {
      throw new Error('server down');
    });
    const { events } = record();

    expect(() => openEscTour(STEPS)).not.toThrow();
    expect(events).toHaveLength(1);
  });
});

describe('esc-tour server-seeded resume', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetEscTourStore();
  });

  it('resumes from the seeded step when this tab has no position of its own', () => {
    seedEscTourResumeStepId('two');
    const { events } = record();

    openEscTour(STEPS);

    expect(events[0]).toEqual(
      expect.objectContaining({ kind: 'opened', stepId: 'two', stepIndex: 1 }),
    );
  });

  it('prefers this tab’s own position over the seeded one', () => {
    window.sessionStorage.setItem(ESC_TOUR_RESUME_KEY, 'three');
    seedEscTourResumeStepId('two');
    const { events } = record();

    openEscTour(STEPS);

    expect(events[0]).toEqual(expect.objectContaining({ stepId: 'three' }));
  });

  it('ignores a seeded step that is no longer in the script', () => {
    seedEscTourResumeStepId('gone');
    const { events } = record();

    openEscTour(STEPS);

    expect(events[0]).toEqual(expect.objectContaining({ stepId: 'one' }));
  });

  it('forgets the seed once the tour is closed, so Tour starts fresh afterwards', () => {
    seedEscTourResumeStepId('two');
    openEscTour(STEPS);
    closeEscTour();
    const { events } = record();

    openEscTour(STEPS);

    expect(events[0]).toEqual(expect.objectContaining({ stepId: 'one' }));
  });

  it('a null seed clears a previous one', () => {
    seedEscTourResumeStepId('two');
    seedEscTourResumeStepId(null);
    const { events } = record();

    openEscTour(STEPS);

    expect(events[0]).toEqual(expect.objectContaining({ stepId: 'one' }));
  });
});
