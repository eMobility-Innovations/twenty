/**
 * Every selector the ESC tour points at, and the rules for building one.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE SCRIPT
 *
 * The script is copy. This is a claim about somebody else's markup. They rot for
 * different reasons and at different speeds: a wording change is ours to make, an anchor
 * breaks the day upstream renames an attribute. Keeping them apart means the file that
 * has to be re-read against upstream on every merge is small, and every line in it
 * carries the file:line it was read from.
 *
 * THE THREE RULES, IN ORDER OF PREFERENCE
 *
 * 1. `data-testid`, `data-click-outside-id` and `href` are the good hooks: they are code,
 *    they are the same string in every language, and upstream treats them as load-bearing
 *    (the command menu reads NAVIGATION_DRAWER_CLICK_OUTSIDE_ID; the e2e suite reads the
 *    test ids), so they do not move quietly.
 *
 * 2. `aria-controls` on a dropdown trigger is just as good and is the workhorse here. See
 *    `escTourDropdownTriggerAnchor`.
 *
 * 3. An `aria-label` is a LAST RESORT and every step using one is `optional: true`. Almost
 *    every aria-label in twenty-front is a lingui macro (`aria-label={t`Search`}`), so an
 *    aria-label anchor resolves in English and silently matches nothing in French — and a
 *    silent miss on a non-English workspace is indistinguishable from real upstream drift,
 *    which is the one thing this module exists to make visible.
 *
 * A generated class name (`css-1x2y3z`) is never an anchor. A HAND-WRITTEN class name is
 * allowed only as a descendant of a stable attribute — never on its own — because on its
 * own it says nothing about which of the several places that class is used it will match.
 *
 * Read against upstream on 2026-09-23, at the SHA this worktree is on. Paths below are
 * relative to `packages/twenty-front/src/` unless they name another package.
 */

/**
 * The navigation drawer's own element, and the scope almost every sidebar anchor is
 * qualified by.
 *
 * `NavigationDrawer` renders `data-click-outside-id={NAVIGATION_DRAWER_CLICK_OUTSIDE_ID}`
 * on its outermost container — modules/ui/navigation/navigation-drawer/components/
 * NavigationDrawer.tsx:122, value 'navigation-drawer' at
 * modules/ui/navigation/navigation-drawer/constants/NavigationDrawerClickOutsideId.ts:1.
 * The command menu reads the same constant to exclude the drawer from its click-outside
 * handling, so it is part of the product's behaviour and not decoration.
 *
 * This replaced `anchorAncestor: 'nav, aside'`, which never resolved: the drawer is
 * `styled.div` the whole way up, the only `<nav>` in twenty-front is the breadcrumb
 * wrapper and the only `<aside>` is the desktop side panel.
 */
export const ESC_TOUR_NAVIGATION_DRAWER_ANCHOR =
  '[data-click-outside-id="navigation-drawer"]';

/**
 * Scope a selector to the inside of the navigation drawer.
 *
 * Used for every anchor that is NOT unique on its own — a hand-written class name, a
 * translated `aria-label`. `.navigation-drawer-item` appears in the settings drawer too;
 * `button[aria-label="Search"]` could be any search button the product grows later.
 * Qualifying by the drawer turns "some element with this class" into "the one in the
 * sidebar", which is what the step actually means.
 */
export const escTourInNavigationDrawer = (selector: string): string =>
  `${ESC_TOUR_NAVIGATION_DRAWER_ANCHOR} ${selector}`;

/**
 * The selector that matches a sidebar link to an object's list, in BOTH the forms the
 * product renders it.
 *
 * `NavigationDrawerItemForObjectMetadataItem` builds its `to` with
 * `getAppPath(AppPath.RecordIndexPage, { objectNamePlural }, { viewId })`, and `getAppPath`
 * appends `?viewId=<uuid>` whenever a view id is present. A view id is present as soon as
 * the object has an index view, and also from the moment this browser has opened that list
 * once (`lastVisitedViewPerObjectMetadataItemState` is localStorage-backed, so it is
 * permanent per browser). An exact-match selector therefore matches on a brand-new
 * workspace and never again — which is exactly how the 2026-09-22 tour collapsed to two
 * slides in production.
 *
 * The second half is `^="…?"`, WITH the question mark, not a bare prefix: `/objects/orders`
 * is a prefix of `/objects/orderLines` and `/objects/tasks` of `/objects/taskTargets`, and
 * a tour that spotlights the wrong list is worse than one that spotlights nothing.
 */
export const escTourObjectAnchor = (objectNamePlural: string): string =>
  `a[href="/objects/${objectNamePlural}"], a[href^="/objects/${objectNamePlural}?"]`;

