import { useCallback, useEffect, useMemo, useState } from 'react';

import { ESC_TOUR_STEPS } from '@/esc-tour/constants/escTourSteps';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';
import {
  resolveEscTourAnchor,
  selectShowableEscTourSteps,
} from '@/esc-tour/utils/resolveEscTourAnchor';
import { type EscTourRect } from '@/esc-tour/utils/computeEscTourPlacement';

export type EscTourController = {
  isOpen: boolean;
  step: EscTourStep | null;
  stepIndex: number;
  stepCount: number;
  anchorRect: EscTourRect | null;
  /** Step ids whose anchor did not resolve when the tour was opened. */
  missingStepIds: string[];
  open: () => void;
  close: () => void;
  next: () => void;
  previous: () => void;
};

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

export const useEscTour = (
  steps: EscTourStep[] = ESC_TOUR_STEPS,
): EscTourController => {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [missingStepIds, setMissingStepIds] = useState<string[]>([]);
  const [showableSteps, setShowableSteps] = useState<EscTourStep[]>([]);
  const [anchorRect, setAnchorRect] = useState<EscTourRect | null>(null);

  const open = useCallback(() => {
    // Resolved once, at open: the set of steps must not change under the user's feet
    // halfway through, which is what recomputing on every render would do.
    const { showableSteps: resolved, missingStepIds: missing } =
      selectShowableEscTourSteps(steps);

    setShowableSteps(resolved);
    setMissingStepIds(missing);
    setStepIndex(0);
    setIsOpen(true);
  }, [steps]);

  const close = useCallback(() => {
    setIsOpen(false);
    setAnchorRect(null);
  }, []);

  const step = useMemo(
    () => showableSteps[stepIndex] ?? null,
    [showableSteps, stepIndex],
  );

  const next = useCallback(() => {
    // Deliberately NOT a side effect inside a setState updater: React may call an updater
    // twice, and closing the tour from inside one is the kind of thing that works until
    // StrictMode runs it again.
    if (stepIndex >= showableSteps.length - 1) {
      close();

      return;
    }

    setStepIndex(stepIndex + 1);
  }, [stepIndex, showableSteps.length, close]);

  const previous = useCallback(() => {
    setStepIndex((currentIndex) => Math.max(0, currentIndex - 1));
  }, []);

  // Track the spotlight. The app underneath keeps living — a list can finish loading and
  // move the thing we are pointing at — so the rect is re-read on every frame the browser
  // was going to paint anyway rather than once when the step opens.
  useEffect(() => {
    if (!isOpen || step === null) {
      return;
    }

    let animationFrameId = 0;
    let lastRect: EscTourRect | null = null;

    const track = () => {
      const { element } = resolveEscTourAnchor(step);
      const nextRect =
        element === null ? null : readRect(element, step.padding ?? 4);

      // Only write when it actually moved. Without this the tour sets state sixty times a
      // second with a fresh object every time, so React re-renders sixty times a second
      // for as long as the tour is open.
      if (!isSameRect(lastRect, nextRect)) {
        lastRect = nextRect;
        setAnchorRect(nextRect);
      }

      animationFrameId = window.requestAnimationFrame(track);
    };

    track();

    return () => window.cancelAnimationFrame(animationFrameId);
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
    open,
    close,
    next,
    previous,
  };
};
