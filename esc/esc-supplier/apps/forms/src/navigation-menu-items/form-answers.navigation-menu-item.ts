import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import {
  SUPPLIER_FORM_ANSWER_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  SUPPLIER_FORM_ANSWER_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: SUPPLIER_FORM_ANSWER_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  name: 'form-answers',
  icon: 'IconChecklist',
  position: 3,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: SUPPLIER_FORM_ANSWER_OBJECT_UNIVERSAL_IDENTIFIER,
});