/**
 * The trigger of a dropdown, named by the dropdown's own id.
 *
 * `Dropdown` puts `aria-controls={`${dropdownId}-options`}` on the element that opens it —
 * modules/ui/layout/dropdown/components/Dropdown.tsx:202. Every `dropdownId` in the
 * product is a CODE CONSTANT, so this is the one hook on the view bar that is both stable
 * and locale-proof: the buttons themselves are `<Trans>Filter</Trans>` inside a styled div
 * with no attribute of its own (modules/views/components/ViewBarFilterButton.tsx:14), so
 * without this there would be nothing to point at but translated text.
 *
 * The trailing `-options` is the string `Dropdown` appends, not a convention we invented,
 * and it is what makes `escTourDropdownTriggerSuffixAnchor` below safe to use with `$=`.
 */
export const escTourDropdownTriggerAnchor = (dropdownId: string): string =>
  `[aria-controls="${dropdownId}-options"]`;

/**
 * The trigger of a dropdown whose id is generated at runtime, named by the fixed END of
 * that id.
 *
 * Used for the record table's column headings, whose dropdown id is
 * `recordField.fieldMetadataItemId + '-header'` (modules/object-record/record-table/
 * record-table-header/components/RecordTableColumnHeadWithDropdown.tsx:34). The uuid half
 * is unknowable when this file is written; the `-header` half is source text. `$=` on the
 * generated `-header-options` is therefore a claim about code, not about data.
 */
export const escTourDropdownTriggerSuffixAnchor = (suffix: string): string =>
  `[aria-controls$="${suffix}-options"]`;

/**
 * A row of the navigation drawer, named by its generated id.
 *
 * `NavigationDrawerItem` sets `id={navigationItemId}` (modules/ui/navigation/
 * navigation-drawer/components/NavigationDrawerItem.tsx:327), built by
 * `useNavigationDrawerTooltip` as `nav-item-${slugify(label)}` — modules/ui/navigation/
 * navigation-drawer/hooks/useNavigationDrawerTooltip.ts:5-11.
 *
 * EVERY STEP USING THIS IS `optional: true`, AND THAT IS NOT CAUTION, IT IS HONESTY.
 * Two separate reasons, either one sufficient:
 *
 *   - `slugify` comes from the `transliteration` package, which is not installed in this
 *     checkout, so NO literal value produced by this helper has ever been proven. Every
 *     one of them is a guess about a third-party function.
 *   - the label it slugifies is a lingui macro for every upstream row, so the id changes
 *     with the workspace's language.
 *
 * Our own Tour button passes a hard-coded English `label="Tour"`
 * (esc-tour/components/EscTourNavigationDrawerItem.tsx:25), so only the first reason
 * applies to it — which is still a reason.
 */
export const escTourNavigationItemAnchor = (slug: string): string =>
  `#nav-item-${slug}`;

/**
 * A section heading inside the navigation drawer — "Opened", "Favorites", "Workspace".
 *
 * `NavigationDrawerSectionTitle` renders `className="section-title-container"` on its
 * outer div (modules/ui/navigation/navigation-drawer/components/
 * NavigationDrawerSectionTitle.tsx:97). That class is hand-written and load-bearing: the
 * component's own linaria rules key off it (`.section-title-container:hover &`), so it
 * cannot be renamed without the hover states breaking, which is the property that makes a
 * class safe to anchor on at all.
 *
 * It matches the FIRST section heading in the drawer, in document order.
 * `NavigationDrawerOpenedSection` is rendered first in
 * modules/navigation/components/MainNavigationDrawerScrollableItems.tsx:41, and
 * `NavigationDrawerSectionForObjectMetadataItems` returns nothing at all when it has no
 * items (modules/object-metadata/components/NavigationDrawerSectionForObjectMetadataItems
 * .tsx:117) — so this is the "Opened" heading once a list is open, and the Favorites or
 * Workspace heading otherwise. Both are section headings, which is what the steps using it
 * say they are.
 */
export const ESC_TOUR_DRAWER_SECTION_TITLE_ANCHOR = escTourInNavigationDrawer(
  '.section-title-container',
);

