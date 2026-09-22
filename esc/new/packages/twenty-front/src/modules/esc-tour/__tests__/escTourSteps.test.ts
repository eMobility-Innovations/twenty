import { ESC_TOUR_STEPS } from '@/esc-tour/constants/escTourSteps';

describe('ESC_TOUR_STEPS', () => {
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

  it('anchors on routes, never on generated class names', () => {
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

  it('anchors only on routes this workspace serves', () => {
    // Read off production's core."objectMetadata" on 2026-09-22. A step pointing at an
    // object we do not have is a step that can never show, and it would be invisible —
    // the tour skips missing anchors by design.
    const servedRoutes = [
      'people',
      'companies',
      'opportunities',
      'notes',
      'tasks',
      'dashboards',
      'workflows',
      'orders',
      'orderLines',
      'repairs',
      'interactions',
      'households',
      'householdMemberships',
      'postalAddresses',
      'personAddressLinks',
      'companyAddressLinks',
      'callbackCampaigns',
      'checklistTemplates',
    ];

    for (const step of ESC_TOUR_STEPS) {
      const match = step.anchor?.match(/\/objects\/([A-Za-z]+)/);

      if (!match) {
        continue;
      }

      expect(servedRoutes).toContain(match[1]);
    }
  });

  it('never spotlights the same element twice', () => {
    // The sidebar step and the People step share a selector on purpose — one of them walks
    // up to the container with anchorAncestor, so they light up different things. What must
    // not happen is two steps resolving to the identical element.
    const targets = ESC_TOUR_STEPS.filter(
      (step) => step.anchor !== undefined,
    ).map((step) => `${step.anchor}|${step.anchorAncestor ?? ''}`);

    expect(new Set(targets).size).toBe(targets.length);
  });
});
