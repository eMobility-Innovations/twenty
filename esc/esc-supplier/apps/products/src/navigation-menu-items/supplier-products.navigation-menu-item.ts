import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import {
  SUPPLIER_PRODUCTS_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  SUPPLIER_PRODUCTS_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// Points at the curated view, not the bare object: the entry screen is the in-use products, not the raw table.
export default defineNavigationMenuItem({
  universalIdentifier: SUPPLIER_PRODUCTS_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  name: 'supplierProducts',
  icon: 'IconPackage',
  position: 7,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: SUPPLIER_PRODUCTS_VIEW_UNIVERSAL_IDENTIFIER,
});
