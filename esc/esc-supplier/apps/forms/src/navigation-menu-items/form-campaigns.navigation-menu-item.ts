import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import {
  SUPPLIER_FORM_CAMPAIGN_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: SUPPLIER_FORM_CAMPAIGN_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  name: 'form-campaigns',
  icon: 'IconSend',
  position: 1,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: SUPPLIER_FORM_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
});
