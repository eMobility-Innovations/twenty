import {
  closeEscTour,
  continueEscTourWithSteps,
  ESC_TOUR_RESUME_KEY,
  type EscTourProgressEvent,
  getEscTourSnapshot,
  goToNextEscTourStep,
  goToPreviousEscTourStep,
  openEscTour,
  resetEscTourStore,
  restartEscTour,
  skipUnreachableEscTourStep,
  subscribeToEscTour,
  subscribeToEscTourProgress,
  takeEscTourOpenerElement,
} from '@/esc-tour/hooks/useEscTourStore';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';

// The store's guards: every action on a tour that is not open must do NOTHING — no state
// change, no stored position, no progress event. A stray keypress or a deadline that fires
// after the reader closed the tour would otherwise reopen it or write a bogus row.

const STEPS: EscTourStep[] = [
  { id: 'one', title: 'One', body: 'b' },
  { id: 'two', title: 'Two', body: 'b' },
];

const record = () => {
  const events: EscTourProgressEvent[] = [];

  subscribeToEscTourProgress((event) => events.push(event));

  return events;
};

describe('esc-tour store on a closed tour', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetEscTourStore();
  });

  it.each([
    ['next', goToNextEscTourStep],
    ['back', goToPreviousEscTourStep],
    ['restart', restartEscTour],
    ['close', closeEscTour],
    ['skip', () => skipUnreachableEscTourStep('one')],
    ['continue with other steps', () => continueEscTourWithSteps(STEPS)],
  ])('%s does nothing', (_label, action) => {
    const events = record();
    const listener = jest.fn();
    const before = getEscTourSnapshot();

    subscribeToEscTour(listener);
    action();

    expect(getEscTourSnapshot()).toBe(before);
    expect(getEscTourSnapshot().isOpen).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(window.sessionStorage.getItem(ESC_TOUR_RESUME_KEY)).toBeNull();
  });

  it('stops notifying a state listener after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToEscTour(listener);

    unsubscribe();
    openEscTour(STEPS);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('esc-tour store edge cases', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetEscTourStore();
  });

  it('skipping a step id that is not in the run is a no-op', () => {
    openEscTour(STEPS);
    const events = record();
    const before = getEscTourSnapshot();

    skipUnreachableEscTourStep('not-in-this-run');

    expect(getEscTourSnapshot()).toBe(before);
    expect(events).toEqual([]);
  });

  it('opening with no showable steps records no position and emits nothing', () => {
    const events = record();

    openEscTour([]);

    expect(getEscTourSnapshot()).toEqual(
      expect.objectContaining({ isOpen: true, showableSteps: [] }),
    );
    expect(window.sessionStorage.getItem(ESC_TOUR_RESUME_KEY)).toBeNull();
    expect(events).toEqual([]);
  });

  it('back on the first step stays on the first step', () => {
    openEscTour(STEPS);

    goToPreviousEscTourStep();

    expect(getEscTourSnapshot()).toEqual(
      expect.objectContaining({ stepIndex: 0, direction: 'backward' }),
    );
  });

  it('a script that does not hold the current step starts from its top', () => {
    openEscTour(STEPS);
    goToNextEscTourStep();

    continueEscTourWithSteps([
      { id: 'x', title: 'X', body: 'b' },
      { id: 'y', title: 'Y', body: 'b' },
    ]);

    const state = getEscTourSnapshot();

    expect(state.showableSteps.map((step) => step.id)).toEqual(['x', 'y']);
    expect(state.stepIndex).toBe(0);
  });

  it('continuing from the last step of the new script stays on that step', () => {
    openEscTour(STEPS);
    goToNextEscTourStep();

    continueEscTourWithSteps(STEPS);

    expect(getEscTourSnapshot().stepIndex).toBe(1);
  });
});

describe('takeEscTourOpenerElement', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetEscTourStore();
    document.body.innerHTML = '';
  });

  it('hands back the element focused at open, exactly once', () => {
    const button = document.createElement('button');

    document.body.appendChild(button);
    button.focus();
    openEscTour(STEPS);

    expect(takeEscTourOpenerElement()).toBe(button);
    expect(takeEscTourOpenerElement()).toBeNull();
  });

  it('is null when nothing was focused', () => {
    (document.activeElement as HTMLElement | null)?.blur();
    openEscTour(STEPS);

    // jsdom reports <body> as the active element when nothing else is focused.
    const opener = takeEscTourOpenerElement();

    expect(opener === null || opener === document.body).toBe(true);
  });

  it('is cleared by a store reset', () => {
    const button = document.createElement('button');

    document.body.appendChild(button);
    button.focus();
    openEscTour(STEPS);
    resetEscTourStore();

    expect(takeEscTourOpenerElement()).toBeNull();
  });
});
