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
export type EscTourState = {
  isOpen: boolean;
  stepIndex: number;
  /** The steps this run can actually show, resolved once when the tour was opened. */
  showableSteps: EscTourStep[];
  /** Step ids whose anchor did not resolve when the tour was opened. */
  missingStepIds: string[];
  /** True when this run picked up where an interrupted one left off. */
  isResumed: boolean;
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
  // Resolved once, at open: the set of steps must not change under the user's feet
  // halfway through, which is what recomputing on every render would do.
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

  setEscTourState({ ...escTourState, stepIndex });
  writeEscTourResumeStepId(escTourState.showableSteps[stepIndex]?.id);
};

export const goToPreviousEscTourStep = () => {
  if (!escTourState.isOpen) {
    return;
  }

  const stepIndex = Math.max(0, escTourState.stepIndex - 1);

  setEscTourState({ ...escTourState, stepIndex });
  writeEscTourResumeStepId(escTourState.showableSteps[stepIndex]?.id);
};

export const restartEscTour = () => {
  if (!escTourState.isOpen) {
    return;
  }

  setEscTourState({ ...escTourState, stepIndex: 0, isResumed: false });
  writeEscTourResumeStepId(escTourState.showableSteps[0]?.id);
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
