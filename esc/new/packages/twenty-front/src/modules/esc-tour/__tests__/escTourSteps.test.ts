import {
  ESC_TOUR_OBJECT_ROUTES,
  ESC_TOUR_STEPS,
  escTourObjectAnchor,
} from '@/esc-tour/constants/escTourSteps';
import { resolveEscTourAnchor } from '@/esc-tour/utils/resolveEscTourAnchor';

/**
 * The object routes the production workspace served when this script was written, read off
 * `core."objectMetadata"` on 2026-09-22.
 *
 * This is a DATED tripwire, not a measurement: it is a copy of a reading, it cannot notice
 * that the live workspace has changed since, and it will still pass on the day somebody
 * deactivates an object. It is kept because it is free and it catches a typo in a route
 * name at commit time. The check that measures the LIVE workspace is
 * `scripts/verify-esc-tour.sh`, which runs at deploy time against the running database and
 * compares it with `ESC_TOUR_OBJECT_ROUTES`.
 */
const ROUTES_SERVED_ON_2026_09_22 = [
  'callbackCampaigns',
  'checklistTemplates',
  'companies',
  'companyAddressLinks',
  'dashboards',
  'householdMemberships',
  'households',
  'interactions',
  'notes',
  'opportunities',
  'orderLines',
  'orders',
  'people',
  'personAddressLinks',
  'postalAddresses',
  'repairs',
  'tasks',
  'workflows',
];

const VIEW_ID = '6f1f4d2a-9b3e-4f7a-8c21-0d9e5b7a3c14';

/**
 * A sidebar built the way the product builds it.
 *
 * `NavigationDrawer` puts `data-click-outside-id="navigation-drawer"` on its outermost
 * element, and `NavigationDrawerItemForObjectMetadataItem` renders one link per object
 * whose href comes from `getAppPath(AppPath.RecordIndexPage, { objectNamePlural }, …)` —
 * which appends `?viewId=<uuid>` whenever a view id exists. `withViewIds` is the state
 * every real browser is in; `withViewIds: false` is a workspace that has never had an index
 * view, which is the only state the old exact-match anchors matched.
 */
const buildProductSidebar = ({
  withViewIds,
}: {
  withViewIds: boolean;
}): HTMLElement => {
  const links = ROUTES_SERVED_ON_2026_09_22.map((route) => {
    const href = withViewIds
      ? `/objects/${route}?viewId=${VIEW_ID}`
      : `/objects/${route}`;

    return `<a href="${href}">${route}</a>`;
  }).join('');

  const container = document.createElement('div');

  container.innerHTML = `<div data-click-outside-id="navigation-drawer">${links}</div>`;
  document.body.appendChild(container);

  return container;
};

