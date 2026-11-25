import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import {
  AGREEMENTS_IN_FORCE_VIEW_UNIVERSAL_IDENTIFIER,
  AGREEMENTS_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// Points at the curated view, not the bare object: an agreement is judged in force, not in the raw table.
export default defineNavigationMenuItem({
  universalIdentifier: AGREEMENTS_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  name: 'agreements',
  icon: 'IconFileCertificate',
  position: 5,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: AGREEMENTS_IN_FORCE_VIEW_UNIVERSAL_IDENTIFIER,
});
