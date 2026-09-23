import { useCallback, useEffect, useRef, useState } from 'react';

import { ESC_TOUR_STEPS } from '@/esc-tour/constants/escTourSteps';
import {
  closeEscTour,
  goToNextEscTourStep,
  goToPreviousEscTourStep,
  openEscTour,
  restartEscTour,
  takeEscTourOpenerElement,
  useEscTourState,
} from '@/esc-tour/hooks/useEscTourStore';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';
import { type EscTourRect } from '@/esc-tour/utils/computeEscTourPlacement';
import { resolveEscTourAnchor } from '@/esc-tour/utils/resolveEscTourAnchor';

export type EscTourController = {
  isOpen: boolean;
  step: EscTourStep | null;
  stepIndex: number;
  stepCount: number;
  anchorRect: EscTourRect | null;
  /** Step ids whose anchor did not resolve when the tour was opened. */
  missingStepIds: string[];
  /** True when this run picked up where an interrupted one left off. */
  isResumed: boolean;
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
 * the tour twice.
 */
export const useEscTour = (
  steps: EscTourStep[] = ESC_TOUR_STEPS,
): EscTourController => {
  const { isOpen, stepIndex, showableSteps, missingStepIds, isResumed } =
    useEscTourState();
  const [anchorRect, setAnchorRect] = useState<EscTourRect | null>(null);

  const step = showableSteps[stepIndex] ?? null;

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

  // Bring the step's target on screen. A tour that spotlights something below the fold
  // points confidently at nothing.
  useEffect(() => {
    if (!isOpen || step === null) {
      return;
    }

    const { element } = resolveEscTourAnchor(step);

    // jsdom does not implement scrollIntoView, and neither do some embedded webviews.
    if (element === null || typeof element.scrollIntoView !== 'function') {
      return;
    }

    element.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [isOpen, step]);

  // Track the spotlight. The app underneath keeps living — a list can finish loading
  // and move the thing we are pointing at — so the rect is re-read on a frame interval
  // rather than once when the step opens. See TRACKER_FRAME_INTERVAL for what that
  // interval buys.
  useEffect(() => {
    if (!isOpen || step === null) {
      return;
    }

    let animationFrameId = 0;
    let frameCount = 0;
    let lastRect: EscTourRect | null = null;

    const readAnchorRect = () => {
      const { element } = resolveEscTourAnchor(step);
      const nextRect =
        element === null ? null : readRect(element, step.padding ?? 4);

      // Only write when it actually moved. Without this the tour sets state with a
      // fresh object every read, so React re-renders on every read for as long as it is
      // open.
      if (!isSameRect(lastRect, nextRect)) {
        lastRect = nextRect;
        setAnchorRect(nextRect);
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

    track();

    return () => {
      window.removeEventListener('scroll', readAnchorRect, true);
      window.removeEventListener('resize', readAnchorRect);
      window.cancelAnimationFrame(animationFrameId);
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
    open,
    close,
    next,
    previous,
    startOver,
  };
};
