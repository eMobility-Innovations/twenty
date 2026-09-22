import { useEffect } from 'react';
import { IconRoute } from 'twenty-ui/display';

import { EscTourOverlay } from '@/esc-tour/components/EscTourOverlay';
import { useEscTour } from '@/esc-tour/hooks/useEscTour';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';

/**
 * The sidebar entry that starts the tour, and the overlay it opens.
 *
 * Both live in one component so the fork touches exactly ONE upstream file
 * (`NavigationDrawerOtherSection`). Every additional upstream file the overlay edits is a
 * conflict to resolve on every upstream sync, so the count is kept at one on purpose.
 */
export const EscTourNavigationDrawerItem = () => {
  const tour = useEscTour();

  // A step that silently disappears is the failure mode of every anchored tour: upstream
  // renames a route, the step stops matching, and the tour just gets shorter without
  // anybody noticing. Naming the missing ids where a support person can read them is the
  // cheapest form of that alarm; it is not a substitute for a real detector.
  useEffect(() => {
    if (tour.isOpen && tour.missingStepIds.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[esc-tour] ${tour.missingStepIds.length} step(s) skipped, anchor not found: ${tour.missingStepIds.join(', ')}`,
      );
    }
  }, [tour.isOpen, tour.missingStepIds]);

  return (
    <>
      <NavigationDrawerItem
        label="Tour"
        Icon={IconRoute}
        onClick={tour.open}
      />
      <EscTourOverlay tour={tour} />
    </>
  );
};
