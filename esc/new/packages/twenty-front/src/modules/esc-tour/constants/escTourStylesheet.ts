/**
 * The tour's stylesheet, as plain CSS injected once into the document head.
 *
 * WHY NOT LINARIA, WHICH IS WHAT THE REST OF twenty-front USES
 *
 * Linaria is a BUILD-TIME transform: `styled.div` only works because a bundler plugin has
 * already replaced it with a class name. twenty-front's jest config carries no linaria
 * transform, so a component built from `@linaria/react` cannot be rendered in a unit test at
 * all — the runtime tag throws. That would leave the overlay, which is the part a person
 * actually sees, permanently untestable.
 *
 * This overlay is fork code living in a portal on `document.body`. It shares no tokens and
 * no stacking context with the product's own surfaces, so it loses nothing by owning its
 * CSS outright, and it gains being renderable anywhere — a test, a story, a browser.
 *
 * Colours are literal and follow the OS colour scheme, which is what Twenty's own
 * index.html does for its first paint. They are deliberately NOT theme tokens: this is fork
 * code that has to survive upstream renaming one.
 *
 * MOTION
 *
 * Everything that moves here moves on `transform` and `opacity` only — the two properties a
 * browser can animate on the compositor without laying the page out again. Nothing animates
 * width, height, top or left, and the reduced-motion branch at the bottom switches every
 * animation in this sheet off rather than merely shortening it.
 */
export const ESC_TOUR_STYLESHEET_ID = 'esc-tour-stylesheet';

