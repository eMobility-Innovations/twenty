import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import {
  COMMITMENTS_DUE_VIEW_UNIVERSAL_IDENTIFIER,
  COMMITMENTS_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// Points at the curated view, not the bare object: the first screen is what is due, not the raw table.
export default defineNavigationMenuItem({
  universalIdentifier: COMMITMENTS_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  name: 'commitments',
  icon: 'IconTargetArrow',
  position: 6,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: COMMITMENTS_DUE_VIEW_UNIVERSAL_IDENTIFIER,
});
