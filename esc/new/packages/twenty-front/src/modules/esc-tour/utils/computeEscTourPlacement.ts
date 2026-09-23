export type EscTourRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type EscTourPlacementInput = {
  /** The spotlight, in viewport coordinates, or `null` for a centred step. */
  anchorRect: EscTourRect | null;
  /**
   * The width the popover WANTS, as measured by the caller. It is a request, not a
   * promise: on a narrow screen the returned `width` is smaller.
   */
  popoverWidth: number;
  /** The height the popover currently measures. Same deal — see `maxHeight`. */
  popoverHeight: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type EscTourPlacement = {
  /** Where the popover's top-left corner goes, in viewport coordinates. */
  top: number;
  left: number;
  /** Which side of the spotlight the popover ended up on. Drives the arrow. */
  side: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /**
   * The width the caller must RENDER the popover at. Never wider than the viewport less
   * both margins, so it is often narrower than the `popoverWidth` that was asked for. Apply
   * it — the returned `left` is computed against this width, not against the requested one.
   */
  width: number;
  /**
   * The tallest the popover may be. The caller applies it as `max-height` and lets the body
   * scroll inside; a tall popover on a landscape phone otherwise runs off the bottom.
   * `top` is computed against the capped height, so honouring this keeps the box on screen.
   */
  maxHeight: number;
};

const GAP = 12;
const MARGIN = 16;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Place the popover beside the spotlight, flipping to whichever side has room.
 *
 * Preference order is right, then bottom, then left, then top — the sidebar is on the left
 * of this product, so the first tour steps have room to their right and the popover does
 * not jump about as the tour walks down the nav.
 *
 * Two invariants hold for EVERY branch, including the centred one, at every viewport this
 * product is ever opened at:
 *
 *   MARGIN <= left  and  left + width  <= viewportWidth  - MARGIN
 *   MARGIN <= top   and  top + height  <= viewportHeight - MARGIN
 *
 * where `height` is the popover's height capped at `maxHeight`. They hold because the size
 * is capped to fit BEFORE anything is positioned: clamping a 320px box into a 320px
 * viewport can only ever invert the clamp range, which is how the popover used to end up
 * hanging 16px off the right edge of a small phone while its test still passed.
 */
export const computeEscTourPlacement = ({
  anchorRect,
  popoverWidth,
  popoverHeight,
  viewportWidth,
  viewportHeight,
}: EscTourPlacementInput): EscTourPlacement => {
  // The size that actually fits between the margins. `Math.max(0, …)` only matters for a
  // viewport narrower than the two margins together, which is not a real phone, but a
  // negative width would poison every comparison below.
  const width = Math.max(0, Math.min(popoverWidth, viewportWidth - 2 * MARGIN));
  const maxHeight = Math.max(0, viewportHeight - 2 * MARGIN);
  const height = Math.min(popoverHeight, maxHeight);

  const minLeft = Math.min(MARGIN, viewportWidth - width - MARGIN);
  const maxLeft = viewportWidth - width - MARGIN;
  const minTop = Math.min(MARGIN, viewportHeight - height - MARGIN);
  const maxTop = viewportHeight - height - MARGIN;

  if (anchorRect === null) {
    return {
      left: clamp((viewportWidth - width) / 2, minLeft, maxLeft),
      top: clamp((viewportHeight - height) / 2, minTop, maxTop),
      side: 'center',
      width,
      maxHeight,
    };
  }

  const fitsRight =
    anchorRect.left + anchorRect.width + GAP + width + MARGIN <= viewportWidth;
  const fitsBelow =
    anchorRect.top + anchorRect.height + GAP + height + MARGIN <=
    viewportHeight;
  const fitsLeft = anchorRect.left - GAP - width - MARGIN >= 0;

  if (fitsRight) {
    return {
      left: clamp(anchorRect.left + anchorRect.width + GAP, minLeft, maxLeft),
      top: clamp(
        anchorRect.top + anchorRect.height / 2 - height / 2,
        minTop,
        maxTop,
      ),
      side: 'right',
      width,
      maxHeight,
    };
  }

  if (fitsBelow) {
    return {
      left: clamp(
        anchorRect.left + anchorRect.width / 2 - width / 2,
        minLeft,
        maxLeft,
      ),
      top: clamp(anchorRect.top + anchorRect.height + GAP, minTop, maxTop),
      side: 'bottom',
      width,
      maxHeight,
    };
  }

  if (fitsLeft) {
    return {
      left: clamp(anchorRect.left - GAP - width, minLeft, maxLeft),
      top: clamp(
        anchorRect.top + anchorRect.height / 2 - height / 2,
        minTop,
        maxTop,
      ),
      side: 'left',
      width,
      maxHeight,
    };
  }

  return {
    left: clamp(
      anchorRect.left + anchorRect.width / 2 - width / 2,
      minLeft,
      maxLeft,
    ),
    top: clamp(anchorRect.top - GAP - height, minTop, maxTop),
    side: 'top',
    width,
    maxHeight,
  };
};
