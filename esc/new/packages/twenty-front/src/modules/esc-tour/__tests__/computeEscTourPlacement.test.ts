import { computeEscTourPlacement } from '@/esc-tour/utils/computeEscTourPlacement';

const VIEWPORT = { viewportWidth: 1440, viewportHeight: 900 };
const POPOVER = { popoverWidth: 320, popoverHeight: 200 };

const MARGIN = 16;

// Every phone and tablet width this CRM is opened at, plus the one that used to break:
// at 320 the requested 320px popover cannot fit between the margins at all.
const NARROW_VIEWPORT_WIDTHS = [320, 375, 768];

describe('computeEscTourPlacement', () => {
  it('centres the popover when the step has no anchor', () => {
    const placement = computeEscTourPlacement({
      anchorRect: null,
      ...POPOVER,
      ...VIEWPORT,
    });

    expect(placement.side).toBe('center');
    expect(placement.left).toBe((1440 - 320) / 2);
    expect(placement.top).toBe((900 - 200) / 2);
  });

  it('prefers the right of the anchor when there is room', () => {
    const placement = computeEscTourPlacement({
      anchorRect: { top: 300, left: 16, width: 200, height: 32 },
      ...POPOVER,
      ...VIEWPORT,
    });

    expect(placement.side).toBe('right');
    expect(placement.left).toBe(16 + 200 + 12);
  });

  it('flips below the anchor when the right edge would overflow', () => {
    const placement = computeEscTourPlacement({
      anchorRect: { top: 100, left: 1100, width: 300, height: 40 },
      ...POPOVER,
      ...VIEWPORT,
    });

    expect(placement.side).toBe('bottom');
    expect(placement.top).toBe(100 + 40 + 12);
  });

  it('never places the popover off the top or bottom of the viewport', () => {
    const nearTop = computeEscTourPlacement({
      anchorRect: { top: 0, left: 16, width: 200, height: 24 },
      ...POPOVER,
      ...VIEWPORT,
    });
    const nearBottom = computeEscTourPlacement({
      anchorRect: { top: 880, left: 16, width: 200, height: 24 },
      ...POPOVER,
      ...VIEWPORT,
    });

    expect(nearTop.top).toBeGreaterThanOrEqual(16);
    expect(nearBottom.top + 200).toBeLessThanOrEqual(900 - 16 + 1);
  });

  it('flips to the left of the anchor when neither right nor below has room', () => {
    // top 800 matters: at 600 there is still room BELOW, and below is preferred over left.
    const placement = computeEscTourPlacement({
      anchorRect: { top: 800, left: 1000, width: 400, height: 40 },
      ...POPOVER,
      ...VIEWPORT,
    });

    expect(placement.side).toBe('left');
    expect(placement.left).toBe(1000 - 12 - 320);
  });

  it('falls back to above the anchor when no side has room', () => {
    const placement = computeEscTourPlacement({
      anchorRect: { top: 700, left: 0, width: 1440, height: 180 },
      ...POPOVER,
      ...VIEWPORT,
    });

    expect(placement.side).toBe('top');
  });

  it('centres the popover on the anchor when it sits below it', () => {
    const placement = computeEscTourPlacement({
      anchorRect: { top: 100, left: 1100, width: 300, height: 40 },
      ...POPOVER,
      ...VIEWPORT,
    });

    // 1100 + 150 - 160 = 1090, which fits, so nothing should have been clamped.
    expect(placement.left).toBe(1090);
  });

  it('vertically centres the popover against the anchor when it sits beside it', () => {
    const placement = computeEscTourPlacement({
      anchorRect: { top: 400, left: 16, width: 200, height: 40 },
      ...POPOVER,
      ...VIEWPORT,
    });

    // 400 + 20 - 100 = 320.
    expect(placement.top).toBe(320);
  });

  it('hands back the requested width when the viewport has room for it', () => {
    const placement = computeEscTourPlacement({
      anchorRect: { top: 300, left: 16, width: 200, height: 32 },
      ...POPOVER,
      ...VIEWPORT,
    });

    expect(placement.width).toBe(320);
    expect(placement.maxHeight).toBe(900 - 2 * MARGIN);
  });

  // The old version of this test asserted `left >= 0` and passed while the popover hung off
  // the RIGHT edge: it was 320px wide in a 320px viewport, placed at left 16, ending at 336.
  // Both edges have to be in the assertion, and the width has to be the one that fits.
  describe.each(NARROW_VIEWPORT_WIDTHS)(
    'at a %ipx viewport',
    (viewportWidth) => {
      const narrow = {
        popoverWidth: 320,
        popoverHeight: 200,
        viewportWidth,
        viewportHeight: 640,
      };

      it('keeps an anchored popover inside both side margins', () => {
        const placement = computeEscTourPlacement({
          anchorRect: { top: 10, left: 0, width: 10, height: 10 },
          ...narrow,
        });

        expect(placement.left).toBeGreaterThanOrEqual(MARGIN);
        expect(placement.left + placement.width).toBeLessThanOrEqual(
          viewportWidth - MARGIN,
        );
      });

      it('keeps a centred popover inside both side margins', () => {
        const placement = computeEscTourPlacement({
          anchorRect: null,
          ...narrow,
        });

        expect(placement.side).toBe('center');
        expect(placement.left).toBeGreaterThanOrEqual(MARGIN);
        expect(placement.left + placement.width).toBeLessThanOrEqual(
          viewportWidth - MARGIN,
        );
      });

      it('never reports a width wider than the viewport allows', () => {
        const placement = computeEscTourPlacement({
          anchorRect: { top: 10, left: 0, width: 10, height: 10 },
          ...narrow,
        });

        expect(placement.width).toBe(Math.min(320, viewportWidth - 2 * MARGIN));
      });
    },
  );

  it('narrows the popover rather than letting it overflow a 320px viewport', () => {
    const placement = computeEscTourPlacement({
      anchorRect: { top: 10, left: 0, width: 10, height: 10 },
      popoverWidth: 320,
      popoverHeight: 200,
      viewportWidth: 320,
      viewportHeight: 480,
    });

    // 320 - 16 - 16. The requested 320 was never renderable here.
    expect(placement.width).toBe(288);
    expect(placement.left).toBe(MARGIN);
    expect(placement.left + placement.width).toBe(320 - MARGIN);
  });

  it('caps the popover height to the viewport less both margins', () => {
    const placement = computeEscTourPlacement({
      anchorRect: { top: 10, left: 0, width: 10, height: 10 },
      popoverWidth: 320,
      popoverHeight: 200,
      viewportWidth: 320,
      viewportHeight: 480,
    });

    expect(placement.maxHeight).toBe(480 - 2 * MARGIN);
  });

  // A landscape phone: the popover is taller than the screen. It must be placed as if it
  // were maxHeight tall, because that is the height the caller will render it at.
  it('keeps a popover taller than the viewport between the top and bottom margins', () => {
    const placement = computeEscTourPlacement({
      anchorRect: { top: 10, left: 0, width: 10, height: 10 },
      popoverWidth: 320,
      popoverHeight: 600,
      viewportWidth: 320,
      viewportHeight: 480,
    });

    expect(placement.maxHeight).toBe(448);
    expect(placement.top).toBeGreaterThanOrEqual(MARGIN);
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(
      480 - MARGIN,
    );
  });

  it('keeps a centred popover taller than the viewport on screen too', () => {
    const placement = computeEscTourPlacement({
      anchorRect: null,
      popoverWidth: 320,
      popoverHeight: 600,
      viewportWidth: 320,
      viewportHeight: 480,
    });

    expect(placement.side).toBe('center');
    expect(placement.top).toBe(MARGIN);
    expect(placement.top + placement.maxHeight).toBe(480 - MARGIN);
  });
});
