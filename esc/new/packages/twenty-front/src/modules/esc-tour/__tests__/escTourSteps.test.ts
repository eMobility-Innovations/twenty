import {
  ESC_TOUR_COLUMN_HEADING_ANCHOR,
  ESC_TOUR_DRAWER_FOLDER_ANCHOR,
  ESC_TOUR_DRAWER_SECTION_TITLE_ANCHOR,
  ESC_TOUR_FILTER_ANCHOR,
  ESC_TOUR_OPTIONS_ANCHOR,
  ESC_TOUR_SEARCH_BUTTON_ANCHOR,
  ESC_TOUR_SETTINGS_ROW_ANCHOR,
  ESC_TOUR_SORT_ANCHOR,
  ESC_TOUR_TOUR_BUTTON_ANCHOR,
  ESC_TOUR_VIEW_PICKER_ANCHOR,
  ESC_TOUR_WORKSPACE_NAME_ANCHOR,
} from '@/esc-tour/constants/escTourAnchors';
import {
  ESC_TOUR_CHAPTERS,
  ESC_TOUR_OBJECT_ROUTES,
  ESC_TOUR_STEPS,
  escTourObjectAnchor,
} from '@/esc-tour/constants/escTourSteps';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';
import { resolveEscTourAnchor } from '@/esc-tour/utils/resolveEscTourAnchor';

/**
 * The object routes the production workspace served when this script was written, read off
 * `core."objectMetadata"` and re-read on 2026-09-23: seven pinned VIEWS (companies,
 * dashboards, notes, opportunities, people, tasks, workflows) then eleven pinned OBJECTS.
 * Eighteen sidebar entries in total — which is why the tour covers six of them and
 * describes the shape of the rest in one step rather than writing eighteen steps.
 *
 * This is a DATED tripwire, not a measurement: it is a copy of a reading, it cannot notice
 * that the live workspace has changed since, and it will still pass on the day somebody
 * deactivates an object. It is kept because it is free and it catches a typo in a route
 * name at commit time. The check that measures the LIVE workspace is
 * `scripts/verify-esc-tour.sh`, which runs at deploy time against the running database and
 * compares it with `ESC_TOUR_OBJECT_ROUTES`.
 */
