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
});
