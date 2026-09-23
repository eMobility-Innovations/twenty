import { useSyncExternalStore } from 'react';

import { type EscTourStep } from '@/esc-tour/types/EscTourStep';
import { selectShowableEscTourSteps } from '@/esc-tour/utils/resolveEscTourAnchor';

/**
 * The tour's state, held in a module-level store rather than in a component.
 *
 * WHY NOT `useState` IN THE BUTTON, WHICH IS WHERE IT STARTED
 *
 * The Tour button lives inside `AnimatedExpandableContainer`, and that container
 * renders `{isExpanded && children}` — collapsing the "Other" section UNMOUNTS
 * everything inside it. With the state in the button, collapsing the section mid-tour
 * destroyed the tour, portal and all. Splitting the state out means the button and the
 * overlay can sit in different parts of the tree and still be one tour: the button
 * opens it, a mount point outside the collapsible container renders it.
 *
 * WHY A HAND-WRITTEN STORE AND NOT A CONTEXT OR A LIBRARY
 *
 * A context provider would have to wrap a common ancestor, which means overlaying a
 * second upstream file — every extra overlaid file is a conflict on every upstream
 * sync. A library would be a new npm dependency, which this fork does not take.
 * `useSyncExternalStore` is in React itself and is the sanctioned way to read an
 * external store without tearing.
 */
/**
 * Which way the reader is travelling.
 *
 * It exists for ONE decision, and it is not cosmetic: when a step turns out to be
 * unreachable and is dropped mid-run, the tour has to land on the step the reader was
 * heading TOWARDS. Always landing on the following one bounces somebody who pressed Back
 * straight forward again, every time, with no way past it — a wedged tour, which is the
 * thing this change is most careful not to ship.
 */
export type EscTourDirection = 'forward' | 'backward';

export type EscTourState = {
  isOpen: boolean;
  stepIndex: number;
  /**
   * The steps this run can show. Route-less steps were resolved when the tour opened;
   * routed steps are carried unresolved and judged when the tour reaches their page — see
   * `selectShowableEscTourSteps`. A routed step whose anchor never appears is taken OUT of
   * this list by `skipUnreachableEscTourStep`, so a run can shorten as it is walked.
   */
  showableSteps: EscTourStep[];
  /**
   * Step ids named as unreachable: route-less ones missing at open, and routed ones whose
   * anchor never appeared on its own page. An `optional` step is never in here.
   */
  missingStepIds: string[];
  /** True when this run picked up where an interrupted one left off. */
  isResumed: boolean;
  /** Which way the last move went. See `EscTourDirection`. */
  direction: EscTourDirection;
};

/**
 * Bump when the tour SCRIPT changes in a way that makes a stored position meaningless.
 * It is part of the storage key, so an old position cannot resume into a different tour
 * — it simply is not found and the run starts from the beginning.
 */
export const ESC_TOUR_SCRIPT_VERSION = 1;

export const ESC_TOUR_RESUME_KEY = `esc-tour.resume.v${ESC_TOUR_SCRIPT_VERSION}`;

/**
 * One frozen object, reused. `useSyncExternalStore` re-renders whenever the snapshot's
 * identity changes, so handing back a fresh `{}` on every close would be a render for
 * nothing — and handing one back from `getSnapshot` itself would be an infinite loop.
 */
const CLOSED_ESC_TOUR_STATE: EscTourState = Object.freeze({
  isOpen: false,
  stepIndex: 0,
  showableSteps: [],
  missingStepIds: [],
  isResumed: false,
  direction: 'forward',
});

let escTourState: EscTourState = CLOSED_ESC_TOUR_STATE;

const escTourListeners = new Set<() => void>();

/**
 * The element that had focus when the tour was opened, kept OUT of the snapshot on
 * purpose: it is not rendered from, and putting a DOM node in the snapshot would make
 * every capture a re-render of every subscriber.
 */
let escTourOpenerElement: HTMLElement | null = null;

const setEscTourState = (nextState: EscTourState) => {
  escTourState = nextState;

  for (const listener of escTourListeners) {
    listener();
  }
};

