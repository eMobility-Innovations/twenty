import { useEffect } from 'react';

import { EscTourOverlay } from '@/esc-tour/components/EscTourOverlay';
import { useEscTour } from '@/esc-tour/hooks/useEscTour';

/**
 * Where the tour is RENDERED, as opposed to where it is started.
 *
 * WHY THIS IS NOT THE BUTTON
 *
 * The Tour button lives inside the navigation drawer's "Other" section, and that
 * section's `AnimatedExpandableContainer` renders `{isExpanded && children}` —
 * collapsing "Other" unmounts everything inside it. While the overlay was mounted from
 * the button, collapsing the section mid-tour destroyed the tour, portal and all, in
 * the middle of somebody's first five minutes in the product. This component is mounted
 * as a SIBLING of that container so the tour outlives it; the state itself lives in the
 * module store, not in either component.
 *
 * KNOWN, AND ACCEPTED: the section itself is still unmounted by layout-customization
 * mode and by the AI-chat drawer tab, which swap the whole drawer out. A tour running
 * through either of those is lost. The collapsible section is the common case — it is
 * one click, next to the button, and it is the one that is fixed.
 */
export const EscTourMount = () => {
  const tour = useEscTour();

  // A step that silently disappears is the failure mode of every anchored tour:
  // upstream renames a route, the step stops matching, and the tour just gets shorter
  // without anybody noticing. Naming the missing ids where a support person can read
  // them is the cheapest form of that alarm; it is not a substitute for a real
  // detector.
  useEffect(() => {
    if (tour.isOpen && tour.missingStepIds.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[esc-tour] ${tour.missingStepIds.length} step(s) skipped, anchor not found: ${tour.missingStepIds.join(', ')}`,
      );
    }
  }, [tour.isOpen, tour.missingStepIds]);

  return <EscTourOverlay tour={tour} />;
};
