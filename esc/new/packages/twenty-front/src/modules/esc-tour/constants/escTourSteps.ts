import { type EscTourStep } from '@/esc-tour/types/EscTourStep';

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
 * workspace and never again.
 *
 * The second half is `^="…?"`, WITH the question mark, not a bare prefix: `/objects/people`
 * is a prefix of `/objects/peoplefoo`, and a tour that spotlights the wrong list is worse
 * than one that spotlights nothing.
 */
export const escTourObjectAnchor = (objectNamePlural: string): string =>
  `a[href="/objects/${objectNamePlural}"], a[href^="/objects/${objectNamePlural}?"]`;

/**
 * The navigation drawer's own element.
 *
 * `NavigationDrawer` renders `data-click-outside-id="navigation-drawer"` on its outermost
 * container (the value is `NAVIGATION_DRAWER_CLICK_OUTSIDE_ID`, which the command menu also
 * reads, so it is load-bearing upstream and not decoration). Everything in the sidebar —
 * the object links and the Tour button — sits inside it.
 *
 * This replaced `anchorAncestor: 'nav, aside'`, which never resolved: the drawer is
 * `styled.div` the whole way up, the only `<nav>` in twenty-front is the breadcrumb wrapper
 * and the only `<aside>` is the desktop side panel.
 */
const NAVIGATION_DRAWER_ANCHOR = '[data-click-outside-id="navigation-drawer"]';

/**
 * The ESC tour script.
 *
 * Copy lives here as data, not as JSX, so a wording change is a one-line edit to a plain
 * string and never a component change.
 *
 * Every anchor is a route the workspace actually serves, or the drawer's own stable
 * attribute. The object routes below were read off the production workspace's
 * `core."objectMetadata"` on 2026-09-22; an object that is later renamed or deactivated
 * makes its step vanish from the tour rather than break it, and `useEscTour` reports the id
 * that vanished.
 *
 * Nothing here tells the reader to click the thing being spotlighted — the tour's
 * interaction lock swallows those clicks. Each step says what the thing IS and what it is
 * for.
 */
export const ESC_TOUR_STEPS: EscTourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to the CRM',
    body: 'This is where every customer, order and repair lives in one place. Two minutes and you will know your way around. You can stop at any point.',
  },
  {
    id: 'sidebar',
    title: 'Everything starts here',
    body: 'The strip down the left is your map. Each entry on it is one kind of thing — people, companies, orders, repairs — and it holds the whole list.',
    anchor: NAVIGATION_DRAWER_ANCHOR,
    padding: 8,
  },
  {
    id: 'people',
    title: 'People',
    body: 'Every individual customer we have ever dealt with. A person shows their orders, their repairs and every message they have sent us, on one page.',
    anchor: escTourObjectAnchor('people'),
    objectNamePlural: 'people',
  },
  {
    id: 'companies',
    title: 'Companies',
    body: 'The business customers. A company holds its own people, so a trade account and the staff who work there stay joined up.',
    anchor: escTourObjectAnchor('companies'),
    objectNamePlural: 'companies',
  },
  {
    id: 'orders',
    title: 'Orders',
    body: 'Sales, brought in automatically from BaseLinker. This is where you read them. Orders are still placed and changed in BaseLinker, not here.',
    anchor: escTourObjectAnchor('orders'),
    objectNamePlural: 'orders',
  },
  {
    id: 'repairs',
    title: 'Repairs',
    body: 'Jobs from the workshop system. Same idea as orders: here you see the whole customer, and the workshop system is still where a job is worked.',
    anchor: escTourObjectAnchor('repairs'),
    objectNamePlural: 'repairs',
  },
  {
    id: 'interactions',
    title: 'Interactions',
    body: 'Emails and chats with customers, gathered from the support inboxes, so what was already said to someone is there before you reply.',
    anchor: escTourObjectAnchor('interactions'),
    objectNamePlural: 'interactions',
  },
  {
    id: 'tasks',
    title: 'Tasks',
    body: 'Something one of us owes a customer. A task has an owner and stays attached to the customer it is about, so it cannot get lost in an inbox.',
    anchor: escTourObjectAnchor('tasks'),
    objectNamePlural: 'tasks',
  },
  {
    id: 'done',
    title: 'That is the tour',
    body: 'Click Tour in the sidebar whenever you want to see it again. Nothing you do in the tour changes any data.',
  },
];

/**
 * The object routes this script depends on, in script order.
 *
 * The deploy-time check (`scripts/verify-esc-tour.sh`) compares this list against the live
 * workspace's `core."objectMetadata"`. Read the routes from here rather than by mining the
 * selector strings — the selectors are derived from these values, not the other way round.
 */
export const ESC_TOUR_OBJECT_ROUTES: string[] = ESC_TOUR_STEPS.map(
  (step) => step.objectNamePlural,
).filter((route): route is string => route !== undefined);
