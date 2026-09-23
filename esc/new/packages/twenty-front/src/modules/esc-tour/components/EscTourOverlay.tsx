import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import {
  ESC_TOUR_STYLESHEET,
  ESC_TOUR_STYLESHEET_ID,
} from '@/esc-tour/constants/escTourStylesheet';
import { type EscTourController } from '@/esc-tour/hooks/useEscTour';
import { computeEscTourPlacement } from '@/esc-tour/utils/computeEscTourPlacement';

/**
 * Only used for the very first frame, before the popover has been laid out, and in an
 * environment that reports every box as 0x0 (jsdom). Everything after that is MEASURED
 * — the popover's width is a `min()` of the viewport, so a hardcoded 320 would place
 * the popover for a screen the person is not using.
 */
const FALLBACK_POPOVER_WIDTH = 320;
const FALLBACK_POPOVER_HEIGHT = 168;

/** Half the arrow's border box, and how close to a corner it is allowed to sit. */
const ARROW_EDGE_INSET = 16;

const ESC_TOUR_TITLE_ID = 'esc-tour-title';
const ESC_TOUR_BODY_ID = 'esc-tour-body';

/**
 * What Tab can land on inside the popover. Deliberately narrow: the popover only ever
 * holds buttons, and a selector that guesses widely is a selector that traps focus on a
 * node the browser would have skipped.
 */
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Put the tour's stylesheet in the document head, once, however many times the overlay
 * mounts. Idempotent by id rather than by a module-level flag, so a hot reload or a
 * second mount cannot leave two copies behind.
 */
const ensureStylesheet = () => {
  if (document.getElementById(ESC_TOUR_STYLESHEET_ID) !== null) {
    return;
  }

  const style = document.createElement('style');

  style.id = ESC_TOUR_STYLESHEET_ID;
  style.textContent = ESC_TOUR_STYLESHEET;
  document.head.appendChild(style);
};

/**
 * Where along the popover's edge the arrow sits, so it points at the middle of the
 * thing being spotlit rather than at the middle of the popover. They are the same point
 * only when the popover has not been pushed against a viewport edge, which on a phone
 * it usually has.
 */
const clampArrowOffset = (offset: number, extent: number): number =>
  Math.min(
    Math.max(offset, ARROW_EDGE_INSET),
    Math.max(ARROW_EDGE_INSET, extent - ARROW_EDGE_INSET),
  );

