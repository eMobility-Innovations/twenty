import {
  ESC_TOUR_COLUMN_HEADING_ANCHOR,
  ESC_TOUR_DRAWER_FOLDER_ANCHOR,
  ESC_TOUR_DRAWER_SECTION_TITLE_ANCHOR,
  ESC_TOUR_FILTER_ANCHOR,
  ESC_TOUR_NAVIGATION_DRAWER_ANCHOR,
  ESC_TOUR_OPTIONS_ANCHOR,
  ESC_TOUR_PAGE_TITLE_ANCHOR,
  ESC_TOUR_RECORD_FIELDS_ANCHOR,
  ESC_TOUR_RECORD_RELATION_ANCHOR,
  ESC_TOUR_RECORD_RELATION_ITEM_ANCHOR,
  ESC_TOUR_RECORD_TAB_ANCHOR,
  ESC_TOUR_SEARCH_BUTTON_ANCHOR,
  ESC_TOUR_SETTINGS_ROW_ANCHOR,
  ESC_TOUR_SORT_ANCHOR,
  ESC_TOUR_TABLE_ROW_ANCHOR,
  ESC_TOUR_TOUR_BUTTON_ANCHOR,
  ESC_TOUR_VIEW_PICKER_ANCHOR,
  ESC_TOUR_WORKSPACE_NAME_ANCHOR,
  escTourObjectAnchor,
} from '@/esc-tour/constants/escTourAnchors';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';

/**
 * Re-exported so that `escTourObjectAnchor` keeps the import path it has had since the
 * tour shipped. The helper's home is now `escTourAnchors.ts`, beside the rest of the
 * selectors; this line exists because `__tests__/resolveEscTourAnchor.test.ts` imports it
 * from here, and moving a symbol is not a reason to edit a test that is about something
 * else.
 */
export { escTourObjectAnchor };

/**
 * The chapters, in the order the tour walks them.
 *
 * A chapter has no behaviour, only a name — steps carry the string and the popover prints
 * it. It is declared here anyway, once, so that a typo in one step's chapter cannot
 * silently open a sixth chapter of one step, and so that the test which asserts the
 * chapters run in order has something to assert against.
 */
export const ESC_TOUR_CHAPTERS = [
  'Where you are',
  'The left panel',
  'A list of records',
  'One customer page',
  'Getting around',
] as const;

export type EscTourChapter = (typeof ESC_TOUR_CHAPTERS)[number];

const [
  CHAPTER_WHERE_YOU_ARE,
  CHAPTER_LEFT_PANEL,
  CHAPTER_A_LIST,
  CHAPTER_ONE_CUSTOMER,
  CHAPTER_GETTING_AROUND,
] = ESC_TOUR_CHAPTERS;

/**
 * The one page this tour walks to.
 *
 * People, and nothing else. MEASURED on the production workspace on 2026-09-23: people
 * 25,418 records, orders 13,858, order lines 18,192, interactions 5,799, repairs 499,
 * opportunities 334, companies 104 — and tasks 0, notes 0. Walking a new starter into an
 * empty list teaches them the product is empty, so the tour describes Tasks in the panel
 * (which is where the idea of a task belongs) and never opens it.
 */
const PEOPLE_ROUTE = '/objects/people';

