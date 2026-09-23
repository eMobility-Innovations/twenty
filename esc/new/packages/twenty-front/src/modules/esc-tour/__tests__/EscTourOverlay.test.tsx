import { fireEvent, render, screen } from '@testing-library/react';

import { EscTourOverlay } from '@/esc-tour/components/EscTourOverlay';
import { ESC_TOUR_STYLESHEET } from '@/esc-tour/constants/escTourStylesheet';
import { type EscTourController } from '@/esc-tour/hooks/useEscTour';

const buildController = (
  overrides: Partial<EscTourController> = {},
): EscTourController => ({
  isOpen: true,
  step: { id: 'people', title: 'People', body: 'Every customer.' },
  stepIndex: 0,
  stepCount: 3,
  anchorRect: { top: 100, left: 20, width: 200, height: 32 },
  missingStepIds: [],
  isResumed: false,
  open: jest.fn(),
  close: jest.fn(),
  next: jest.fn(),
  previous: jest.fn(),
  startOver: jest.fn(),
  ...overrides,
});

/**
 * Pull one at-rule block out of the sheet by counting braces. A regex cannot do this:
 * the block has nested rules, and `[^}]*` stops at the first one of them.
 */
const extractAtRuleBlock = (css: string, header: string): string => {
  const start = css.indexOf(header);

  if (start === -1) {
    return '';
  }

  let depth = 0;

  for (let index = css.indexOf('{', start); index < css.length; index++) {
    if (css[index] === '{') {
      depth = depth + 1;
    } else if (css[index] === '}') {
      depth = depth - 1;

      if (depth === 0) {
        return css.slice(start, index + 1);
      }
    }
  }

  return '';
};

/**
 * WCAG 2.1 relative luminance and contrast ratio, for a GREY: red, green and blue are equal,
 * so the weighted sum of the three collapses to the one channel.
 */
const relativeLuminance = (channel: number): number => {
  const ratio = channel / 255;

  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
};

const contrastRatio = (first: number, second: number): number => {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));

  return (lighter + 0.05) / (darker + 0.05);
};

const blendOnto = (
  foreground: number,
  background: number,
  alpha: number,
): number => background + (foreground - background) * alpha;

const getPopover = (): HTMLElement =>
  document.querySelector('[data-esc-tour="popover"]') as HTMLElement;