export const EscTourOverlay = ({ tour }: { tour: EscTourController }) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverSize, setPopoverSize] = useState({
    width: FALLBACK_POPOVER_WIDTH,
    height: FALLBACK_POPOVER_HEIGHT,
  });
  const [viewportRevision, setViewportRevision] = useState(0);

  useLayoutEffect(() => {
    ensureStylesheet();
  }, []);

  const measurePopover = useCallback(() => {
    const popover = popoverRef.current;

    if (popover === null) {
      return;
    }

    const rect = popover.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : FALLBACK_POPOVER_WIDTH;
    const height = rect.height > 0 ? rect.height : FALLBACK_POPOVER_HEIGHT;

    // Returning the same object when nothing changed is what stops measure → render →
    // measure from becoming a loop.
    setPopoverSize((currentSize) =>
      currentSize.width === width && currentSize.height === height
        ? currentSize
        : { width, height },
    );
  }, []);

  useLayoutEffect(() => {
    measurePopover();
  }, [measurePopover, tour.step, viewportRevision]);

  useLayoutEffect(() => {
    popoverRef.current?.focus();
  }, [tour.step]);

  /**
   * Re-place on resize and orientation change.
   *
   * This is not belt and braces. The spotlight tracker only re-renders when the
   * anchor's rect CHANGES, and for the two anchorless steps the rect is null on every
   * read — null is the same as null, so nothing re-renders, and a phone turned on its
   * side would keep a popover placed for the shape it had before. Rotating changes the
   * viewport, not the anchor, so the viewport has to say so itself.
   */
  useEffect(() => {
    if (!tour.isOpen) {
      return;
    }

    const handleViewportChange = () => {
      setViewportRevision((currentRevision) => currentRevision + 1);
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
    };
  }, [tour.isOpen]);

  // The BACKSTOP, not the mechanism. The real trap is the Tab handler on the popover;
  // this catches focus arriving from somewhere that handler never sees — a script
  // calling focus() on the application underneath, or a browser restoring focus after
  // an alert.
  useEffect(() => {
    if (!tour.isOpen) {
      return;
    }

    const keepFocusInside = (event: FocusEvent) => {
      const popover = popoverRef.current;

      if (popover === null || popover.contains(event.target as Node)) {
        return;
      }

      event.stopPropagation();
      popover.focus();
    };

    document.addEventListener('focusin', keepFocusInside, true);

    return () => document.removeEventListener('focusin', keepFocusInside, true);
  }, [tour.isOpen]);

  /**
   * A real wrap-around trap: Tab from the last control goes to the first, Shift+Tab
   * from the first goes to the last. The overlay disables the mouse everywhere else on
   * the page, and this is the same promise kept for the keyboard — without it Tab walks
   * out of the tour into an application the person has been told they cannot touch.
   */
  const handlePopoverKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') {
      return;
    }

    const popover = popoverRef.current;

    if (popover === null) {
      return;
    }

    const focusableElements = Array.from(
      popover.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );

    if (focusableElements.length === 0) {
      event.preventDefault();

      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey) {
      if (activeElement === firstElement || activeElement === popover) {
        event.preventDefault();
        lastElement.focus();
      }

      return;
    }

    if (activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  if (!tour.isOpen || tour.step === null) {
    return null;
  }

  const placement = computeEscTourPlacement({
    anchorRect: tour.anchorRect,
    popoverWidth: popoverSize.width,
    popoverHeight: popoverSize.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });

  const isLastStep = tour.stepIndex === tour.stepCount - 1;
  const stepCounterLabel = `Step ${tour.stepIndex + 1} of ${tour.stepCount}`;

  const isSideways = placement.side === 'left' || placement.side === 'right';
  // Clamped against the box as it will actually be RENDERED — the placement's own width,
  // and the height it capped — not against what was measured before the cap was applied.
  const arrowOffset =
    tour.anchorRect === null
      ? ARROW_EDGE_INSET
      : isSideways
        ? clampArrowOffset(
            tour.anchorRect.top + tour.anchorRect.height / 2 - placement.top,
            Math.min(popoverSize.height, placement.maxHeight),
          )
        : clampArrowOffset(
            tour.anchorRect.left + tour.anchorRect.width / 2 - placement.left,
            placement.width,
          );

  const spotlightStyle = (
    tour.anchorRect === null
      ? {
          '--esc-tour-top': '50%',
          '--esc-tour-left': '50%',
          '--esc-tour-width': '0px',
          '--esc-tour-height': '0px',
        }
      : {
          '--esc-tour-top': `${tour.anchorRect.top}px`,
          '--esc-tour-left': `${tour.anchorRect.left}px`,
          '--esc-tour-width': `${tour.anchorRect.width}px`,
          '--esc-tour-height': `${tour.anchorRect.height}px`,
        }
  ) as CSSProperties;

  return createPortal(
    <>
      <div className="esc-tour-lock" data-esc-tour="interaction-lock" />
      <div
        className="esc-tour-spotlight"
        data-esc-tour={
          tour.anchorRect === null ? 'spotlight-none' : 'spotlight'
        }
        style={spotlightStyle}
      />
      {tour.anchorRect !== null && (
        <div
          className="esc-tour-ring"
          data-esc-tour="spotlight-ring"
          style={spotlightStyle}
        />
      )}
      <div
        // Re-keyed per step so the step-change animation restarts. Without the key
        // React reuses the node, the animation never replays, and one step turns into
        // the next with nothing to say that it did.
        key={tour.step.id}
        ref={popoverRef}
        className="esc-tour-popover"
        role="dialog"
        aria-modal="true"
        aria-labelledby={ESC_TOUR_TITLE_ID}
        aria-describedby={ESC_TOUR_BODY_ID}
        tabIndex={-1}
        onKeyDown={handlePopoverKeyDown}
        data-esc-tour="popover"
        data-esc-tour-step={tour.step.id}
        data-esc-tour-side={placement.side}
        style={
          {
            '--esc-tour-popover-top': `${placement.top}px`,
            '--esc-tour-popover-left': `${placement.left}px`,
            // Applied, not advisory: `left` was computed against THIS width, so rendering
            // any other one puts the popover somewhere the placement never agreed to.
            '--esc-tour-popover-width': `${placement.width}px`,
            '--esc-tour-popover-max-height': `${placement.maxHeight}px`,
            '--esc-tour-arrow-offset': `${arrowOffset}px`,
          } as CSSProperties
        }
      >
        <div className="esc-tour-popover-scroll">
          {/* "1 / 9" is read out as "one slash nine". The visible form stays, hidden from
              the accessibility tree, and the spoken form is given twice over: as the
              element's label, and as text for anything that does not honour a label on an
              element with no role. Only one of the two is ever announced. */}
          <div className="esc-tour-counter" aria-label={stepCounterLabel}>
            <span aria-hidden="true">
              {tour.stepIndex + 1} / {tour.stepCount}
            </span>
            <span className="esc-tour-visually-hidden">{stepCounterLabel}</span>
          </div>
          <h2 className="esc-tour-title" id={ESC_TOUR_TITLE_ID}>
            {tour.step.title}
          </h2>
          <p className="esc-tour-body" id={ESC_TOUR_BODY_ID}>
            {tour.step.body}
          </p>
          <div className="esc-tour-actions">
            {/* "Close" is only honest on the last step. Everywhere else this control ends a
                tour the person has not finished, which is a skip, and the data attribute has
                said so all along. */}
            <button
              type="button"
              className="esc-tour-button esc-tour-button--ghost"
              data-esc-tour="skip"
              onClick={tour.close}
            >
              {isLastStep ? 'Close' : 'Skip tour'}
            </button>
            {tour.isResumed && (
              <button
                type="button"
                className="esc-tour-button esc-tour-button--ghost"
                data-esc-tour="start-over"
                onClick={tour.startOver}
              >
                Start over
              </button>
            )}
            <div className="esc-tour-spacer" />
            {tour.stepIndex > 0 && (
              <button
                type="button"
                className="esc-tour-button esc-tour-button--ghost"
                data-esc-tour="previous"
                onClick={tour.previous}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="esc-tour-button esc-tour-button--primary"
              data-esc-tour="next"
              onClick={tour.next}
            >
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
};
