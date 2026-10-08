import {
  ESC_TOUR_FILTER_ANCHOR,
  ESC_TOUR_PAGE_TITLE_ANCHOR,
  escTourObjectAnchor,
} from '@/esc-tour/constants/escTourAnchors';
import { type EscTourTeam } from '@/esc-tour/team/escTourTeam';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';

/**
 * One chapter per team: what that team does on an ordinary day (RM #22317, pilot = Sales
 * and CS). Inserted before "Getting around" by `buildEscTourSteps`.
 *
 * Every fact below was read off the LIVE data model on 2026-10-08 (metadata API, CT175):
 *   opportunity.stage     NEW … CONTACTED, QUOTE_SENT, NEGOTIATING, WON, LOST_* , EXPIRED
 *   opportunity.owner, opportunity.leadRouterStatus UNASSIGNED / ASSIGNED / ACCEPTED / …
 *   callbackCampaign      its own object, joined to opportunities
 *   interaction.channel   EMAIL, CHAT, CALL, SMS, SOCIAL_DM; interaction.direction IN/OUT
 *   repair.repairStatus   BOOKED, RECEIVED, IN_PROGRESS, COMPLETED, CANCELLED
 *   order.orderStatus     PENDING, PAID, SHIPPED, DELIVERED, REFUNDED
 *   task.status           TODO, IN_PROGRESS, DONE
 *   person.personTags     VIP, REPEAT_CUSTOMER, REFUND_RISK, DND, COMPLAINT_OPEN, …
 * Lists the chapters walk into were all non-empty on 2026-09-23 (opportunities 334,
 * interactions 5,799, repairs 499). Tasks were EMPTY, so tasks are described, never opened.
 *
 * Same rules as the main script: copy describes, it never instructs a click (the
 * interaction lock swallows it); a routed step declares `objectNamePlural`, because
 * scripts/verify-esc-tour.sh reads the routes it checks out of these declarations.
 */
export const ESC_TOUR_TEAM_CHAPTERS: Record<EscTourTeam, string> = {
  sales: 'Your day in Sales',
  cs: 'Your day in Customer service',
};

const OPPORTUNITIES_ROUTE = '/objects/opportunities';
const INTERACTIONS_ROUTE = '/objects/interactions';
const REPAIRS_ROUTE = '/objects/repairs';

const SALES = ESC_TOUR_TEAM_CHAPTERS.sales;
const CS = ESC_TOUR_TEAM_CHAPTERS.cs;

const ESC_TOUR_SALES_STEPS: EscTourStep[] = [
  {
    id: 'sales-opportunities',
    chapter: SALES,
    title: 'Opportunities are your deals',
    body: 'Each opportunity is a customer who might buy: who they are, what they want, how much it is worth, and whose deal it is.',
    anchor: escTourObjectAnchor('opportunities'),
    objectNamePlural: 'opportunities',
  },
  {
    id: 'sales-pipeline',
    chapter: SALES,
    title: 'The Opportunities list',
    body: 'Every enquiry that could become a sale lands here — from the website, chat, calls and abandoned baskets — so none of them depends on someone remembering it.',
    anchor: ESC_TOUR_PAGE_TITLE_ANCHOR,
    objectNamePlural: 'opportunities',
    route: OPPORTUNITIES_ROUTE,
  },
  {
    // Centred: the stage column moves with the view, and the idea is the whole list.
    id: 'sales-stages',
    chapter: SALES,
    title: 'Stages',
    body: 'A deal moves through stages — New, Contacted, Quote sent, Negotiating — and ends Won or Lost. Keeping the stage current is how everyone sees where each deal stands.',
    objectNamePlural: 'opportunities',
    route: OPPORTUNITIES_ROUTE,
  },
  {
    id: 'sales-my-deals',
    chapter: SALES,
    title: 'Just your deals',
    body: 'A filter on Owner narrows this list to the deals that are yours. Most sales days start from that list.',
    anchor: ESC_TOUR_FILTER_ANCHOR,
    objectNamePlural: 'opportunities',
    route: OPPORTUNITIES_ROUTE,
  },
  {
    id: 'sales-lead-status',
    chapter: SALES,
    title: 'New leads',
    body: 'Lead status says whether a new lead has been handed to someone yet — unassigned, assigned, accepted. An unassigned lead is nobody’s until somebody takes it.',
    objectNamePlural: 'opportunities',
    route: OPPORTUNITIES_ROUTE,
  },
  {
    id: 'sales-callbacks',
    chapter: SALES,
    title: 'Callback campaigns',
    body: 'A callback campaign is a group of customers to ring back — people who went quiet, say. Each campaign holds its own deals.',
    anchor: escTourObjectAnchor('callbackCampaigns'),
    objectNamePlural: 'callbackCampaigns',
  },
  {
    id: 'sales-tags',
    chapter: SALES,
    title: 'Read the tags first',
    body: 'Tags on a customer say who they are before you call: VIP, Repeat customer, Reactivation target. DND means do not disturb.',
  },
  {
    id: 'sales-follow-up',
    chapter: SALES,
    title: 'Promises go in a task',
    body: 'Agreed to ring someone back? A task on their page, with a due date and you as owner, keeps the promise from getting lost. Mark it Done when it is done.',
  },
];

const ESC_TOUR_CS_STEPS: EscTourStep[] = [
  {
    id: 'cs-find',
    chapter: CS,
    title: 'Finding the customer',
    body: 'Most enquiries start with a name, an email or a phone number. The magnifying glass in the panel, or Ctrl+K, finds the customer from any of them.',
  },
  {
    id: 'cs-interactions-list',
    chapter: CS,
    title: 'Every conversation',
    body: 'The Interactions list holds every email and chat from the support inboxes, so what was said before is here before you reply.',
    anchor: ESC_TOUR_PAGE_TITLE_ANCHOR,
    objectNamePlural: 'interactions',
    route: INTERACTIONS_ROUTE,
  },
  {
    id: 'cs-interaction-channel',
    chapter: CS,
    title: 'Channel and direction',
    body: 'Each line says how it arrived — email, chat, call, text, social — whether it came in or went out, and when. On a customer’s page the same lines read as their history.',
    objectNamePlural: 'interactions',
    route: INTERACTIONS_ROUTE,
  },
  {
    id: 'cs-repairs',
    chapter: CS,
    title: 'Where a repair is',
    body: 'Repairs show each job’s status: Booked, Received, In progress, Completed. It comes from the workshop system, so a change is made there and shows up here.',
    anchor: ESC_TOUR_PAGE_TITLE_ANCHOR,
    objectNamePlural: 'repairs',
    route: REPAIRS_ROUTE,
  },
  {
    id: 'cs-orders',
    chapter: CS,
    title: 'Where an order is',
    body: 'An order’s status — Pending, Paid, Shipped, Delivered, Refunded — answers most “where is my order” questions. It comes from BaseLinker.',
  },
  {
    id: 'cs-tags',
    chapter: CS,
    title: 'Read the tags first',
    body: 'Tags on a customer warn you before you answer: Complaint open, Refund risk, VIP. DND means do not disturb.',
  },
  {
    id: 'cs-follow-up',
    chapter: CS,
    title: 'Promises go in a task',
    body: 'A promise to a customer — a callback, a refund to chase — belongs in a task on their page, with a due date and an owner. Mark it Done when it is done.',
  },
];

export const ESC_TOUR_TEAM_STEPS: Record<EscTourTeam, EscTourStep[]> = {
  sales: ESC_TOUR_SALES_STEPS,
  cs: ESC_TOUR_CS_STEPS,
};
