import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';

import {
  ESC_TOUR_STYLESHEET,
  ESC_TOUR_STYLESHEET_ID,
} from '@/esc-tour/constants/escTourStylesheet';
import { type EscTourController } from '@/esc-tour/hooks/useEscTour';
import { computeEscTourPlacement } from '@/esc-tour/utils/computeEscTourPlacement';

const POPOVER_WIDTH = 320;
const FALLBACK_POPOVER_HEIGHT = 168;

/**
 * Put the tour's stylesheet in the document head, once, however many times the overlay
 * mounts. Idempotent by id rather than by a module-level flag, so a hot reload or a second
 * mount cannot leave two copies behind.
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

export const EscTourOverlay = ({ tour }: { tour: EscTourController }) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverHeight, setPopoverHeight] = useState(FALLBACK_POPOVER_HEIGHT);

  useLayoutEffect(() => {
    ensureStylesheet();
  }, []);

  useLayoutEffect(() => {
    if (popoverRef.current !== null) {
      setPopoverHeight(popoverRef.current.getBoundingClientRect().height);
    }
  }, [tour.step]);

  useLayoutEffect(() => {
    popoverRef.current?.focus();
  }, [tour.step]);

  // The interaction lock stops the mouse; Tab walks straight past it into the application
  // underneath, which is the same failure by a different input device. Keeping focus inside
  // the popover is what makes "every control except this one is disabled" true.
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

  if (!tour.isOpen || tour.step === null) {
    return null;
  }

  const placement = computeEscTourPlacement({
    anchorRect: tour.anchorRect,
    popoverWidth: POPOVER_WIDTH,
    popoverHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });

  const isLastStep = tour.stepIndex === tour.stepCount - 1;

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
        data-esc-tour={tour.anchorRect === null ? 'spotlight-none' : 'spotlight'}
        style={spotlightStyle}
      />
      <div
        ref={popoverRef}
        className="esc-tour-popover"
        role="dialog"
        aria-modal="true"
        aria-label={tour.step.title}
        tabIndex={-1}
        data-esc-tour="popover"
        data-esc-tour-step={tour.step.id}
        data-esc-tour-side={placement.side}
        style={
          {
            '--esc-tour-popover-top': `${placement.top}px`,
            '--esc-tour-popover-left': `${placement.left}px`,
          } as CSSProperties
        }
      >
        <div className="esc-tour-counter">
          {tour.stepIndex + 1} / {tour.stepCount}
        </div>
        <h2 className="esc-tour-title">{tour.step.title}</h2>
        <p className="esc-tour-body">{tour.step.body}</p>
        <div className="esc-tour-actions">
          <button
            type="button"
            className="esc-tour-button esc-tour-button--ghost"
            data-esc-tour="skip"
            onClick={tour.close}
          >
            Close
          </button>
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
    </>,
    document.body,
  );
};