/**
 * sessionStorage, not localStorage and not the server.
 *
 * The operator's decision on 2026-09-22 is that NOTHING durable records who took the
 * tour — no table, no per-user flag. A position that dies with the browser tab is the
 * most that can be kept, and it is exactly enough for the case this exists for:
 * somebody refreshes the page halfway through and does not want to start again.
 *
 * Every access is wrapped. Storage throws outright in some privacy modes, and a tour
 * that cannot start because a preference could not be read is worse than a tour that
 * forgets.
 */
const readEscTourResumeStepId = (): string | null => {
  try {
    return window.sessionStorage.getItem(ESC_TOUR_RESUME_KEY);
  } catch {
    return null;
  }
};

const writeEscTourResumeStepId = (stepId: string | undefined) => {
  if (stepId === undefined) {
    return;
  }

  try {
    window.sessionStorage.setItem(ESC_TOUR_RESUME_KEY, stepId);
  } catch {
    // A tour that cannot remember its place still works. Nothing to report.
  }
};

const clearEscTourResumeStepId = () => {
  try {
    window.sessionStorage.removeItem(ESC_TOUR_RESUME_KEY);
  } catch {
    // As above.
  }
};

export const subscribeToEscTour = (listener: () => void): (() => void) => {
  escTourListeners.add(listener);

  return () => {
    escTourListeners.delete(listener);
  };
};

export const getEscTourSnapshot = (): EscTourState => escTourState;

export const useEscTourState = (): EscTourState =>
  useSyncExternalStore(
    subscribeToEscTour,
    getEscTourSnapshot,
    getEscTourSnapshot,
  );

export const openEscTour = (steps: EscTourStep[]) => {
  // Resolved once, at open, and never recomputed on a render: the set of steps must not
  // change under the reader's feet because something on the page moved.
  //
  // It is no longer resolved COMPLETELY at open, and that is deliberate — a step naming a
  // route is about a page nobody has visited, so there is nothing here to judge it by.
  // `selectShowableEscTourSteps` carries those through, and the only thing that may take
  // one out afterwards is `skipUnreachableEscTourStep`, on evidence gathered on that
  // step's own page.
  const { showableSteps, missingStepIds } = selectShowableEscTourSteps(steps);

  // The STEP ID is persisted, not the index. The showable set is resolved fresh on
  // every open, so a route that appeared or disappeared in between shifts every index —
  // an index would silently resume onto a different step, an id either finds its step
  // or does not.
  const resumeStepId = readEscTourResumeStepId();
  const resumeIndex =
    resumeStepId === null
      ? -1
      : showableSteps.findIndex((step) => step.id === resumeStepId);

  // Resuming AT the first step is indistinguishable from a fresh run, so it is not
  // treated as one — "Start over" would offer to do what the tour has just done.
  const isResumed = resumeIndex > 0;
  const stepIndex = isResumed ? resumeIndex : 0;

  escTourOpenerElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  setEscTourState({
    isOpen: true,
    stepIndex,
    showableSteps,
    missingStepIds,
    isResumed,
    direction: 'forward',
  });

  writeEscTourResumeStepId(showableSteps[stepIndex]?.id);
};

/**
 * Close the tour, whether the person finished it or walked away from it.
 *
 * Both CLEAR the stored position: "Tour" must always start a fresh run afterwards. The
 * only thing that leaves a position behind is the tour being taken away without anybody
 * deciding to end it — a page refresh — which is the whole case resume exists for.
 */
export const closeEscTour = () => {
  clearEscTourResumeStepId();
  setEscTourState(CLOSED_ESC_TOUR_STATE);
};

export const goToNextEscTourStep = () => {
  if (!escTourState.isOpen) {
    return;
  }

  if (escTourState.stepIndex >= escTourState.showableSteps.length - 1) {
    closeEscTour();

    return;
  }

  const stepIndex = escTourState.stepIndex + 1;

  setEscTourState({ ...escTourState, stepIndex, direction: 'forward' });
  writeEscTourResumeStepId(escTourState.showableSteps[stepIndex]?.id);
};

export const goToPreviousEscTourStep = () => {
  if (!escTourState.isOpen) {
    return;
  }

  const stepIndex = Math.max(0, escTourState.stepIndex - 1);

  setEscTourState({ ...escTourState, stepIndex, direction: 'backward' });
  writeEscTourResumeStepId(escTourState.showableSteps[stepIndex]?.id);
};

