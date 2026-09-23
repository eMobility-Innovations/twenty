import { useCallback, useEffect, useRef, useState } from 'react';

import { ESC_TOUR_STEPS } from '@/esc-tour/constants/escTourSteps';
import {
  closeEscTour,
  goToNextEscTourStep,
  goToPreviousEscTourStep,
  openEscTour,
  restartEscTour,
  skipUnreachableEscTourStep,
  takeEscTourOpenerElement,
  useEscTourState,
} from '@/esc-tour/hooks/useEscTourStore';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';
import { type EscTourRect } from '@/esc-tour/utils/computeEscTourPlacement';
import { escTourStepNeedsNavigation } from '@/esc-tour/utils/escTourRouteMatchesPath';
import { resolveEscTourAnchor } from '@/esc-tour/utils/resolveEscTourAnchor';

/**
 * How the tour is allowed to change the page.
 *
 * Narrowed to "a path, please" on purpose. `useNavigate` from react-router — which is what
 * `EscTourMount` hands in, and which upstream's own `useNavigateApp` and
 * `useNavigateSettings` are both built on — satisfies this. `window.location.assign` also
 * satisfies it, and MUST NOT be used: a full page load tears down the React tree, the
 * portal, the module store and the tour with it, so the reader would press Next and watch
 * the tour disappear.
 */
export type EscTourNavigate = (path: string) => void;

/**
 * How long a step's anchor has to appear on the page the tour has just navigated to,
 * before the step is given up on.
 *
 * This is a CHOSEN bound, not a measurement — nobody has timed a cold record list on the
 * slowest connection a workshop uses, and this comment is not going to pretend otherwise.
 * The reasoning: a list page is a route render plus one GraphQL round trip, so the normal
 * case is well under a second and this deadline is never reached; the cost of setting it
 * too long is paid only when something is genuinely wrong, and the reader is not left
 * guessing while it runs down because the popover says the page is opening. Ten seconds is
 * roughly where a person decides a product is broken rather than slow, so the deadline
 * sits under it.
 *
 * Exported so a test can drive it with fake timers rather than waiting it out.
 */
export const ESC_TOUR_ANCHOR_DEADLINE_MS = 8000;

export type EscTourController = {
  isOpen: boolean;
  step: EscTourStep | null;
  stepIndex: number;
  stepCount: number;
  anchorRect: EscTourRect | null;
  /**
   * Step ids named as unreachable: route-less ones missing when the tour opened, and
   * routed ones whose anchor never appeared on its own page within the deadline.
   */
  missingStepIds: string[];
  /** True when this run picked up where an interrupted one left off. */
  isResumed: boolean;
  /**
   * True while the current step's anchor is not on the page yet — the tour has navigated
   * and the page has not finished. The popover says so; see `EscTourOverlay`.
   */
  isWaitingForAnchor: boolean;
  open: () => void;
  close: () => void;
  next: () => void;
  previous: () => void;
  startOver: () => void;
};

/**
 * How often the spotlight re-reads its target, in animation frames.
 *
 * THE TRADEOFF, WHICH IS REAL BOTH WAYS
 *
 * `getBoundingClientRect` forces the browser to flush pending layout. Doing that on
 * every frame costs a layout flush 60 times a second for as long as the tour is open,
 * even when nothing on the page has moved and nothing re-renders — the loop exists to
 * follow a target that is still loading, and it pays that price the whole time to catch
 * a moment that lasts a few hundred milliseconds.
 *
 * Reading every sixth frame costs a sixth of that and moves the spotlight within ~100ms
 * of its target, which is below the ~150ms at which a person perceives a lag. The
 * property the loop exists for is kept: a list that finishes loading half a second in
 * is still followed. Anything that moves a target ON PURPOSE — a step change, a scroll,
 * a resize — re-reads immediately rather than waiting for the interval, so the only
 * thing that can ever be up to six frames stale is a move nobody asked for.
 */
const TRACKER_FRAME_INTERVAL = 6;

const isSameRect = (
  left: EscTourRect | null,
  right: EscTourRect | null,
): boolean => {
  if (left === null || right === null) {
    return left === right;
  }

  return (
    left.top === right.top &&
    left.left === right.left &&
    left.width === right.width &&
    left.height === right.height
  );
};

const readRect = (element: HTMLElement, padding: number): EscTourRect => {
  const domRect = element.getBoundingClientRect();

  return {
    top: domRect.top - padding,
    left: domRect.left - padding,
    width: domRect.width + padding * 2,
    height: domRect.height + padding * 2,
  };
};