describe('EscTourOverlay', () => {
  // Deliberately NOT `document.body.innerHTML = ''`. React Testing Library removes its
  // own container on cleanup, and wiping the body first takes that node away from under
  // it — every test then fails on unmount with "The node to be removed is not a child
  // of this node", which says nothing about the component. Anything a test adds itself
  // is removed by reference instead.
  const addedNodes: HTMLElement[] = [];

  const addToPage = (element: HTMLElement) => {
    document.body.appendChild(element);
    addedNodes.push(element);

    return element;
  };

  const setViewport = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', {
      value: width,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: height,
      writable: true,
      configurable: true,
    });
  };

  afterEach(() => {
    while (addedNodes.length > 0) {
      addedNodes.pop()?.remove();
    }

    setViewport(1024, 768);
  });

  it('renders nothing while the tour is closed', () => {
    const { container } = render(
      <EscTourOverlay tour={buildController({ isOpen: false })} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(document.querySelector('[data-esc-tour="popover"]')).toBeNull();
  });

  it('renders nothing when there is no step, even if it is open', () => {
    render(<EscTourOverlay tour={buildController({ step: null })} />);

    expect(document.querySelector('[data-esc-tour="popover"]')).toBeNull();
  });

  it('shows the step copy and where the person is in the tour', () => {
    render(<EscTourOverlay tour={buildController()} />);

    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Every customer.')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  // The overlay has to escape the navigation drawer's stacking context, or the
  // spotlight paints underneath the very thing it is pointing at.
  it('renders into document.body rather than in place', () => {
    const { container } = render(<EscTourOverlay tour={buildController()} />);

    expect(container).toBeEmptyDOMElement();
    expect(
      document.body.querySelector('[data-esc-tour="popover"]'),
    ).not.toBeNull();
  });

  describe('what a screen reader is told', () => {
    // aria-label on the dialog duplicated the heading: the title was authored once and
    // announced twice, and the two could drift apart. Pointing at the heading cannot
    // drift.
    it('is a modal dialog named by its own heading', () => {
      render(<EscTourOverlay tour={buildController()} />);

      const dialog = screen.getByRole('dialog');
      const labelledBy = dialog.getAttribute('aria-labelledby');

      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).not.toHaveAttribute('aria-label');
      expect(labelledBy).not.toBeNull();
      expect(document.getElementById(labelledBy as string)).toHaveTextContent(
        'People',
      );
    });

    it('is described by the step body, so the copy is read with the title', () => {
      render(<EscTourOverlay tour={buildController()} />);

      const describedBy = screen
        .getByRole('dialog')
        .getAttribute('aria-describedby');

      expect(describedBy).not.toBeNull();
      expect(document.getElementById(describedBy as string)).toHaveTextContent(
        'Every customer.',
      );
    });

    // "1 / 3" is announced as "one slash three".
    it('gives the step counter words, and hides the shorthand', () => {
      render(<EscTourOverlay tour={buildController()} />);

      const counter = document.querySelector(
        '.esc-tour-counter',
      ) as HTMLElement;

      expect(counter).toHaveAttribute('aria-label', 'Step 1 of 3');
      expect(screen.getByText('1 / 3')).toHaveAttribute('aria-hidden', 'true');
      expect(counter).toHaveTextContent('Step 1 of 3');
    });
  });

  describe('the keyboard', () => {
    it('moves focus into the popover so the keyboard lands there', () => {
      render(<EscTourOverlay tour={buildController()} />);

      expect(document.activeElement).toBe(screen.getByRole('dialog'));
    });

    // Blocking the mouse and leaving Tab free is the same hole by a different input
    // device.
    it('pulls focus back when something behind the overlay takes it', () => {
      const outsideButton = addToPage(document.createElement('button'));

      render(<EscTourOverlay tour={buildController()} />);

      fireEvent.focusIn(outsideButton);

      expect(document.activeElement).toBe(screen.getByRole('dialog'));
    });

    it('wraps Tab from the last control round to the first', () => {
      render(<EscTourOverlay tour={buildController({ stepIndex: 1 })} />);

      const controls = getPopover().querySelectorAll('button');
      const firstControl = controls[0];
      const lastControl = controls[controls.length - 1];

      lastControl.focus();
      fireEvent.keyDown(lastControl, { key: 'Tab' });

      expect(document.activeElement).toBe(firstControl);
    });

    it('wraps Shift+Tab from the first control round to the last', () => {
      render(<EscTourOverlay tour={buildController({ stepIndex: 1 })} />);

      const controls = getPopover().querySelectorAll('button');
      const firstControl = controls[0];
      const lastControl = controls[controls.length - 1];

      firstControl.focus();
      fireEvent.keyDown(firstControl, { key: 'Tab', shiftKey: true });

      expect(document.activeElement).toBe(lastControl);
    });

    it('leaves every other key to the tour itself', () => {
      render(<EscTourOverlay tour={buildController({ stepIndex: 1 })} />);

      const controls = getPopover().querySelectorAll('button');

      controls[0].focus();
      fireEvent.keyDown(controls[0], { key: 'ArrowRight' });

      expect(document.activeElement).toBe(controls[0]);
    });
  });

  describe('the spotlight', () => {
    it('is painted over the anchor when the step has one', () => {
      render(<EscTourOverlay tour={buildController()} />);

      const spotlight = document.querySelector(
        '[data-esc-tour="spotlight"]',
      ) as HTMLElement;

      expect(spotlight).not.toBeNull();
      expect(spotlight.style.getPropertyValue('--esc-tour-top')).toBe('100px');
      expect(spotlight.style.getPropertyValue('--esc-tour-left')).toBe('20px');
      expect(spotlight.style.getPropertyValue('--esc-tour-width')).toBe('200px');
      expect(spotlight.style.getPropertyValue('--esc-tour-height')).toBe('32px');
    });

    it('collapses for a step that addresses the whole screen', () => {
      render(<EscTourOverlay tour={buildController({ anchorRect: null })} />);

      const spotlight = document.querySelector(
        '[data-esc-tour="spotlight-none"]',
      ) as HTMLElement;

      expect(spotlight).not.toBeNull();
      expect(spotlight.style.getPropertyValue('--esc-tour-width')).toBe('0px');
    });

    // The pulse is on its OWN element, never on the spotlight: the spotlight's geometry
    // is rewritten from the live page as it moves, and an animation on the same element
    // would be fighting the tracker for the same properties.
    it('carries a separate ring element to pulse, only when there is something to ring', () => {
      const { unmount } = render(<EscTourOverlay tour={buildController()} />);

      expect(
        document.querySelector('[data-esc-tour="spotlight-ring"]'),
      ).not.toBeNull();

      unmount();
      render(<EscTourOverlay tour={buildController({ anchorRect: null })} />);

      expect(
        document.querySelector('[data-esc-tour="spotlight-ring"]'),
      ).toBeNull();
    });

    it('covers the page with an interaction lock', () => {
      render(<EscTourOverlay tour={buildController()} />);

      expect(
        document.querySelector('[data-esc-tour="interaction-lock"]'),
      ).not.toBeNull();
    });
  });

  describe('where it puts itself', () => {
    it('names the side it was placed on, and where the arrow goes', () => {
      render(<EscTourOverlay tour={buildController()} />);

      const popover = getPopover();

      expect(popover.getAttribute('data-esc-tour-side')).toMatch(
        /^(top|bottom|left|right|center)$/,
      );
      expect(
        popover.style.getPropertyValue('--esc-tour-arrow-offset'),
      ).toMatch(/^-?\d+(\.\d+)?px$/);
    });

    // The step-change fade is a CSS animation, and a CSS animation only replays when the
    // element is new. Re-keying the popover per step is what makes it new; reuse the node
    // and one step becomes the next with nothing to mark that it did.
    it('remounts the popover on a step change so its animation replays', () => {
      const { rerender } = render(<EscTourOverlay tour={buildController()} />);
      const firstPopover = getPopover();

      rerender(
        <EscTourOverlay
          tour={buildController({
            step: { id: 'orders', title: 'Orders', body: 'Sales.' },
            stepIndex: 1,
          })}
        />,
      );

      expect(getPopover()).not.toBe(firstPopover);
      expect(getPopover()).toHaveAttribute('data-esc-tour-step', 'orders');
    });

    it('caps its height so a long step scrolls instead of running off screen', () => {
      render(<EscTourOverlay tour={buildController()} />);

      expect(
        getPopover().style.getPropertyValue('--esc-tour-popover-max-height'),
      ).toMatch(/^-?\d+(\.\d+)?px$/);
    });

    // The placement computes `left` against the width it returns. Rendering a different
    // width puts the popover somewhere the placement never agreed to — which is how it
    // used to hang off the right edge of a small phone.
    it('renders at the width the placement gave it', () => {
      render(<EscTourOverlay tour={buildController()} />);

      expect(
        getPopover().style.getPropertyValue('--esc-tour-popover-width'),
      ).toMatch(/^\d+(\.\d+)?px$/);
    });

    // For the two ANCHORLESS steps the tracker computes null every frame, and null is
    // the same as null — nothing re-renders. A phone turned on its side would keep a
    // popover placed for the shape it had before, so the viewport has to say so itself.
    it('re-places itself when the window is resized', () => {
      render(<EscTourOverlay tour={buildController({ anchorRect: null })} />);

      const before = getPopover().style.getPropertyValue(
        '--esc-tour-popover-max-height',
      );

      setViewport(400, 900);
      fireEvent(window, new Event('resize'));

      expect(
        getPopover().style.getPropertyValue('--esc-tour-popover-max-height'),
      ).not.toBe(before);
    });

    it('re-places itself when the device is rotated', () => {
      render(<EscTourOverlay tour={buildController({ anchorRect: null })} />);

      const before = getPopover().style.getPropertyValue(
        '--esc-tour-popover-max-height',
      );

      setViewport(900, 400);
      fireEvent(window, new Event('orientationchange'));

      expect(
        getPopover().style.getPropertyValue('--esc-tour-popover-max-height'),
      ).not.toBe(before);
    });
  });

  describe('its stylesheet', () => {
    afterEach(() => {
      document.getElementById('esc-tour-stylesheet')?.remove();
    });

    it('is put in the document head', () => {
      render(<EscTourOverlay tour={buildController()} />);

      const style = document.getElementById('esc-tour-stylesheet');

      expect(style).not.toBeNull();
      expect(style?.textContent).toContain('.esc-tour-popover');
    });

    // Idempotent by id, not by a module-level flag — a second mount or a hot reload
    // must not leave two copies of the rules behind.
    it('is not added twice when the overlay mounts again', () => {
      const first = render(<EscTourOverlay tour={buildController()} />);

      first.unmount();
      render(<EscTourOverlay tour={buildController()} />);

      expect(document.querySelectorAll('#esc-tour-stylesheet')).toHaveLength(1);
    });

    // It is added on mount, not on open, so the first frame of the first tour is
    // already styled rather than flashing unstyled markup.
    it('is added even while the tour is closed', () => {
      render(<EscTourOverlay tour={buildController({ isOpen: false })} />);

      expect(document.getElementById('esc-tour-stylesheet')).not.toBeNull();
    });

    // The number IS the fix, so the number is what is tested — and it is tested by doing
    // the WCAG arithmetic here rather than by asserting "0.62", so that changing the text
    // or the background colour is checked too. At the old 0.55 this fails at 4.07:1.
    it('keeps the step counter above the WCAG AA contrast floor', () => {
      const counterRule = extractAtRuleBlock(
        ESC_TOUR_STYLESHEET,
        '.esc-tour-counter',
      );
      const declaredOpacity = /opacity:\s*([\d.]+)/.exec(counterRule)?.[1];

      expect(declaredOpacity).toBeDefined();

      const opacity = Number(declaredOpacity);

      // 11px text, so there is no large-text exemption to fall back on: 4.5:1 it is.
      expect(
        contrastRatio(blendOnto(0x14, 0xff, opacity), 0xff),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(blendOnto(0xf1, 0x1d, opacity), 0x1d),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it('never lets the popover grow wider than the screen it is on', () => {
      expect(ESC_TOUR_STYLESHEET).toContain('min(320px, calc(100vw - 32px))');
      expect(ESC_TOUR_STYLESHEET).toContain('overflow-y: auto;');
    });

    it('draws an arrow for every side the placement can choose', () => {
      for (const side of ['top', 'bottom', 'left', 'right']) {
        expect(ESC_TOUR_STYLESHEET).toContain(
          `[data-esc-tour-side='${side}']::after`,
        );
      }

      expect(ESC_TOUR_STYLESHEET).toContain(
        `[data-esc-tour-side='center']::after`,
      );
    });

    // Not "has a reduced-motion block" — that would pass with an empty one. Every
    // animation the sheet DEFINES has to be switched off, found by reading the sheet
    // rather than by naming them here, so an animation added later and not switched off
    // fails this.
    it('switches off every animation it defines under prefers-reduced-motion', () => {
      const reducedMotionBlock = extractAtRuleBlock(
        ESC_TOUR_STYLESHEET,
        '@media (prefers-reduced-motion: reduce)',
      );

      expect(reducedMotionBlock).toContain('animation: none');

      const keyframeNames = Array.from(
        ESC_TOUR_STYLESHEET.matchAll(/@keyframes\s+([\w-]+)/g),
      ).map((match) => match[1]);

      expect(keyframeNames.length).toBeGreaterThan(0);

      for (const keyframeName of keyframeNames) {
        const animatedSelectors = Array.from(
          ESC_TOUR_STYLESHEET.matchAll(
            new RegExp(
              `(\\.[\\w-]+)[^{}]*\\{[^{}]*animation:\\s*${keyframeName}\\b`,
              'g',
            ),
          ),
        ).map((match) => match[1]);

        expect(animatedSelectors.length).toBeGreaterThan(0);

        for (const selector of animatedSelectors) {
          expect(reducedMotionBlock).toContain(`${selector} {`);
        }
      }
    });
  });

  describe('the controls', () => {
    it('advances on Next', () => {
      const tour = buildController();

      render(<EscTourOverlay tour={tour} />);
      fireEvent.click(screen.getByText('Next'));

      expect(tour.next).toHaveBeenCalledTimes(1);
    });

    // The data attribute has always said "skip"; the label said "Close". Leaving a tour
    // you have not finished is a skip, and only the last step is a close.
    it('offers to skip the tour on every step but the last', () => {
      const tour = buildController();

      render(<EscTourOverlay tour={tour} />);
      fireEvent.click(screen.getByText('Skip tour'));

      expect(screen.queryByText('Close')).toBeNull();
      expect(tour.close).toHaveBeenCalledTimes(1);
    });

    it('offers to close, not to skip, once the tour is finished', () => {
      render(
        <EscTourOverlay
          tour={buildController({ stepIndex: 2, stepCount: 3 })}
        />,
      );

      expect(screen.getByText('Close')).toBeInTheDocument();
      expect(screen.queryByText('Skip tour')).toBeNull();
    });

    it('offers no Back on the first step', () => {
      render(<EscTourOverlay tour={buildController({ stepIndex: 0 })} />);

      expect(screen.queryByText('Back')).toBeNull();
    });

    it('offers Back once the tour has moved on', () => {
      const tour = buildController({ stepIndex: 1 });

      render(<EscTourOverlay tour={tour} />);
      fireEvent.click(screen.getByText('Back'));

      expect(tour.previous).toHaveBeenCalledTimes(1);
    });

    it('says Finish rather than Next on the last step', () => {
      render(
        <EscTourOverlay
          tour={buildController({ stepIndex: 2, stepCount: 3 })}
        />,
      );

      expect(screen.getByText('Finish')).toBeInTheDocument();
      expect(screen.queryByText('Next')).toBeNull();
    });

    // Offering "Start over" to somebody who has just started is offering to do nothing.
    it('offers Start over only to a run that is being resumed', () => {
      const { unmount } = render(
        <EscTourOverlay tour={buildController({ stepIndex: 1 })} />,
      );

      expect(screen.queryByText('Start over')).toBeNull();

      unmount();

      const tour = buildController({ stepIndex: 1, isResumed: true });

      render(<EscTourOverlay tour={tour} />);
      fireEvent.click(screen.getByText('Start over'));

      expect(tour.startOver).toHaveBeenCalledTimes(1);
    });
  });
});