export const restartEscTour = () => {
  if (!escTourState.isOpen) {
    return;
  }

  setEscTourState({
    ...escTourState,
    stepIndex: 0,
    isResumed: false,
    direction: 'forward',
  });
  writeEscTourResumeStepId(escTourState.showableSteps[0]?.id);
};

/**
 * Take a step out of the run because its anchor never turned up on its own page.
 *
 * WHY IT IS REMOVED RATHER THAN STEPPED OVER
 *
 * The alternative — leave it in and jump past it — puts a step in the run that cannot be
 * shown, and Back walks the reader straight back into it. It waits out the deadline again,
 * jumps forward again, and the tour has a wall in it: the reader can never get behind that
 * step. Taking it out means it is gone from BOTH directions, once, which is also exactly
 * what happens to a route-less step that is missing at open. The visible counter shortens
 * by one; that is honest, and it is a truer number than a total that counts a step nobody
 * will ever be shown.
 *
 * `direction` decides where the reader lands: the way they were already travelling. See
 * `EscTourDirection`.
 *
 * Nothing else may call this. It names a step id rather than taking an index because the
 * caller is a DEADLINE that was armed one step ago — by the time it fires the run may have
 * moved on, and an index would then drop an innocent step. An id that is no longer in the
 * run is a no-op, which is the right answer to a deadline that lost its race.
 */
export const skipUnreachableEscTourStep = (stepId: string) => {
  if (!escTourState.isOpen) {
    return;
  }

  const skippedIndex = escTourState.showableSteps.findIndex(
    (step) => step.id === stepId,
  );

  if (skippedIndex === -1) {
    return;
  }

  const skippedStep = escTourState.showableSteps[skippedIndex];
  const showableSteps = escTourState.showableSteps.filter(
    (step) => step.id !== stepId,
  );

  // `optional` is the difference between "this workspace has no saved views" and "upstream
  // moved a route". Only the second one is news. See `EscTourStep.optional`.
  const missingStepIds =
    skippedStep.optional === true
      ? escTourState.missingStepIds
      : [...escTourState.missingStepIds, stepId];

  const stepIndex =
    escTourState.direction === 'backward'
      ? Math.max(0, skippedIndex - 1)
      : skippedIndex;

  // Nothing left to show, or the dropped step was the last one and the reader was going
  // forwards: the run is over. Closing here is also what stops a tour whose every step
  // turned out to be unreachable from sitting there with its interaction lock over the
  // whole CRM.
  //
  // It closes to a state that CARRIES the report rather than to the shared closed one.
  // Closing to `CLOSED_ESC_TOUR_STATE` would erase `missingStepIds` in the same tick it
  // was added to, so the one case that most deserves reporting — a run that collapsed
  // because its steps could not be found — would be the one case that reported nothing.
  // That is the 2026-09-22 failure with a different mechanism, and this is the line that
  // stops it. `EscTourMount` therefore reports whether or not the tour is still open.
  if (showableSteps.length === 0 || stepIndex > showableSteps.length - 1) {
    clearEscTourResumeStepId();
    setEscTourState({ ...CLOSED_ESC_TOUR_STATE, missingStepIds });

    return;
  }

  setEscTourState({
    ...escTourState,
    showableSteps,
    missingStepIds,
    stepIndex,
  });
  writeEscTourResumeStepId(showableSteps[stepIndex]?.id);
};

/**
 * Hand back the element that had focus when the tour opened, once. Reading it clears
 * it, so a second close cannot yank focus somewhere a third time.
 */
export const takeEscTourOpenerElement = (): HTMLElement | null => {
  const openerElement = escTourOpenerElement;

  escTourOpenerElement = null;

  return openerElement;
};

/**
 * Put the store back to how a freshly loaded page finds it.
 *
 * IN-MEMORY ONLY, deliberately: that is exactly what a page refresh does, and it is
 * what lets a test prove the tour resumes from sessionStorage after one. A test that
 * wants a clean slate clears sessionStorage itself.
 */
export const resetEscTourStore = () => {
  escTourOpenerElement = null;
  setEscTourState(CLOSED_ESC_TOUR_STATE);
};