/**
 * A sub-category (folder) row in the navigation drawer.
 *
 * MEASURED 2026-09-23: THERE ARE NO FOLDERS IN THE PRODUCTION WORKSPACE.
 * `core."navigationMenuItem"` holds 18 rows, every `folderId` is NULL and not one row is
 * of type FOLDER. The product supports folders; nobody here has made one.
 *
 * There is also no attribute that names a folder row. A folder header is an ordinary
 * `NavigationDrawerItem` (modules/navigation-menu-item/display/folder/components/
 * NavigationMenuItemFolderDnd.tsx:229-243) carrying the same `className="navigation-drawer
 * -item"` as every other row, and its container's only data attributes —
 * `data-drag-over-header`, `data-forbidden-drop-target` — are set to `undefined` unless a
 * drag is in progress (same file, 319-320).
 *
 * So this selector picks the folder row out by its SHAPE rather than by a name.
 * `NavigationDrawerItem` sets `role="button"` exactly when the row has no link and does
 * have right-hand options — `role={!to && isDefined(rightOptions) ? 'button' : undefined}`
 * at NavigationDrawerItem.tsx:341. An object link has a `to`, so it is a `<Link>` with no
 * role; the Settings row has neither a `to` nor right options, so it renders as a bare
 * `<button>` with no role attribute. A folder header has both. Today that is the only row
 * in the drawer this matches.
 *
 * It is a shape, not a contract, so the step using it is `optional: true` and is followed
 * immediately by a centred step that explains sub-categories without pointing at anything.
 */
export const ESC_TOUR_DRAWER_FOLDER_ANCHOR = escTourInNavigationDrawer(
  '.navigation-drawer-item[role="button"]',
);

/**
 * The workspace name, at the top of the sidebar.
 *
 * `MultiWorkspaceDropdownClickableComponent` renders `data-testid="workspace-dropdown"` —
 * modules/ui/navigation/navigation-drawer/components/MultiWorkspaceDropdown/internal/
 * MultiWorkspaceDropdownClickableComponent.tsx:31.
 */
export const ESC_TOUR_WORKSPACE_NAME_ANCHOR =
  '[data-testid="workspace-dropdown"]';

/**
 * The magnifying glass at the top of the sidebar.
 *
 * `NavigationDrawerHeader` renders a `LightIconButton` with `aria-label={t`Search`}` —
 * modules/ui/navigation/navigation-drawer/components/NavigationDrawerHeader.tsx:79. It has
 * no test id and no route, so the translated label is the only hook there is: rule 3
 * above, hence `optional: true` on the step that uses it.
 */
export const ESC_TOUR_SEARCH_BUTTON_ANCHOR = escTourInNavigationDrawer(
  'button[aria-label="Search"]',
);

/**
 * The page title in the top bar — "People", on the People list.
 *
 * `PageHeader` renders `data-testid="top-bar-title"` —
 * modules/ui/layout/page/components/PageHeader.tsx:136.
 */
export const ESC_TOUR_PAGE_TITLE_ANCHOR = '[data-testid="top-bar-title"]';

/**
 * One row of the record table.
 *
 * Both row components render `data-testid={`row-id-${recordId}`}` —
 * modules/object-record/record-table/record-table-row/components/RecordTableStaticTr.tsx:22
 * and RecordTableDraggableTr.tsx:60. The uuid half is data, the `row-id-` half is source
 * text, so `^=` is a claim about code. It matches the first row in document order.
 */
export const ESC_TOUR_TABLE_ROW_ANCHOR = '[data-testid^="row-id-"]';

/**
 * The block of a person's own fields on their record page.
 *
 * `RecordFieldList` renders `<PropertyBox dataTestId="record-fields-list-container">`
 * (modules/object-record/record-field-list/components/RecordFieldList.tsx:96) and
 * `PropertyBox` puts it on the element as `data-testid`
 * (modules/object-record/record-field-list/property-box/components/PropertyBox.tsx:41).
 */
export const ESC_TOUR_RECORD_FIELDS_ANCHOR =
  '[data-testid="record-fields-list-container"]';

/**
 * A section of records joined to the one being looked at — their orders, their repairs.
 *
 * `RecordDetailRelationSection` builds its test id as
 * `${fieldDefinition.label.toLowerCase().replace(' ', '-')}-relation` —
 * modules/object-record/record-field-list/record-detail-section/relation/components/
 * RecordDetailRelationSection.tsx:191. The label half is translated, the `-relation`
 * suffix is source text, so matching on the SUFFIX is locale-proof where matching on the
 * whole value would not be.
 */
export const ESC_TOUR_RECORD_RELATION_ANCHOR = '[data-testid$="-relation"]';

/**
 * One joined record inside such a section.
 *
 * `RecordDetailRelationRecordsListItem` renders
 * `data-testid="record-detail-records-list-item"` — same directory,
 * RecordDetailRelationRecordsListItem.tsx:221.
 */
export const ESC_TOUR_RECORD_RELATION_ITEM_ANCHOR =
  '[data-testid="record-detail-records-list-item"]';