/**
 * Whether the person has asked their system for less movement.
 *
 * `matchMedia` is guarded rather than called: jsdom does not implement it, and an
 * accessibility preference that throws would take the whole tour down with it.
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * The tour, as one object a component can render from.
 *
 * The STATE lives in the module store, not here, so the tour survives this hook's
 * component being unmounted — see `useEscTourStore`. The EFFECTS live here, and this
 * hook is therefore called from exactly ONE mounted component (`EscTourMount`): two
 * callers would mean two keyboard listeners, and one press of ArrowRight would advance
 * the tour twice. With navigation in it that matters more, not less — two callers would
 * also mean two effects racing to navigate to two different steps' routes.
 *
 * `navigate` is OPTIONAL, and is the router's own function — `EscTourMount` gets it from
 * `useNavigate`. It is passed in rather than called here so that this hook stays
 * renderable without a `<Router>` around it, which is what every unit test of the tour's
 * own behaviour does. Without it, a step that needs a different page is skipped and named
 * rather than reached; nothing here ever touches `window.location`.
 */
export const useEscTour = (
  steps: EscTourStep[] = ESC_TOUR_STEPS,
  navigate?: EscTourNavigate,
): EscTourController => {
  const { isOpen, stepIndex, showableSteps, missingStepIds, isResumed } =
    useEscTourState();
  const [anchorRect, setAnchorRect] = useState<EscTourRect | null>(null);
  const [isWaitingForAnchor, setIsWaitingForAnchor] = useState(false);

  const step = showableSteps[stepIndex] ?? null;

  // Held in a ref, and this effect is declared FIRST so it runs before the arrival effect
  // below. `useNavigate` is stable in react-router 6, but "stable in the version we happen
  // to be on" is not something to key an effect that NAVIGATES on: a new identity would
  // re-run the arrival effect and send the reader to the step's route a second time.
  const navigateRef = useRef<EscTourNavigate | undefined>(navigate);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const open = useCallback(() => openEscTour(steps), [steps]);
  const close = useCallback(() => closeEscTour(), []);
  const next = useCallback(() => goToNextEscTourStep(), []);
  const previous = useCallback(() => goToPreviousEscTourStep(), []);
  const startOver = useCallback(() => restartEscTour(), []);

  // The rect belongs to a run, not to the hook. Clearing it here rather than inside
  // `close` catches every way a run can end — the close button, Escape, and Next on the
  // last step, which closes through the store without going past `close` at all.
  useEffect(() => {
    if (!isOpen) {
      setAnchorRect(null);
      setIsWaitingForAnchor(false);
    }
  }, [isOpen]);

  // Put the keyboard back where it came from. Done in an effect rather than inside the
  // close action on purpose: by the time an effect runs the overlay has already been
  // unmounted and its focus guard detached, so nothing is left to snatch focus back.
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;

    wasOpenRef.current = isOpen;

    if (!wasOpen || isOpen) {
      return;
    }

    const openerElement = takeEscTourOpenerElement();

    // An opener that has been unmounted in the meantime — the section was collapsed
    // while the tour ran — is not focused: that throws nothing, but it would move focus
    // to a node no longer on the page.
    if (openerElement !== null && openerElement.isConnected) {
      openerElement.focus();
    }
  }, [isOpen]);

  /**
   * Take the reader to the page this step is about.
   *
   * Declared BEFORE the tracker effect so the navigation is already requested by the time
   * the tracker takes its first look and starts the deadline running.
   *
   * There is no loop to guard against: this runs on a step change, the navigation changes
   * the path but not the step, and a step already on its own route navigates nowhere. A
   * step with no route navigates nowhere either — the navigation drawer is on every page,
   * so moving the reader to show them something already in front of them would be a bug.
   *
   * "Where the reader is" is read from `window.location.pathname` rather than from
   * `useLocation`, so that this hook stays renderable without a `<Router>` and every test
   * of the tour's own behaviour keeps working. The app mounts a BrowserRouter, so the two
   * are the same string. They would NOT be under a MemoryRouter, which keeps its path in
   * memory and leaves `window.location` on `/` — a tour running inside one would navigate
   * to each routed step every time it reached it, which is harmless but is worth knowing
   * before somebody wraps a story or a test in one and reads the extra calls as a loop.
   */
  useEffect(() => {
    if (!isOpen || step === null || step.route === undefined) {
      return;
    }

    if (!escTourStepNeedsNavigation(step, window.location.pathname)) {
      return;
    }

    const navigateToStep = navigateRef.current;

    if (navigateToStep === undefined) {
      // No router was handed in, so this step's page cannot be reached. It is skipped at
      // once rather than left to time out: the deadline exists for a page that is LOADING,
      // and this one is not going to start. Assigning window.location instead would be a
      // full page load, which tears down the tree and the tour with it.
      skipUnreachableEscTourStep(step.id);

      return;
    }

    navigateToStep(step.route);
  }, [isOpen, step]);

  /**
   * Track the spotlight, AND decide whether this step can be shown at all.
   *
   * WHY ONE MECHANISM AND NOT TWO
   *
   * The per-frame tracker already re-resolves the selector on every read rather than
   * capturing an element, so an anchor that appears late — a list that finishes loading
   * half a second in — was ALREADY picked up; that much of "waiting" existed before this
   * change. What it could not do was say anything about an anchor that never appears: the
   * rect simply stayed null for ever, the step sat there, and the run had no way out. A
   * second polling loop beside it would read the same selector at a different cadence and
   * the two would disagree about when the anchor arrived. So the tracker's own read is the
   * thing that reports the anchor has landed, and the only addition is one timer.
   *
   * It also fixes a stale spotlight the tracker had all along, which only becomes visible
   * once the tour navigates: `lastRect` starts null inside each effect run while the React
   * state still holds the PREVIOUS step's rectangle, so `isSameRect(null, null)` skipped
   * the write and the old cut-out stayed on screen over the new page. `hasReadRect` makes
   * the first read of every step write unconditionally.
   */
  useEffect(() => {
    if (!isOpen || step === null) {
      return;
    }

    let animationFrameId = 0;
    let frameCount = 0;
    let lastRect: EscTourRect | null = null;
    let hasReadRect = false;
    let hasResolvedAnchor = false;
    let deadlineId = 0;

    const readAnchorRect = () => {
      const { element, isMissing } = resolveEscTourAnchor(step);
      const nextRect =
        element === null ? null : readRect(element, step.padding ?? 4);

      // Only write when it actually moved — or on the very first read of this step, which
      // is what clears the previous step's rectangle. Without the movement check the tour
      // sets state with a fresh object every read, so React re-renders on every read for
      // as long as it is open.
      if (!hasReadRect || !isSameRect(lastRect, nextRect)) {
        hasReadRect = true;
        lastRect = nextRect;
        setAnchorRect(nextRect);
      }

      if (hasResolvedAnchor || isMissing) {
        return;
      }

      // First sight of the target — either it was there all along, or the page has just
      // finished loading it. A centred step counts as resolved immediately: it points at
      // nothing, so there is nothing for it to wait for.
      hasResolvedAnchor = true;
      window.clearTimeout(deadlineId);
      setIsWaitingForAnchor(false);

      // Bring it on screen. A tour that spotlights something below the fold points
      // confidently at nothing. Done HERE rather than in an effect of its own so that an
      // anchor which appears late is scrolled to when it appears, instead of being looked
      // for once, at a moment the page had not rendered it yet.
      if (element !== null && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
      }
    };

    const track = () => {
      if (frameCount % TRACKER_FRAME_INTERVAL === 0) {
        readAnchorRect();
      }

      frameCount = frameCount + 1;
      animationFrameId = window.requestAnimationFrame(track);
    };

    // A move somebody asked for is read at once rather than up to an interval later.
    // Capture phase, because a scroll inside a list does not bubble to the window.
    window.addEventListener('scroll', readAnchorRect, true);
    window.addEventListener('resize', readAnchorRect);

    // Reads once, synchronously, before anything below looks at `hasResolvedAnchor`.
    track();

    setIsWaitingForAnchor(!hasResolvedAnchor);

    if (!hasResolvedAnchor) {
      // The anchor is not here yet. It is a page still loading, or it is a step whose
      // target has moved and is never coming — and from here those two look identical, so
      // the only honest thing to do is give it a bounded amount of time and then say which
      // it was. `skipUnreachableEscTourStep` takes it out of the run and names it, unless
      // the step declared itself optional.
      deadlineId = window.setTimeout(() => {
        skipUnreachableEscTourStep(step.id);
      }, ESC_TOUR_ANCHOR_DEADLINE_MS);
    }

    return () => {
      window.removeEventListener('scroll', readAnchorRect, true);
      window.removeEventListener('resize', readAnchorRect);
      window.cancelAnimationFrame(animationFrameId);
      // Leaving this armed is how a deadline belonging to a step the reader has already
      // walked past ends up dropping the step they are on now.
      window.clearTimeout(deadlineId);
    };
  }, [isOpen, step]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();

        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();

        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        previous();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close, next, previous]);

  return {
    isOpen,
    step,
    stepIndex,
    stepCount: showableSteps.length,
    anchorRect,
    missingStepIds,
    isResumed,
    isWaitingForAnchor,
    open,
    close,
    next,
    previous,
    startOver,
  };
};