describe('ESC_TOUR_STEPS', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('has a unique id for every step', () => {
    const ids = ESC_TOUR_STEPS.map((step) => step.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every step copy to show', () => {
    for (const step of ESC_TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });

  // An anchor that the browser cannot parse throws inside querySelector and would take the
  // whole tour down rather than skipping one step, so it is checked here instead.
  it('only uses selectors the browser can parse', () => {
    for (const step of ESC_TOUR_STEPS) {
      if (step.anchor === undefined) {
        continue;
      }

      expect(() => document.querySelector(step.anchor as string)).not.toThrow();

      if (step.anchorAncestor !== undefined) {
        expect(() =>
          document.querySelector(step.anchorAncestor as string),
        ).not.toThrow();
      }
    }
  });

  it('anchors on routes and stable attributes, never on generated class names', () => {
    for (const step of ESC_TOUR_STEPS) {
      if (step.anchor === undefined) {
        continue;
      }

      // A linaria/emotion class is the one thing an anchor must never be: it is a build
      // artefact and changes without anybody deciding that it should.
      expect(step.anchor).not.toMatch(/^\./);
      expect(step.anchor).not.toMatch(/\bcss-[a-z0-9]+\b/i);
    }
  });

  it('opens and closes with a step that addresses the whole screen', () => {
    expect(ESC_TOUR_STEPS[0].anchor).toBeUndefined();
    expect(ESC_TOUR_STEPS[ESC_TOUR_STEPS.length - 1].anchor).toBeUndefined();
  });

  it('uses kebab-case ids, because they are quoted in logs and tickets', () => {
    for (const step of ESC_TOUR_STEPS) {
      expect(step.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  // This is read standing up, mid-shift, on a screen somebody else is waiting for. A step
  // that grows into a paragraph is a step nobody reads.
  it('keeps every step short enough to be read at a glance', () => {
    for (const step of ESC_TOUR_STEPS) {
      expect(step.title.length).toBeLessThanOrEqual(40);
      expect(step.body.length).toBeLessThanOrEqual(260);
    }
  });

  it('anchored steps never ask for a click the tour will swallow', () => {
    // The overlay holds an interaction lock: every click outside the popover is eaten. A
    // step that says "click this" is asking for something the product refuses to do while
    // the tour is open, and the reader concludes the CRM is broken.
    for (const step of ESC_TOUR_STEPS) {
      if (step.anchor === undefined) {
        continue;
      }

      expect(`${step.title} ${step.body}`).not.toMatch(
        /\b(click|tap|press)\b/i,
      );
    }
  });

  it('closes by telling the reader how to run the tour again', () => {
    const lastStep = ESC_TOUR_STEPS[ESC_TOUR_STEPS.length - 1];

    // The closing step is unanchored, so the interaction lock is about to lift and this is
    // the one place the word is allowed — it is the only way back in.
    expect(lastStep.body).toMatch(/\bclick\b/i);
    expect(lastStep.body).toMatch(/\btour\b/i);
    expect(lastStep.body).toMatch(/\bsidebar\b/i);
  });

  it('anchored its object steps on routes this workspace served at the recorded date', () => {
    for (const route of ESC_TOUR_OBJECT_ROUTES) {
      expect(ROUTES_SERVED_ON_2026_09_22).toContain(route);
    }
  });

  it('keeps the tour short', () => {
    // Six object steps plus a welcome, the sidebar and a close. More than this and people
    // click through it without reading, which is the same as not shipping it.
    expect(ESC_TOUR_OBJECT_ROUTES).toHaveLength(6);
    expect(ESC_TOUR_STEPS.length).toBeLessThanOrEqual(10);
  });

  it('derives every object anchor from its objectNamePlural', () => {
    // One source of truth for the route. If these ever drift apart, the deploy-time check
    // reads one of them and the browser resolves the other.
    for (const step of ESC_TOUR_STEPS) {
      if (step.objectNamePlural === undefined) {
        continue;
      }

      expect(step.anchor).toBe(escTourObjectAnchor(step.objectNamePlural));
    }
  });
});

/**
 * The tests that would have caught the shipped bug.
 *
 * Every anchored step used an EXACT href match, so the whole tour collapsed to two slides
 * on any workspace with an index view — which is every workspace. Nothing failed, because
 * the old tests compared SELECTOR STRINGS to each other and never resolved one against a
 * DOM shaped like the product's.
 */
describe('ESC_TOUR_STEPS against a sidebar built the way the product builds it', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves every anchored step when the links carry a viewId query string', () => {
    const sidebar = buildProductSidebar({ withViewIds: true });

    const unresolved = ESC_TOUR_STEPS.filter(
      (step) => resolveEscTourAnchor(step, sidebar).isMissing,
    ).map((step) => step.id);

    expect(unresolved).toEqual([]);
  });

  it('resolves every anchored step on a workspace with no index views yet', () => {
    const sidebar = buildProductSidebar({ withViewIds: false });

    const unresolved = ESC_TOUR_STEPS.filter(
      (step) => resolveEscTourAnchor(step, sidebar).isMissing,
    ).map((step) => step.id);

    expect(unresolved).toEqual([]);
  });

  // The teeth of the fixture. If this ever passes, the fixture has stopped modelling the
  // product and the test above has stopped proving anything.
  it('is a fixture an exact-href anchor genuinely fails against', () => {
    const sidebar = buildProductSidebar({ withViewIds: true });

    const resolved = resolveEscTourAnchor(
      {
        id: 'exact-match',
        title: 'T',
        body: 'B',
        anchor: 'a[href="/objects/people"]',
      },
      sidebar,
    );

    expect(resolved.isMissing).toBe(true);
  });

  // The old version of this test compared the selector STRINGS, which is exactly why it
  // passed while the sidebar step and the People step spotlighted the same link: their
  // strings differed (one carried anchorAncestor), the elements they resolved to did not.
  it('never spotlights the same element twice', () => {
    const sidebar = buildProductSidebar({ withViewIds: true });

    const elements = ESC_TOUR_STEPS.map(
      (step) => resolveEscTourAnchor(step, sidebar).element,
    ).filter((element): element is HTMLElement => element !== null);

    expect(elements).toHaveLength(ESC_TOUR_STEPS.length - 2);
    expect(new Set(elements).size).toBe(elements.length);
  });

  it('spotlights the drawer itself for the sidebar step, not a link inside it', () => {
    const sidebar = buildProductSidebar({ withViewIds: true });
    const [sidebarStep] = ESC_TOUR_STEPS.filter(
      (step) => step.id === 'sidebar',
    );

    const element = resolveEscTourAnchor(sidebarStep, sidebar).element;

    expect(element?.tagName).toBe('DIV');
    expect(element?.getAttribute('data-click-outside-id')).toBe(
      'navigation-drawer',
    );
  });

  it('spotlights a link inside the drawer for every object step', () => {
    const sidebar = buildProductSidebar({ withViewIds: true });

    for (const step of ESC_TOUR_STEPS) {
      if (step.objectNamePlural === undefined) {
        continue;
      }

      const element = resolveEscTourAnchor(step, sidebar).element;

      expect(element?.tagName).toBe('A');
      expect(element?.getAttribute('href')).toBe(
        `/objects/${step.objectNamePlural}?viewId=${VIEW_ID}`,
      );
    }
  });
});