/**
 * A tab along the top of a record page.
 *
 * `TabButton` renders `data-testid={disableTestId ? undefined : `tab-${id}`}` —
 * packages/twenty-ui/src/input/button/components/TabButton/TabButton.tsx:50. The tab ids
 * are code, the `tab-` prefix is code, and the hidden measuring copies of the tab row pass
 * `disableTestId` (modules/ui/layout/tab-list/components/TabListHiddenMeasurements.tsx:56)
 * so they are excluded.
 *
 * NOT PROVEN TO BE RECORD-PAGE-ONLY. `PageLayoutTabList` is shared page-layout machinery
 * and this session did not establish whether a record INDEX page renders a tab row too.
 * The step using it is `optional: true` and its copy describes what a tab row is, which
 * stays true of whichever one it lands on.
 */
export const ESC_TOUR_RECORD_TAB_ANCHOR = '[data-testid^="tab-"]';

/**
 * The dropdown ids the view bar's controls are registered under, read off upstream's own
 * constants rather than retyped as strings at the call site.
 *
 *   VIEW_PICKER    modules/views/view-picker/constants/ViewPickerDropdownId.ts:1
 *   FILTER         modules/views/constants/ViewBarFilterDropdownIds.ts (enum member MAIN)
 *   SORT           modules/object-record/object-sort-dropdown/constants/
 *                  ObjectSortDropdownId.ts:1
 *   OPTIONS        modules/object-record/object-options-dropdown/constants/
 *                  ObjectOptionsDropdownId.ts:1
 *
 * They are copied here rather than imported because this module must not depend on
 * upstream source: the overlay is applied onto a compiled upstream image and an import
 * that upstream later moves would fail the BUILD, where a copied string that upstream
 * later changes only costs the one step it anchors — which is then named in
 * `missingStepIds`. A miss is the cheaper failure, and it is the visible one.
 *
 * Note SORT: the id in force is OBJECT_SORT_DROPDOWN_ID ('sort-dropdown'), which is what
 * `ObjectSortDropdownButton` passes as its `dropdownId`
 * (modules/object-record/object-sort-dropdown/components/ObjectSortDropdownButton.tsx:170).
 * `VIEW_SORT_DROPDOWN_ID` ('view-sort') also exists and is the COMPONENT INSTANCE id the
 * view bar provides (modules/views/components/ViewBar.tsx:46); it is not the dropdown's.
 * Anchoring on it would have matched nothing, and looked exactly like drift.
 */
export const ESC_TOUR_VIEW_PICKER_DROPDOWN_ID = 'view-picker';
export const ESC_TOUR_FILTER_DROPDOWN_ID = 'view-bar-main-filter-dropdown-id';
export const ESC_TOUR_SORT_DROPDOWN_ID = 'sort-dropdown';
export const ESC_TOUR_OPTIONS_DROPDOWN_ID = 'object-options-dropdown-id';

/** The saved-view selector at the left of the view bar. */
export const ESC_TOUR_VIEW_PICKER_ANCHOR = escTourDropdownTriggerAnchor(
  ESC_TOUR_VIEW_PICKER_DROPDOWN_ID,
);

/** The Filter button at the right of the view bar. */
export const ESC_TOUR_FILTER_ANCHOR = escTourDropdownTriggerAnchor(
  ESC_TOUR_FILTER_DROPDOWN_ID,
);

/** The Sort button, beside Filter. */
export const ESC_TOUR_SORT_ANCHOR = escTourDropdownTriggerAnchor(
  ESC_TOUR_SORT_DROPDOWN_ID,
);

/** The options menu at the far right of the view bar. */
export const ESC_TOUR_OPTIONS_ANCHOR = escTourDropdownTriggerAnchor(
  ESC_TOUR_OPTIONS_DROPDOWN_ID,
);

/** A column heading in the record table. See `escTourDropdownTriggerSuffixAnchor`. */
export const ESC_TOUR_COLUMN_HEADING_ANCHOR =
  escTourDropdownTriggerSuffixAnchor('-header');

/**
 * Our own Tour button in the sidebar. `optional: true` — see
 * `escTourNavigationItemAnchor` for why a `#nav-item-…` id is never a proven value.
 */
export const ESC_TOUR_TOUR_BUTTON_ANCHOR = escTourNavigationItemAnchor('tour');

/**
 * The Settings row in the drawer's "Other" section.
 *
 * `NavigationDrawerOtherSection` renders `<NavigationDrawerItem label={t`Settings`} …>`
 * with an `onClick` and no `to` (modules/navigation/components/NavigationDrawerOtherSection
 * .tsx:56-60), so there is no href to anchor on and the generated id is the only hook —
 * built from a TRANSLATED label. `optional: true`, both reasons.
 */
export const ESC_TOUR_SETTINGS_ROW_ANCHOR =
  escTourNavigationItemAnchor('settings');
