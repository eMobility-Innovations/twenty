import { useCallback } from 'react';
// IconMap, not IconRoute: twenty-ui/display re-exports a HAND-PICKED subset of Tabler,
// and IconRoute is in the internal AllIcons registry but not in that subset. The bundle
// build is what says so, with "not exported by twenty-ui/dist/display.mjs". Check
// packages/twenty-ui/src/display/index.ts before reaching for an icon name; being in
// AllIcons.ts is not the same as being exported.
import { IconMap } from 'twenty-ui/display';

import { ESC_TOUR_STEPS } from '@/esc-tour/constants/escTourSteps';
import { openEscTour } from '@/esc-tour/hooks/useEscTourStore';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';

/**
 * The sidebar entry that STARTS the tour. The tour itself is rendered by
 * `EscTourMount`, which sits outside the collapsible section so collapsing "Other"
 * cannot destroy a running tour — see that component for why the two are apart.
 */
export const EscTourNavigationDrawerItem = () => {
  const handleClick = useCallback(() => {
    openEscTour(ESC_TOUR_STEPS);
  }, []);

  return (
    <NavigationDrawerItem
      label="Tour"
      Icon={IconMap}
      onClick={handleClick}
      // WITHOUT THIS THE BUTTON CANNOT BE STARTED FROM THE KEYBOARD. Upstream's
      // `useMouseDownNavigation` defaults triggerEvent to 'MOUSE_DOWN' and only calls
      // onClick from its click handler when triggerEvent is 'CLICK'; a native <button>
      // fires 'click' but NOT 'mousedown' when it is activated with Enter or Space, so
      // on the default the handler ran, hit `event.preventDefault()` and did nothing
      // else. 'CLICK' keeps the mouse working too — the same hook's mousedown handler
      // returns early on this value, so a mouse press opens the tour exactly once, from
      // the click.
      triggerEvent="CLICK"
      // WITHOUT THIS, TAPPING TOUR ON A PHONE HIDES WHAT THE TOUR POINTS AT. The item's
      // onBeforeNavigation collapses the navigation drawer whenever the viewport is
      // 768px or narrower. The drawer's links stay in the DOM, so every anchored step
      // still resolves and nothing warns — the tour cheerfully spotlights a clipped,
      // zero-width region. 320, 375 and a 768 counter tablet were all affected.
      preventCollapseOnMobile
    />
  );
};
