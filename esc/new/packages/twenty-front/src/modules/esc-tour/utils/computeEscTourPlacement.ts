export type EscTourRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type EscTourPlacement = {
  /** Where the popover's top-left corner goes, in viewport coordinates. */
  top: number;
  left: number;
  /** Which side of the spotlight the popover ended up on. Drives the arrow. */
  side: 'top' | 'bottom' | 'left' | 'right' | 'center';
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
 */
export const computeEscTourPlacement = ({
  anchorRect,
  popoverWidth,
  popoverHeight,
  viewportWidth,
  viewportHeight,
}: {
  anchorRect: EscTourRect | null;
  popoverWidth: number;
  popoverHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}): EscTourPlacement => {
  if (anchorRect === null) {
    return {
      top: Math.max(MARGIN, (viewportHeight - popoverHeight) / 2),
      left: Math.max(MARGIN, (viewportWidth - popoverWidth) / 2),
      side: 'center',
    };
  }

  const fitsRight =
    anchorRect.left + anchorRect.width + GAP + popoverWidth + MARGIN <=
    viewportWidth;
  const fitsBelow =
    anchorRect.top + anchorRect.height + GAP + popoverHeight + MARGIN <=
    viewportHeight;
  const fitsLeft = anchorRect.left - GAP - popoverWidth - MARGIN >= 0;

  if (fitsRight) {
    return {
      left: anchorRect.left + anchorRect.width + GAP,
      top: clamp(
        anchorRect.top + anchorRect.height / 2 - popoverHeight / 2,
        MARGIN,
        viewportHeight - popoverHeight - MARGIN,
      ),
      side: 'right',
    };
  }

  if (fitsBelow) {
    return {
      left: clamp(
        anchorRect.left + anchorRect.width / 2 - popoverWidth / 2,
        MARGIN,
        viewportWidth - popoverWidth - MARGIN,
      ),
      top: anchorRect.top + anchorRect.height + GAP,
      side: 'bottom',
    };
  }

  if (fitsLeft) {
    return {
      left: anchorRect.left - GAP - popoverWidth,
      top: clamp(
        anchorRect.top + anchorRect.height / 2 - popoverHeight / 2,
        MARGIN,
        viewportHeight - popoverHeight - MARGIN,
      ),
      side: 'left',
    };
  }

  return {
    left: clamp(
      anchorRect.left + anchorRect.width / 2 - popoverWidth / 2,
      MARGIN,
      viewportWidth - popoverWidth - MARGIN,
    ),
    top: clamp(
      anchorRect.top - GAP - popoverHeight,
      MARGIN,
      viewportHeight - popoverHeight - MARGIN,
    ),
    side: 'top',
  };
};