/**
 * The ESC guided tour, as data.
 *
 * Copy lives here as plain strings, not as JSX, so a wording change is a one-line edit and
 * never a component change. Anchors live in `escTourAnchors.ts`, each with the upstream
 * file:line it was read from, because they rot for a different reason than the words do.
 *
 * WHAT A READER WHO HAS NEVER SEEN A CRM IS OWED
 *
 * Short sentences, no jargon, and every body DESCRIBES rather than instructs. The tour
 * holds an interaction lock that swallows every click outside the popover — by design,
 * because the "Add new record" control writes a blank row the instant it is touched — so
 * a step saying "click this" asks for something the product will refuse while the tour is
 * open, and the reader concludes the CRM is broken. `escTourSteps.test.ts` fails on
 * click/tap/press in any anchored step.
 *
 * WHY SOME STEPS POINT AT NOTHING ON PURPOSE
 *
 * A centred step (no `anchor`) can never be dropped and never waits. Three kinds of thing
 * are written that way here:
 *
 *   - an idea with no element behind it (what a sub-category IS);
 *   - a surface upstream gives no stable hook for (the record table's own container is an
 *     unadorned `styled.div`; the view bar's in-list search only exists once a search is
 *     already running);
 *   - anything on a ROUTED step that would usually be absent — because a routed step whose
 *     anchor never appears costs the reader ESC_TOUR_ANCHOR_DEADLINE_MS (8 seconds) of
 *     "the page is opening" before it is dropped. `optional: true` silences the report; it
 *     does not shorten the wait. A step that is usually absent and always routed is 8
 *     seconds of dead tour on every single run, so it is written centred instead.
 */
