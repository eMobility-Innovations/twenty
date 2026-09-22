import { styled } from '@linaria/react';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { type EscTourController } from '@/esc-tour/hooks/useEscTour';
import { computeEscTourPlacement } from '@/esc-tour/utils/computeEscTourPlacement';

const POPOVER_WIDTH = 320;
const FALLBACK_POPOVER_HEIGHT = 168;

/**
 * Colours are literal here rather than theme tokens on purpose: this overlay is fork code
 * that has to survive upstream renaming a token, and it draws nothing that belongs to the
 * product's own surfaces. It follows the OS colour scheme, which is what Twenty's own
 * index.html does for its first paint.
 */
const StyledBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 30000;
  /* The cut-out IS this element: a huge spread shadow paints everything except the rect.
     No SVG mask, no four stacked divs, and it animates on the compositor. */
  border-radius: 8px;
  box-shadow: 0 0 0 9999px rgba(16, 16, 16, 0.62);
  top: var(--esc-tour-top);
  left: var(--esc-tour-left);
  width: var(--esc-tour-width);
  height: var(--esc-tour-height);
  pointer-events: none;
  transition:
    top 180ms cubic-bezier(0.16, 1, 0.3, 1),
    left 180ms cubic-bezier(0.16, 1, 0.3, 1),
    width 180ms cubic-bezier(0.16, 1, 0.3, 1),
    height 180ms cubic-bezier(0.16, 1, 0.3, 1);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/**
 * The interaction lock. Everything underneath is unreachable while the tour is open, which
 * is the whole point of a guided tour: the person cannot be halfway through step three and
 * three clicks away from where the tour thinks they are.
 */
const StyledInteractionLock = styled.div`
  position: fixed;
  inset: 0;
  z-index: 29999;
  cursor: default;
`;

const StyledPopover = styled.div`
  position: fixed;
  z-index: 30001;
  box-sizing: border-box;
  width: ${POPOVER_WIDTH}px;
  top: var(--esc-tour-popover-top);
  left: var(--esc-tour-popover-left);
  padding: 20px;
  border-radius: 12px;
  background: #ffffff;
  color: #141414;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 12px 32px rgba(0, 0, 0, 0.24);
  font-family: inherit;

  @media (prefers-color-scheme: dark) {
    background: #1d1d1d;
    color: #f1f1f1;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.4),
      0 12px 32px rgba(0, 0, 0, 0.5);
  }
`;

const StyledCounter = styled.div`
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.55;
`;

const StyledTitle = styled.h2`
  margin: 6px 0 8px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.25;
`;

const StyledBody = styled.p`
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.5;
  opacity: 0.85;
`;

const StyledActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const StyledSpacer = styled.div`
  flex: 1;
`;

const StyledGhostButton = styled.button`
  padding: 7px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  opacity: 0.65;

  &:hover {
    opacity: 1;
    background: rgba(127, 127, 127, 0.14);
  }

  &:focus-visible {
    outline: 2px solid #3b7ff5;
    outline-offset: 1px;
  }
`;

const StyledPrimaryButton = styled.button`
  padding: 7px 14px;
  border: none;
  border-radius: 8px;
  background: #141414;
  color: #ffffff;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;

  &:hover {
    background: #333333;
  }

  &:focus-visible {
    outline: 2px solid #3b7ff5;
    outline-offset: 1px;
  }

  @media (prefers-color-scheme: dark) {
    background: #f1f1f1;
    color: #141414;

    &:hover {
      background: #cfcfcf;
    }
  }
`;

export const EscTourOverlay = ({ tour }: { tour: EscTourController }) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverHeight, setPopoverHeight] = useState(FALLBACK_POPOVER_HEIGHT);

  useLayoutEffect(() => {
    if (popoverRef.current !== null) {
      setPopoverHeight(popoverRef.current.getBoundingClientRect().height);
    }
  }, [tour.step]);

  useLayoutEffect(() => {
    popoverRef.current?.focus();
  }, [tour.step]);

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

  return createPortal(
    <>
      <StyledInteractionLock
        data-esc-tour="interaction-lock"
        onClick={(event) => event.stopPropagation()}
      />
      {tour.anchorRect !== null && (
        <StyledBackdrop
          data-esc-tour="spotlight"
          style={
            {
              '--esc-tour-top': `${tour.anchorRect.top}px`,
              '--esc-tour-left': `${tour.anchorRect.left}px`,
              '--esc-tour-width': `${tour.anchorRect.width}px`,
              '--esc-tour-height': `${tour.anchorRect.height}px`,
            } as CSSProperties
          }
        />
      )}
      {tour.anchorRect === null && (
        <StyledBackdrop
          data-esc-tour="spotlight-none"
          style={
            {
              '--esc-tour-top': '50%',
              '--esc-tour-left': '50%',
              '--esc-tour-width': '0px',
              '--esc-tour-height': '0px',
            } as CSSProperties
          }
        />
      )}
      <StyledPopover
        ref={popoverRef}
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
        <StyledCounter>
          {tour.stepIndex + 1} / {tour.stepCount}
        </StyledCounter>
        <StyledTitle>{tour.step.title}</StyledTitle>
        <StyledBody>{tour.step.body}</StyledBody>
        <StyledActions>
          <StyledGhostButton
            type="button"
            data-esc-tour="skip"
            onClick={tour.close}
          >
            Close
          </StyledGhostButton>
          <StyledSpacer />
          {tour.stepIndex > 0 && (
            <StyledGhostButton
              type="button"
              data-esc-tour="previous"
              onClick={tour.previous}
            >
              Back
            </StyledGhostButton>
          )}
          <StyledPrimaryButton
            type="button"
            data-esc-tour="next"
            onClick={tour.next}
          >
            {isLastStep ? 'Finish' : 'Next'}
          </StyledPrimaryButton>
        </StyledActions>
      </StyledPopover>
    </>,
    document.body,
  );
};
