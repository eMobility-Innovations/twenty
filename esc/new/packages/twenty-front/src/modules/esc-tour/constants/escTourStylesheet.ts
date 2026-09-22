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

     No transition, on purpose. The geometry is re-read on every animation frame so the
     spotlight can follow a target that scrolls or finishes loading; a transition on the
     same properties would fight that and lag a frame behind the thing it is pointing at.
     top/left/width/height are also the properties this org's rules say not to animate. */
  box-shadow: 0 0 0 9999px rgba(16, 16, 16, 0.62);
}

.esc-tour-popover {
  position: fixed;
  z-index: 30001;
  box-sizing: border-box;
  width: 320px;
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
}

.esc-tour-popover:focus {
  outline: none;
}

.esc-tour-counter {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.55;
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

  .esc-tour-button--primary {
    background: #f1f1f1;
    color: #141414;
  }

  .esc-tour-button--primary:hover {
    background: #cfcfcf;
  }
}
`;