export const ESC_TOUR_STEPS: EscTourStep[] = [
  // ---------------------------------------------------------------------------------
  // 1. Where you are. No navigation: everything here is on screen on every page of the
  //    product, so the tour shows it wherever the reader happened to press Tour.
  // ---------------------------------------------------------------------------------
  {
    id: 'welcome',
    chapter: CHAPTER_WHERE_YOU_ARE,
    title: 'Welcome to the CRM',
    body: 'This is where every customer, order and repair lives in one place. A few minutes and you will know your way around. You can stop at any point.',
  },
  {
    id: 'sidebar',
    chapter: CHAPTER_WHERE_YOU_ARE,
    title: 'Everything starts here',
    body: 'The strip down the left is your map. Each entry on it is one kind of thing — people, companies, orders, repairs — and it holds the whole list.',
    anchor: ESC_TOUR_NAVIGATION_DRAWER_ANCHOR,
    padding: 8,
  },
  {
    id: 'workspace-name',
    chapter: CHAPTER_WHERE_YOU_ARE,
    title: 'Whose CRM this is',
    body: 'The name at the top is the workspace you are signed in to. Everyone here shares it, so what you can see is what your colleagues can see.',
    anchor: ESC_TOUR_WORKSPACE_NAME_ANCHOR,
  },
  {
    // optional: the only hook is a translated aria-label. See ESC_TOUR_SEARCH_BUTTON_ANCHOR.
    id: 'search',
    chapter: CHAPTER_WHERE_YOU_ARE,
    title: 'Search',
    body: 'The magnifying glass looks through everything at once — people, companies, orders, repairs. It is the fastest way in when all you have is a name.',
    anchor: ESC_TOUR_SEARCH_BUTTON_ANCHOR,
    optional: true,
  },

  // ---------------------------------------------------------------------------------
  // 2. The left panel. Still no navigation.
  //
  //    MEASURED 2026-09-23: the live sidebar has EIGHTEEN entries — seven pinned views
  //    (companies, dashboards, notes, opportunities, people, tasks, workflows) and eleven
  //    pinned objects (checklistTemplates, orders, orderLines, postalAddresses,
  //    interactions, repairs, households, callbackCampaigns, householdMemberships,
  //    personAddressLinks, companyAddressLinks). A step per entry would be a worse tour,
  //    not a fuller one: the six below are the ones somebody uses on their first day, and
  //    `panel-other-lists` explains the shape of the remaining twelve in one breath.
  // ---------------------------------------------------------------------------------
  {
    // optional: a workspace with nothing pinned and no favourites renders no section
    // heading at all, and that is a fact about the workspace, not drift.
    id: 'panel-sections',
    chapter: CHAPTER_LEFT_PANEL,
    title: 'The panel comes in groups',
    body: 'A small grey heading marks a group of entries. Groups keep the panel readable as it grows, and each one folds away when you do not need it.',
    anchor: ESC_TOUR_DRAWER_SECTION_TITLE_ANCHOR,
    optional: true,
  },
  {
    id: 'people',
    chapter: CHAPTER_LEFT_PANEL,
    title: 'People',
    body: 'Every individual customer we have ever dealt with. A person shows their orders, their repairs and every message they have sent us, on one page.',
    anchor: escTourObjectAnchor('people'),
    objectNamePlural: 'people',
  },
  {
    id: 'companies',
    chapter: CHAPTER_LEFT_PANEL,
    title: 'Companies',
    body: 'The business customers. A company holds its own people, so a trade account and the staff who work there stay joined up.',
    anchor: escTourObjectAnchor('companies'),
    objectNamePlural: 'companies',
  },
  {
    id: 'orders',
    chapter: CHAPTER_LEFT_PANEL,
    title: 'Orders',
    body: 'Sales, brought in automatically from BaseLinker. This is where you read them. Orders are still placed and changed in BaseLinker, not here.',
    anchor: escTourObjectAnchor('orders'),
    objectNamePlural: 'orders',
  },
  {
    id: 'repairs',
    chapter: CHAPTER_LEFT_PANEL,
    title: 'Repairs',
    body: 'Jobs from the workshop system. Same idea as orders: here you see the whole customer, and the workshop system is still where a job is worked.',
    anchor: escTourObjectAnchor('repairs'),
    objectNamePlural: 'repairs',
  },
  {
    id: 'interactions',
    chapter: CHAPTER_LEFT_PANEL,
    title: 'Interactions',
    body: 'Emails and chats with customers, gathered from the support inboxes, so what was already said to someone is there before you reply.',
    anchor: escTourObjectAnchor('interactions'),
    objectNamePlural: 'interactions',
  },
  {
    id: 'tasks',
    chapter: CHAPTER_LEFT_PANEL,
    title: 'Tasks',
    body: 'Something one of us owes a customer. A task has an owner and stays attached to the customer it is about, so it cannot get lost in an inbox.',
    anchor: escTourObjectAnchor('tasks'),
    objectNamePlural: 'tasks',
  },
  {
    // Centred on purpose: this step is ABOUT the twelve entries it is not naming, and
    // pointing at any one of them would say the opposite of what the words say.
    id: 'panel-other-lists',
    chapter: CHAPTER_LEFT_PANEL,
    title: 'The rest of the panel',
    body: 'The other entries are smaller lists — addresses, order lines, households and so on. Same idea, one kind of thing each. Most days you will not need them.',
  },
  {
    // optional, and matched by SHAPE rather than by name — see ESC_TOUR_DRAWER_FOLDER_ANCHOR.
    // MEASURED 2026-09-23: core."navigationMenuItem" holds 18 rows, every folderId NULL,
    // zero rows of type FOLDER. Nobody has made a sub-category yet, so today this step is
    // dropped quietly and the centred one below carries the idea on its own. The day
    // somebody makes one, this step starts appearing with no change here.
    id: 'sub-category-folder',
    chapter: CHAPTER_LEFT_PANEL,
    title: 'A sub-category',
    body: 'A row like this one is a sub-category: several lists kept together under a single name, so things that belong together sit together.',
    anchor: ESC_TOUR_DRAWER_FOLDER_ANCHOR,
    optional: true,
  },
  {
    // The operator asked specifically for sub-categories, and the workspace has none. A
    // centred step has no anchor, so it can never be dropped — the ask is met today, and
    // gets a spotlight the moment the step above it starts resolving.
    id: 'sub-category-explained',
    chapter: CHAPTER_LEFT_PANEL,
    title: 'Making a sub-category',
    body: 'Sub-categories are yours to make: group a few lists together and give the group a name. Nobody in this workspace has made one yet.',
  },
  {
    // Centred: the headings that would distinguish the two are translated strings inside
    // an unadorned div, so pointing at one would work in English and silently miss
    // everywhere else. The distinction is an idea, and the idea survives without a target.
    id: 'personal-vs-shared',
    chapter: CHAPTER_LEFT_PANEL,
    title: 'Personal and shared',
    body: 'Some of the panel is only yours — what you pinned, in the order you like. The rest belongs to the whole workspace and looks the same for everyone.',
  },
  {
    // optional: the id is built from a TRANSLATED label by a slugify we cannot run here.
    // See escTourNavigationItemAnchor.
    id: 'settings-row',
    chapter: CHAPTER_LEFT_PANEL,
    title: 'Settings',
    body: 'Near the bottom, Settings holds your own account — your name, your password, your notifications — and, for some people, how the workspace itself is set up.',
    anchor: ESC_TOUR_SETTINGS_ROW_ANCHOR,
    optional: true,
  },

  // ---------------------------------------------------------------------------------
  // 3. A list of records. THE TOUR'S ONE NAVIGATION.
  //
  //    Every step here carries `route`, so it is kept in the run at open() and judged
  //    once the tour has actually arrived — it cannot be judged before, because at open()
  //    nobody has been to this page yet. It also carries `objectNamePlural`, which is not
  //    decoration: scripts/verify-esc-tour.sh derives the route list it checks against the
  //    live workspace by grepping the objectNamePlural declarations out of THIS file, so a
  //    routed step without one is a step the deploy-time alarm cannot see. (That grep is
  //    why no comment in this file may spell the declaration out with a quoted value: the
  //    script cannot tell a comment from a step, and would carry the example into the
  //    alarm as a route the workspace has never heard of.)
  // ---------------------------------------------------------------------------------
  {
    id: 'list-arriving',
    chapter: CHAPTER_A_LIST,
    title: 'This is the People list',
    body: 'Every list in the CRM looks like this one. The title says which kind of thing you are looking at; everything below it is that kind of thing.',
    anchor: ESC_TOUR_PAGE_TITLE_ANCHOR,
    objectNamePlural: 'people',
    route: PEOPLE_ROUTE,
  },
  {
    // optional: the Opened group only exists while a list is open, which is exactly now —
    // but a workspace where the section has been collapsed would not render it.
    id: 'list-opened-group',
    chapter: CHAPTER_A_LIST,
    title: 'Where you are, in the panel',
    body: 'The panel now shows an Opened group holding the list you are standing in. It tells you where you are, and it goes away when you leave.',
    anchor: ESC_TOUR_DRAWER_SECTION_TITLE_ANCHOR,
    objectNamePlural: 'people',
    route: PEOPLE_ROUTE,
    optional: true,
  },
  {
    id: 'list-view-picker',
    chapter: CHAPTER_A_LIST,
    title: 'Saved views',
    body: 'A view is a saved way of looking at the same list: a set of filters, an order, a choice of columns. This is where you move between them.',
    anchor: ESC_TOUR_VIEW_PICKER_ANCHOR,
    objectNamePlural: 'people',
    route: PEOPLE_ROUTE,
  },
  {
    // Centred: the table's own container is an unadorned styled div with no attribute of
    // its own, and the alternatives — a row, a heading — are the two steps below. A
    // routed step pointing at something that is not there costs 8 seconds; describing the
    // grid costs none, and the grid is the whole screen anyway.
    id: 'list-table',
    chapter: CHAPTER_A_LIST,
    title: 'The grid',
    body: 'The list itself is a grid: one line per person, one column per piece of information. It scrolls sideways when there are more columns than fit.',
    objectNamePlural: 'people',
    route: PEOPLE_ROUTE,
  },
  {
    // optional: a saved view can legitimately be filtered down to nothing.
    id: 'list-row',
    chapter: CHAPTER_A_LIST,
    title: 'One line, one person',
    body: 'Each line is a single customer. The line is only a summary — everything we know about them sits on a page of their own behind it.',
    anchor: ESC_TOUR_TABLE_ROW_ANCHOR,
    objectNamePlural: 'people',
    route: PEOPLE_ROUTE,
    optional: true,
  },
  {
    // optional: a view with every column hidden has no heading to point at.
    id: 'list-column-heading',
    chapter: CHAPTER_A_LIST,
    title: 'A column',
    body: 'A heading names what the column beneath it holds. Columns can be widened, moved and hidden, and each view remembers how you left them.',
    anchor: ESC_TOUR_COLUMN_HEADING_ANCHOR,
    objectNamePlural: 'people',
    route: PEOPLE_ROUTE,
    optional: true,
  },
  {
    // Centred, and this one is a judgement call worth stating. Searching inside a list is
    // real, but its control — the any-field search chip — is only rendered once a search
    // is ALREADY running (ViewBarDetails.tsx:253 guards it on shouldShowAnyFieldSearchChip),
    // so on a freshly opened list there is nothing there. Anchoring it would mean 8
    // seconds of "the page is opening" on essentially every run, to then drop the step.
    id: 'list-search',
    chapter: CHAPTER_A_LIST,
    title: 'Finding someone in a list',
    body: 'Searching inside one list lives in the Filter menu, as a search across every field at once. The magnifying glass in the panel searches everything instead.',
    objectNamePlural: 'people',
    route: PEOPLE_ROUTE,
  },
  {
    id: 'list-filter',
    chapter: CHAPTER_A_LIST,
    title: 'Filter',
    body: 'A filter narrows the list to the lines you care about — one town, one month, one status. Several filters together narrow it further.',
    anchor: ESC_TOUR_FILTER_ANCHOR,
    objectNamePlural: 'people',
    route: PEOPLE_ROUTE,
  },
  {
    id: 'list-sort',
    chapter: CHAPTER_A_LIST,
    title: 'Sort',
    body: 'Sorting puts the list in an order: newest first, largest first, by name. It changes what is at the top, never what is in the list.',
    anchor: ESC_TOUR_SORT_ANCHOR,
    objectNamePlural: 'people',
    route: PEOPLE_ROUTE,
  },
  {
    id: 'list-options',
    chapter: CHAPTER_A_LIST,
    title: 'The options menu',
    body: 'The rest of how this list looks lives here: which columns show, how the lines are grouped, and how a view of your own is saved.',
    anchor: ESC_TOUR_OPTIONS_ANCHOR,
    objectNamePlural: 'people',
    route: PEOPLE_ROUTE,
  },

  // ---------------------------------------------------------------------------------
  // 4. One customer page. EVERY STEP OPTIONAL, AND NOT ONE OF THEM ROUTED. WHY:
  //
  //    A record page is served at AppPath.RecordShowPage —
  //    '/object/:objectNameSingular/:objectRecordId' (twenty-shared/src/types/AppPath.ts:25)
  //    — so reaching one means knowing a uuid. "The first person on the list" has no uuid
  //    that can be written down here: it changes with the sort, and hard-coding a live
  //    customer's id into shipped source would both put a real person in the repository
  //    and break the day that record is deleted. Navigating to '/object/person' without an
  //    id reaches the not-found page, which is worse than showing nothing.
  //
  //    The other option was `route: '/objects/people'`, which navigates nowhere (the tour
  //    is already there from chapter 3) and would therefore spend 8 seconds per step
  //    waiting for a record page that is not open — around half a minute of dead tour on
  //    EVERY run, every time.
  //
  //    So these steps are route-less: they are judged at open(), against the page the
  //    reader pressed Tour on. Press it while looking at a customer and the chapter is
  //    there; press it anywhere else and it is dropped at open, quietly, for free. The
  //    first step is centred, so the idea of a customer's own page survives either way.
  // ---------------------------------------------------------------------------------
  {
    id: 'person-page',
    chapter: CHAPTER_ONE_CUSTOMER,
    title: 'A page of their own',
    body: 'Every line in that list opens a page belonging to one customer. It gathers them in one place: their details, their orders, their repairs, their messages.',
    optional: true,
  },
  {
    id: 'person-details',
    chapter: CHAPTER_ONE_CUSTOMER,
    title: 'Their details',
    body: 'This block holds what we know about the person themselves — name, phone, email, address. Each line is one fact, and anyone with permission can change it.',
    anchor: ESC_TOUR_RECORD_FIELDS_ANCHOR,
    optional: true,
  },
  {
    id: 'person-joined',
    chapter: CHAPTER_ONE_CUSTOMER,
    title: 'What is joined to them',
    body: 'Underneath sit the things attached to this customer: their orders, their repairs, their conversations. Each section is the live list, not a copy of it.',
    anchor: ESC_TOUR_RECORD_RELATION_ANCHOR,
    optional: true,
  },
  {
    id: 'person-joined-record',
    chapter: CHAPTER_ONE_CUSTOMER,
    title: 'One joined record',
    body: 'A single order or repair, in short. It is the same record the main list holds, so a change made in one place is the change everybody sees.',
    anchor: ESC_TOUR_RECORD_RELATION_ITEM_ANCHOR,
    optional: true,
  },
  {
    id: 'person-tabs',
    chapter: CHAPTER_ONE_CUSTOMER,
    title: 'The tabs',
    body: 'The tabs along the top split a crowded page into parts you can read one at a time. The page remembers the tab you left it on.',
    anchor: ESC_TOUR_RECORD_TAB_ANCHOR,
    optional: true,
  },

  // ---------------------------------------------------------------------------------
  // 5. Getting around. No navigation, and the tour ends where the reader is standing.
  // ---------------------------------------------------------------------------------
  {
    // Centred: this is about a keystroke, and the menu it opens is not on screen to point
    // at. Read off modules/command-menu/hooks/useCommandMenuHotKeys.ts:37, which binds
    // 'ctrl+k' and 'meta+k'.
    id: 'keyboard-command-menu',
    chapter: CHAPTER_GETTING_AROUND,
    title: 'Two keys worth knowing',
    body: 'Ctrl and K together on Windows, Cmd and K on a Mac, open a menu you can type into. It reaches any record and any action without going through the panel.',
  },
  {
    // Escape: modules/command-menu/hooks/useCommandMenuHotKeys.ts:73 closes the command
    // menu, DropdownInternalContainer.tsx:121 closes a dropdown, and useEscTour closes
    // this tour. One key, the same meaning everywhere.
    id: 'keyboard-escape',
    chapter: CHAPTER_GETTING_AROUND,
    title: 'And Escape',
    body: 'Escape closes whatever is open — a menu, a panel, this tour. When something is in the way and you would rather it were not, Escape is the way out.',
  },
  {
    // optional: a #nav-item-… id is never a proven value in this checkout. See
    // escTourNavigationItemAnchor. Our own button, so at least the label is not translated.
    id: 'tour-again',
    chapter: CHAPTER_GETTING_AROUND,
    title: 'The Tour button',
    body: 'This is where the tour lives. It stays in the panel for good, and running it again is free — the tour only ever describes things, it never changes them.',
    anchor: ESC_TOUR_TOUR_BUTTON_ANCHOR,
    optional: true,
  },
  {
    // The closing step is unanchored, which is the one place the word "click" is allowed:
    // the interaction lock is about to lift, and this is the only way back in.
    id: 'done',
    chapter: CHAPTER_GETTING_AROUND,
    title: 'That is the tour',
    body: 'Click Tour in the sidebar whenever you want to see it again. Nothing you do in the tour changes any data.',
  },
];

/**
 * The object routes this script depends on, in script order, each named once.
 *
 * The deploy-time check (`scripts/verify-esc-tour.sh`) compares this list against the live
 * workspace's `core."objectMetadata"`. Read the routes from here rather than by mining the
 * selector strings — the selectors are derived from these values, not the other way round.
 *
 * De-duplicated, because chapter 3 is ten steps about one object and a route repeated ten
 * times in an alarm's input is noise in every message that alarm ever sends. The order of
 * first appearance is kept, which is what a Set preserves.
 */
export const ESC_TOUR_OBJECT_ROUTES: string[] = [
  ...new Set(
    ESC_TOUR_STEPS.map((step) => step.objectNamePlural).filter(
      (route): route is string => route !== undefined,
    ),
  ),
];