export const ESC_TOUR_STYLESHEET = `
.esc-tour-lock {
  position: fixed;
  inset: 0;
  z-index: 29999;
  cursor: default;
}

.esc-tour-spotlight {
  position: fixed;
  z-index: 30000;
  border-radius: 8px;
  pointer-events: none;
  top: var(--esc-tour-top);
  left: var(--esc-tour-left);
  width: var(--esc-tour-width);
  height: var(--esc-tour-height);
  /* The cut-out IS this element: one huge spread shadow paints everything except the
     rectangle. No SVG mask, no four stacked divs.

     NOTHING ANIMATES ON THIS ELEMENT, on purpose. Its geometry is re-read from the live
     page and rewritten as inline custom properties, so an animation or a transition on it
     would fight the tracker and lag a frame behind the thing it is pointing at. The pulse
     lives on .esc-tour-ring, a separate element, for exactly that reason. */
  box-shadow: 0 0 0 9999px rgba(16, 16, 16, 0.62);
}

.esc-tour-ring {
  position: fixed;
  z-index: 30000;
  border-radius: 8px;
  pointer-events: none;
  top: var(--esc-tour-top);
  left: var(--esc-tour-left);
  width: var(--esc-tour-width);
  height: var(--esc-tour-height);
  box-shadow: 0 0 0 2px rgba(59, 127, 245, 0.7);
  /* Slow and small on purpose: this sits under the person's eyes for as long as the step
     does, and anything faster than a breath becomes a thing to look away from. */
  animation: esc-tour-pulse 2600ms ease-in-out infinite;
}

@keyframes esc-tour-pulse {
  0% {
    transform: scale(1);
    opacity: 0.55;
  }

  50% {
    transform: scale(1.03);
    opacity: 1;
  }

  100% {
    transform: scale(1);
    opacity: 0.55;
  }
}

.esc-tour-popover {
  position: fixed;
  z-index: 30001;
  box-sizing: border-box;
  /* Never wider than the screen it is on. At 320px and below — the narrowest phone we
     support — the popover keeps a 16px gutter on each side instead of overflowing. The
     custom property is what computeEscTourPlacement actually placed the box at, and the
     min() is the same rule in CSS for the frame before the first measurement lands. */
  width: var(--esc-tour-popover-width, min(320px, calc(100vw - 32px)));
  top: var(--esc-tour-popover-top);
  left: var(--esc-tour-popover-left);
  border-radius: 12px;
  background: #ffffff;
  color: #141414;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 12px 32px rgba(0, 0, 0, 0.24);
  font-family: inherit;
  /* A short fade-and-rise when the step changes. The popover is re-keyed per step, so this
     restarts on each one and reads as "something new", not as the same box teleporting. */
  animation: esc-tour-step-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes esc-tour-step-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.esc-tour-popover:focus {
  outline: none;
}

/* The arrow. \`placement.side\` says which side of the spotlight the popover ended up on,
   the component emits it as data-esc-tour-side, and the offset along that side is computed
   from the anchor so the arrow points at the middle of the highlighted thing even when the
   popover has been pushed against a viewport edge. A centred step has no target to point
   at, so it has no arrow. */
.esc-tour-popover::after {
  content: '';
  position: absolute;
  width: 0;
  height: 0;
  border: 8px solid transparent;
}

.esc-tour-popover[data-esc-tour-side='center']::after {
  display: none;
}

.esc-tour-popover[data-esc-tour-side='right']::after {
  top: var(--esc-tour-arrow-offset);
  left: -16px;
  margin-top: -8px;
  border-right-color: #ffffff;
}

.esc-tour-popover[data-esc-tour-side='left']::after {
  top: var(--esc-tour-arrow-offset);
  right: -16px;
  margin-top: -8px;
  border-left-color: #ffffff;
}

.esc-tour-popover[data-esc-tour-side='bottom']::after {
  left: var(--esc-tour-arrow-offset);
  top: -16px;
  margin-left: -8px;
  border-bottom-color: #ffffff;
}

.esc-tour-popover[data-esc-tour-side='top']::after {
  left: var(--esc-tour-arrow-offset);
  bottom: -16px;
  margin-left: -8px;
  border-top-color: #ffffff;
}

/* The scrolling lives on an inner element, not on the popover, because \`overflow\` clips
   pseudo-elements — putting it on the popover would cut the arrow off. */
.esc-tour-popover-scroll {
  box-sizing: border-box;
  max-height: var(--esc-tour-popover-max-height);
  overflow-y: auto;
  padding: 20px;
}

.esc-tour-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.esc-tour-counter {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  /* 0.62, not 0.55. #141414 at 55% over #ffffff resolves to #7E7E7E, which is 4.07:1 —
     below the 4.5:1 WCAG AA needs, and at 11px there is no large-text exemption to fall
     back on. At 62% it resolves to #6D6D6D, measured 5.15:1 on white; the dark scheme's
     #f1f1f1 at 62% over #1d1d1d measures 6.47:1. */
  opacity: 0.62;
}

.esc-tour-title {
  margin: 6px 0 8px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.25;
}

.esc-tour-body {
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.5;
  opacity: 0.85;
}

.esc-tour-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.esc-tour-spacer {
  flex: 1;
}

.esc-tour-button {
  padding: 7px 12px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
}

.esc-tour-button:focus-visible {
  outline: 2px solid #3b7ff5;
  outline-offset: 1px;
}

.esc-tour-button--ghost {
  background: transparent;
  color: inherit;
  opacity: 0.65;
}

.esc-tour-button--ghost:hover {
  opacity: 1;
  background: rgba(127, 127, 127, 0.14);
}

.esc-tour-button--primary {
  padding: 7px 14px;
  background: #141414;
  color: #ffffff;
  font-weight: 500;
}

.esc-tour-button--primary:hover {
  background: #333333;
}

@media (prefers-color-scheme: dark) {
  .esc-tour-popover {
    background: #1d1d1d;
    color: #f1f1f1;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.4),
      0 12px 32px rgba(0, 0, 0, 0.5);
  }

  .esc-tour-popover[data-esc-tour-side='right']::after {
    border-right-color: #1d1d1d;
  }

  .esc-tour-popover[data-esc-tour-side='left']::after {
    border-left-color: #1d1d1d;
  }

  .esc-tour-popover[data-esc-tour-side='bottom']::after {
    border-bottom-color: #1d1d1d;
  }

  .esc-tour-popover[data-esc-tour-side='top']::after {
    border-top-color: #1d1d1d;
  }

  .esc-tour-button--primary {
    background: #f1f1f1;
    color: #141414;
  }

  .esc-tour-button--primary:hover {
    background: #cfcfcf;
  }
}

/* REQUIRED, not decorative. Every animation this sheet defines is switched off here — not
   shortened, not softened. A person who has asked their system for less movement is telling
   us that motion makes the product unusable or unwell-making for them, and a tour is the
   worst possible place to overrule that. */
@media (prefers-reduced-motion: reduce) {
  .esc-tour-ring {
    animation: none;
    opacity: 1;
  }

  .esc-tour-popover {
    animation: none;
  }
}
`;
