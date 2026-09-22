import { type EscTourStep } from '@/esc-tour/types/EscTourStep';

/**
 * The ESC tour script.
 *
 * Copy lives here as data, not as JSX, so a wording change is a one-line edit to a plain
 * string and never a component change.
 *
 * Every anchor is a ROUTE that the workspace actually serves. The object routes below were
 * read off the production workspace's `core."objectMetadata"` on 2026-09-22; an object that
 * is later renamed or deactivated makes its step vanish from the tour rather than break it.
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
    body: 'The sidebar is your map. Each entry is a list of one kind of thing. Click a name to open that list.',
    anchor: 'a[href="/objects/people"]',
    anchorAncestor: 'nav, aside',
    padding: 8,
  },
  {
    id: 'people',
    title: 'People',
    body: 'Every individual customer we have ever dealt with. Open one and you see their orders, their repairs and every message they have sent us.',
    anchor: 'a[href="/objects/people"]',
  },
  {
    id: 'companies',
    title: 'Companies',
    body: 'The business customers. A company holds its own people, so a trade account and its staff stay joined up.',
    anchor: 'a[href="/objects/companies"]',
  },
  {
    id: 'orders',
    title: 'Orders',
    body: 'Sales, brought in automatically from BaseLinker. You read them here — you do not create them here.',
    anchor: 'a[href="/objects/orders"]',
  },
  {
    id: 'repairs',
    title: 'Repairs',
    body: 'Jobs from the workshop system. Same idea: the CRM shows you the whole customer, the workshop system is still where a job is worked.',
    anchor: 'a[href="/objects/repairs"]',
  },
  {
    id: 'interactions',
    title: 'Interactions',
    body: 'Emails and chats with customers, gathered from the support inboxes so you can see what was already said before you reply.',
    anchor: 'a[href="/objects/interactions"]',
  },
  {
    id: 'tasks',
    title: 'Tasks',
    body: 'What you owe someone. Assign a task to yourself or to a colleague and it stays attached to the customer it belongs to.',
    anchor: 'a[href="/objects/tasks"]',
  },
  {
    id: 'done',
    title: 'That is the tour',
    body: 'Click Tour in the sidebar whenever you want it again. Nothing you do in the tour changes any data.',
  },
];
