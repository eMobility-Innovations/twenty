import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import {
  SUPPLIER_FORM_RECIPIENT_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: SUPPLIER_FORM_RECIPIENT_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  name: 'form-recipients',
  icon: 'IconUserCheck',
  position: 2,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: SUPPLIER_FORM_RECIPIENT_OBJECT_UNIVERSAL_IDENTIFIER,
});