const ROUTES_SERVED_ON_2026_09_23 = [
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

const [
  CHAPTER_WHERE_YOU_ARE,
  CHAPTER_LEFT_PANEL,
  CHAPTER_A_LIST,
  CHAPTER_ONE_CUSTOMER,
  CHAPTER_GETTING_AROUND,
] = ESC_TOUR_CHAPTERS;

const stepsInChapter = (chapter: string): EscTourStep[] =>
  ESC_TOUR_STEPS.filter((step) => step.chapter === chapter);

const stepById = (id: string): EscTourStep => {
  const step = ESC_TOUR_STEPS.find((candidate) => candidate.id === id);

  if (step === undefined) {
    throw new Error(
      `No step with id ${id}. The script lost a step, or renamed one.`,
    );
  }

  return step;
};

/**
 * A sidebar built the way the product builds it.
 *
 * `NavigationDrawer` puts `data-click-outside-id="navigation-drawer"` on its outermost
 * element, and `NavigationDrawerItemForObjectMetadataItem` renders one link per object
 * whose href comes from `getAppPath(AppPath.RecordIndexPage, { objectNamePlural }, …)` —
 * which appends `?viewId=<uuid>` whenever a view id exists. `withViewIds` is the state
 * every real browser is in; `withViewIds: false` is a workspace that has never had an index
 * view, which is the only state the old exact-match anchors matched.
 *
 * The rest of the fixture is the drawer's own furniture, built from the same reading:
 * the workspace dropdown's test id, the header's search button with its translated
 * aria-label, one section heading with the hand-written class its own hover rules key off,
 * a folder header in the shape `NavigationDrawerItem` gives a row that has right-hand
 * options and no link, the Settings row, and our Tour button. `withFolder` is false by
 * default because the live workspace HAS no folder — see `sub-category-folder`.
 */
const buildProductSidebar = ({
  withViewIds,
  withFolder = false,
}: {
  withViewIds: boolean;
  withFolder?: boolean;
}): HTMLElement => {
  const links = ROUTES_SERVED_ON_2026_09_23.map((route) => {
    const href = withViewIds
      ? `/objects/${route}?viewId=${VIEW_ID}`
      : `/objects/${route}`;

    return `<a href="${href}" class="navigation-drawer-item">${route}</a>`;
  }).join('');

  const folder = withFolder
    ? '<div class="navigation-drawer-item" role="button" id="nav-item-trade">Trade</div>'
    : '';

  const container = document.createElement('div');

  container.innerHTML = `
    <div data-click-outside-id="navigation-drawer">
      <div data-testid="workspace-dropdown">eMobility</div>
      <button aria-label="Search"></button>
      <div class="section-title-container"><span>Workspace</span></div>
      ${folder}
      ${links}
      <button id="nav-item-tour" class="navigation-drawer-item">Tour</button>
      <button id="nav-item-settings" class="navigation-drawer-item">Settings</button>
    </div>
  `;
  document.body.appendChild(container);

  return container;
};

/**
 * A view bar and a record table built the way the product builds them.
 *
 * `Dropdown` puts `aria-controls={`${dropdownId}-options`}` on whatever opens it
 * (modules/ui/layout/dropdown/components/Dropdown.tsx:202) and the column heading's
 * dropdown id is `fieldMetadataItemId + '-header'`, so the heading here carries a uuid it
 * could never have been written with — which is the whole point of anchoring on the
 * suffix. Rows carry `data-testid={`row-id-${recordId}`}`.
 */
const buildProductRecordIndex = (): HTMLElement => {
  const container = document.createElement('div');

  container.innerHTML = `
    <div data-testid="top-bar-title">People</div>
    <div role="button" aria-controls="view-picker-options">All People</div>
    <div role="button" aria-controls="view-bar-main-filter-dropdown-id-options">
      Filter
    </div>
    <div role="button" aria-controls="sort-dropdown-options">Sort</div>
    <div role="button" aria-controls="object-options-dropdown-id-options">…</div>
    <div
      role="button"
      aria-controls="0f2b6f1e-5d3a-4a77-9c4d-2f8b1d6a0e51-header-options"
    >
      Name
    </div>
    <div data-testid="row-id-3a9c1b74-6d20-4f8e-9a51-7c2e0b4d8f13">Ada</div>
  `;
  document.body.appendChild(container);

  return container;
};

/**
 * A record page built the way the product builds one.
 *
 * `RecordFieldList` renders `<PropertyBox dataTestId="record-fields-list-container">`,
 * `RecordDetailRelationSection` builds `${label}-relation` from a TRANSLATED label — so
 * the fixture uses a translated one on purpose, to prove the suffix anchor survives it —
 * and `TabButton` renders `tab-${id}`.
 */
const buildProductRecordPage = (): HTMLElement => {
  const container = document.createElement('div');

  container.innerHTML = `
    <div data-testid="tab-timeline">Chronologie</div>
    <div data-testid="record-fields-list-container">…</div>
    <div data-testid="commandes-relation">
      <div data-testid="record-detail-records-list-item">#10241</div>
    </div>
  `;
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

  it('uses kebab-case ids, because they are quoted in logs and tickets', () => {
    for (const step of ESC_TOUR_STEPS) {
      expect(step.id).toMatch(/^[a-z][a-z0-9-]*$/);
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
      expect(step.anchor).not.toMatch(/\bcss-[a-z0-9]+\b/i);
    }
  });

  // The rule is not "no class names" — `.section-title-container` and
  // `.navigation-drawer-item` are hand-written, and the components' own hover rules key
  // off them, so they cannot be renamed quietly. The rule is that a class may only ever
  // NARROW a stable attribute. On its own it says nothing about which of the several
  // places that class is used it will match, and the settings drawer uses both of these.
  it('never leads a selector with a bare class', () => {
    for (const step of ESC_TOUR_STEPS) {
      if (step.anchor === undefined) {
        continue;
      }

      for (const alternative of step.anchor.split(',')) {
        expect(alternative.trim()).not.toMatch(/^\./);
      }
    }
  });

  // The 2026-09-22 failure, as an assertion. Every anchored step used an exact href, so
  // the tour collapsed to two slides on any workspace that had ever opened a list.
  it('never anchors an object on an exact href alone', () => {
    for (const step of ESC_TOUR_STEPS) {
      if (step.objectNamePlural === undefined || step.anchor === undefined) {
        continue;
      }

      expect(step.anchor).not.toBe(
        `a[href="/objects/${step.objectNamePlural}"]`,
      );
    }
  });

  it('derives every sidebar object anchor from its objectNamePlural', () => {
    // One source of truth for the route. If these ever drift apart, the deploy-time check
    // reads one of them and the browser resolves the other.
    for (const step of stepsInChapter(CHAPTER_LEFT_PANEL)) {
      if (step.objectNamePlural === undefined) {
        continue;
      }

      expect(step.anchor).toBe(escTourObjectAnchor(step.objectNamePlural));
    }
  });

  // THE DEPLOY-TIME ALARM'S INPUT.
  //
  // `scripts/verify-esc-tour.sh` builds the route list it checks against the live
  // workspace by reading the objectNamePlural declarations out of the step script. A step
  // that navigates somewhere without declaring the object it navigates to is a route the
  // alarm has never heard of: upstream could retire it and nothing would say so until a
  // reader watched the tour stall for eight seconds and then skip.
  it('declares the object of every step that navigates', () => {
    const routedSteps = ESC_TOUR_STEPS.filter(
      (step) => step.route !== undefined,
    );

    expect(routedSteps.length).toBeGreaterThan(0);

    for (const step of routedSteps) {
      expect(step.objectNamePlural).toBeDefined();
      expect(ESC_TOUR_OBJECT_ROUTES).toContain(
        step.objectNamePlural as string,
      );
      expect(step.route).toBe(`/objects/${step.objectNamePlural}`);
    }
  });

  it('anchored its object steps on routes this workspace served at the recorded date', () => {
    for (const route of ESC_TOUR_OBJECT_ROUTES) {
      expect(ROUTES_SERVED_ON_2026_09_23).toContain(route);
    }
  });

  it('names each object once in the list the deploy check reads', () => {
    // Chapter 3 is ten steps about one object. A route repeated ten times is noise in
    // every message that alarm ever sends.
    expect(new Set(ESC_TOUR_OBJECT_ROUTES).size).toBe(
      ESC_TOUR_OBJECT_ROUTES.length,
    );
    expect(ESC_TOUR_OBJECT_ROUTES).toContain('people');
  });

  it('walks into People and nowhere else', () => {
    // MEASURED 2026-09-23: tasks 0 records, notes 0. Walking a new starter into an empty
    // list teaches them the product is empty. People has 25,418.
    const routes = new Set(
      ESC_TOUR_STEPS.map((step) => step.route).filter(
        (route): route is string => route !== undefined,
      ),
    );

    expect([...routes]).toEqual(['/objects/people']);
  });

  it('opens and closes with a step that addresses the whole screen', () => {
    expect(ESC_TOUR_STEPS[0].anchor).toBeUndefined();
    expect(ESC_TOUR_STEPS[ESC_TOUR_STEPS.length - 1].anchor).toBeUndefined();
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
});

describe('ESC_TOUR_STEPS chapters', () => {
  it('runs its chapters in order, each one in a single unbroken block', () => {
    const chapters = ESC_TOUR_STEPS.map((step) => step.chapter);

    // Collapsing consecutive repeats gives the order the chapters are ENTERED in. If it
    // equals the declared list, the chapters are both in order and contiguous — a chapter
    // resumed after another one would appear twice here and fail.
    const chaptersInOrderOfEntry = chapters.filter(
      (chapter, index) => index === 0 || chapter !== chapters[index - 1],
    );

    expect(chaptersInOrderOfEntry).toEqual([...ESC_TOUR_CHAPTERS]);
  });

  it('leaves no step outside a chapter', () => {
    // The popover prints the chapter above the step counter. A step with no chapter prints
    // a blank line there, which reads as a rendering bug rather than as a missing string.
    for (const step of ESC_TOUR_STEPS) {
      expect(ESC_TOUR_CHAPTERS).toContain(step.chapter);
    }
  });

  it('gives every chapter enough steps to be worth naming', () => {
    for (const chapter of ESC_TOUR_CHAPTERS) {
      expect(stepsInChapter(chapter).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('navigates only inside the chapter that is about another page', () => {
    for (const step of ESC_TOUR_STEPS) {
      if (step.route === undefined) {
        continue;
      }

      expect(step.chapter).toBe(CHAPTER_A_LIST);
    }
  });
});

describe('ESC_TOUR_STEPS chapter 4, the customer page', () => {
  const customerPageSteps = stepsInChapter(CHAPTER_ONE_CUSTOMER);

  it('has steps at all, so the assertions below cannot pass vacuously', () => {
    expect(customerPageSteps.length).toBeGreaterThan(0);
  });

  it('marks every step optional', () => {
    // The chapter is judged against the page the reader pressed Tour on. Standing anywhere
    // but a customer's page, none of it resolves — and that is a fact about where they are
    // standing, not upstream drift, so naming it in `missingStepIds` would train whoever
    // reads that report to skim it.
    for (const step of customerPageSteps) {
      expect(step.optional).toBe(true);
    }
  });

  it('never routes a step in it', () => {
    // A record page is served at '/object/:objectNameSingular/:objectRecordId', so
    // reaching one means knowing a uuid this file cannot contain. The alternative —
    // routing these steps at '/objects/people', where the tour already is — navigates
    // nowhere and spends ESC_TOUR_ANCHOR_DEADLINE_MS (8 seconds) per step waiting for a
    // record page that is not open: around half a minute of dead tour on EVERY run.
    // `optional: true` silences the report; it does not shorten the wait. Route-less
    // costs nothing when the chapter does not apply, which is most of the time.
    for (const step of customerPageSteps) {
      expect(step.route).toBeUndefined();
    }
  });

  it('opens with a step that points at nothing, so the idea always survives', () => {
    expect(customerPageSteps[0].anchor).toBeUndefined();
  });
});

describe('ESC_TOUR_STEPS sub-categories', () => {
  // MEASURED 2026-09-23: core."navigationMenuItem" holds 18 rows, every folderId NULL,
  // zero rows of type FOLDER. The operator asked for sub-categories specifically, so the
  // chapter must not vanish just because nobody has made one — the anchored step is
  // allowed to drop, and a centred step immediately after it carries the idea alone.
  it('follows the folder step with a centred explainer that can never drop', () => {
    const folderIndex = ESC_TOUR_STEPS.indexOf(stepById('sub-category-folder'));
    const explainerIndex = ESC_TOUR_STEPS.indexOf(
      stepById('sub-category-explained'),
    );

    expect(explainerIndex).toBe(folderIndex + 1);
    expect(stepById('sub-category-explained').anchor).toBeUndefined();
    expect(stepById('sub-category-explained').route).toBeUndefined();
  });

  it('lets the folder step drop quietly while there are no folders', () => {
    expect(stepById('sub-category-folder').optional).toBe(true);
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

  const objectSteps = ESC_TOUR_STEPS.filter(
    (step) => step.chapter === CHAPTER_LEFT_PANEL && step.objectNamePlural,
  );

  it('still covers the six lists somebody uses on their first day', () => {
    expect(objectSteps.map((step) => step.objectNamePlural)).toEqual([
      'people',
      'companies',
      'orders',
      'repairs',
      'interactions',
      'tasks',
    ]);
  });

  it('resolves every object step when the links carry a viewId query string', () => {
    const sidebar = buildProductSidebar({ withViewIds: true });

    const unresolved = objectSteps
      .filter((step) => resolveEscTourAnchor(step, sidebar).isMissing)
      .map((step) => step.id);

    expect(unresolved).toEqual([]);
  });

  it('resolves every object step on a workspace with no index views yet', () => {
    const sidebar = buildProductSidebar({ withViewIds: false });

    const unresolved = objectSteps
      .filter((step) => resolveEscTourAnchor(step, sidebar).isMissing)
      .map((step) => step.id);

    expect(unresolved).toEqual([]);
  });

  // The teeth of the fixture. If this ever passes, the fixture has stopped modelling the
  // product and the tests above have stopped proving anything.
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
  it('never spotlights the same link twice', () => {
    const sidebar = buildProductSidebar({ withViewIds: true });

    const elements = objectSteps.map(
      (step) => resolveEscTourAnchor(step, sidebar).element,
    );

    expect(elements.filter((element) => element !== null)).toHaveLength(
      objectSteps.length,
    );
    expect(new Set(elements).size).toBe(elements.length);
  });

  it('spotlights a link inside the drawer for every object step', () => {
    const sidebar = buildProductSidebar({ withViewIds: true });

    for (const step of objectSteps) {
      const element = resolveEscTourAnchor(step, sidebar).element;

      expect(element?.tagName).toBe('A');
      expect(element?.getAttribute('href')).toBe(
        `/objects/${step.objectNamePlural}?viewId=${VIEW_ID}`,
      );
    }
  });

  it('spotlights the drawer itself for the sidebar step, not a link inside it', () => {
    const sidebar = buildProductSidebar({ withViewIds: true });

    const element = resolveEscTourAnchor(stepById('sidebar'), sidebar).element;

    expect(element?.tagName).toBe('DIV');
    expect(element?.getAttribute('data-click-outside-id')).toBe(
      'navigation-drawer',
    );
  });

  it('resolves the rest of the sidebar furniture', () => {
    const sidebar = buildProductSidebar({
      withViewIds: true,
      withFolder: true,
    });

    const anchors = [
      ESC_TOUR_WORKSPACE_NAME_ANCHOR,
      ESC_TOUR_SEARCH_BUTTON_ANCHOR,
      ESC_TOUR_DRAWER_SECTION_TITLE_ANCHOR,
      ESC_TOUR_DRAWER_FOLDER_ANCHOR,
      ESC_TOUR_SETTINGS_ROW_ANCHOR,
      ESC_TOUR_TOUR_BUTTON_ANCHOR,
    ];

    for (const anchor of anchors) {
      expect(sidebar.querySelector(anchor)).not.toBeNull();
    }
  });

  // The folder anchor matches by SHAPE — a drawer row with right-hand options and no link
  // — because no attribute names a folder. If it ever starts matching an object link or
  // the Settings row, the sub-category step will spotlight the wrong thing and say the
  // wrong thing about it, which is worse than dropping.
  it('picks nothing out of a drawer that has no folder in it', () => {
    const sidebar = buildProductSidebar({ withViewIds: true });

    expect(sidebar.querySelector(ESC_TOUR_DRAWER_FOLDER_ANCHOR)).toBeNull();
  });
});

describe('ESC_TOUR_STEPS against a record index built the way the product builds it', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves every anchored step of the list chapter', () => {
    const page = buildProductRecordIndex();
    const sidebar = buildProductSidebar({ withViewIds: true });

    const unresolved = stepsInChapter(CHAPTER_A_LIST)
      .filter((step) => step.anchor !== undefined)
      .filter(
        (step) =>
          resolveEscTourAnchor(step, page).isMissing &&
          resolveEscTourAnchor(step, sidebar).isMissing,
      )
      .map((step) => step.id);

    expect(unresolved).toEqual([]);
  });

  it('finds the column heading through a dropdown id it could never have guessed', () => {
    // The id is `fieldMetadataItemId + '-header'`. The uuid half is data; only the suffix
    // is source text, which is why the anchor matches on the end of the value.
    const page = buildProductRecordIndex();

    expect(
      page.querySelector(ESC_TOUR_COLUMN_HEADING_ANCHOR)?.textContent?.trim(),
    ).toBe('Name');
  });

  it('tells the three view-bar dropdowns apart', () => {
    const page = buildProductRecordIndex();

    const found = [
      ESC_TOUR_VIEW_PICKER_ANCHOR,
      ESC_TOUR_FILTER_ANCHOR,
      ESC_TOUR_SORT_ANCHOR,
      ESC_TOUR_OPTIONS_ANCHOR,
    ].map((anchor) => page.querySelector(anchor));

    expect(found.filter((element) => element !== null)).toHaveLength(4);
    expect(new Set(found).size).toBe(found.length);
  });
});

describe('ESC_TOUR_STEPS against a record page built the way the product builds one', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves every anchored step of the customer chapter', () => {
    const page = buildProductRecordPage();

    const unresolved = stepsInChapter(CHAPTER_ONE_CUSTOMER)
      .filter((step) => step.anchor !== undefined)
      .filter((step) => resolveEscTourAnchor(step, page).isMissing)
      .map((step) => step.id);

    expect(unresolved).toEqual([]);
  });

  // The fixture's relation section and tab are deliberately labelled in French. An anchor
  // built from a translated string would pass in English and fail here, which is what a
  // non-English workspace would see — and it would look exactly like upstream drift.
  it('survives a workspace that is not in English', () => {
    const page = buildProductRecordPage();

    expect(page.querySelector('[data-testid$="-relation"]')).not.toBeNull();
    expect(page.querySelector('[data-testid^="tab-"]')).not.toBeNull();
  });

  it('drops the whole chapter, quietly, on a page that is not a record', () => {
    const page = buildProductRecordIndex();

    for (const step of stepsInChapter(CHAPTER_ONE_CUSTOMER)) {
      if (step.anchor === undefined) {
        continue;
      }

      expect(resolveEscTourAnchor(step, page).isMissing).toBe(true);
      expect(step.optional).toBe(true);
    }
  });
});

describe('ESC_TOUR_STEPS opening and closing chapters', () => {
  it('opens on the page the reader is already standing on', () => {
    // Nothing in chapter 1 or chapter 2 navigates: the drawer is on screen on every page
    // of the product, so moving the reader to show them something already in front of
    // them would be a bug.
    for (const chapter of [CHAPTER_WHERE_YOU_ARE, CHAPTER_LEFT_PANEL]) {
      for (const step of stepsInChapter(chapter)) {
        expect(step.route).toBeUndefined();
      }
    }
  });

  it('ends without moving the reader anywhere', () => {
    for (const step of stepsInChapter(CHAPTER_GETTING_AROUND)) {
      expect(step.route).toBeUndefined();
    }
  });

  it('tells the reader the two keys, and which ones they are', () => {
    const bodies = stepsInChapter(CHAPTER_GETTING_AROUND)
      .map((step) => step.body)
      .join(' ');

    // Read off modules/command-menu/hooks/useCommandMenuHotKeys.ts:37 ('ctrl+k',
    // 'meta+k') and :73 (Escape). If upstream rebinds either, this copy is a lie and the
    // only thing that will notice is a reader trying it.
    expect(bodies).toMatch(/\bCtrl\b/);
    expect(bodies).toMatch(/\bCmd\b/);
    expect(bodies).toMatch(/\bEscape\b/);
  });
});
