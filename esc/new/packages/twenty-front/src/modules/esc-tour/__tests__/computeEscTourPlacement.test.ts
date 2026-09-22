import { computeEscTourPlacement } from '@/esc-tour/utils/computeEscTourPlacement';

const VIEWPORT = { viewportWidth: 1440, viewportHeight: 900 };
const POPOVER = { popoverWidth: 320, popoverHeight: 200 };

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

  it('keeps a popover wider than the viewport on screen rather than off its left edge', () => {
    const placement = computeEscTourPlacement({
      anchorRect: { top: 10, left: 0, width: 10, height: 10 },
      popoverWidth: 320,
      popoverHeight: 200,
      viewportWidth: 320,
      viewportHeight: 480,
    });

    expect(placement.left).toBeGreaterThanOrEqual(0);
    expect(placement.top).toBeGreaterThanOrEqual(0);
  });
});
