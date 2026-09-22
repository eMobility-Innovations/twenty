import { type EscTourStep } from '@/esc-tour/types/EscTourStep';
import {
  resolveEscTourAnchor,
  selectShowableEscTourSteps,
} from '@/esc-tour/utils/resolveEscTourAnchor';

const buildDocument = (html: string): HTMLElement => {
  const container = document.createElement('div');

  container.innerHTML = html;
  document.body.appendChild(container);

  return container;
};

describe('resolveEscTourAnchor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reports a step with no anchor as unanchored, not as missing', () => {
    const step: EscTourStep = { id: 'welcome', title: 'T', body: 'B' };

    const resolved = resolveEscTourAnchor(step, buildDocument(''));

    expect(resolved.isAnchored).toBe(false);
    expect(resolved.isMissing).toBe(false);
    expect(resolved.element).toBeNull();
  });

  it('reports an anchor that matches nothing as missing', () => {
    const step: EscTourStep = {
      id: 'people',
      title: 'T',
      body: 'B',
      anchor: 'a[href="/objects/people"]',
    };

    const resolved = resolveEscTourAnchor(step, buildDocument('<a href="/objects/companies">c</a>'));

    expect(resolved.isAnchored).toBe(true);
    expect(resolved.isMissing).toBe(true);
  });

  it('resolves to the ancestor when anchorAncestor is given', () => {
    const container = buildDocument(
      '<nav id="drawer"><a href="/objects/people">p</a></nav>',
    );
    const step: EscTourStep = {
      id: 'sidebar',
      title: 'T',
      body: 'B',
      anchor: 'a[href="/objects/people"]',
      anchorAncestor: 'nav',
    };

    const resolved = resolveEscTourAnchor(step, container);

    expect(resolved.element?.id).toBe('drawer');
  });

  it('falls back to the anchor itself when the named ancestor is absent', () => {
    const container = buildDocument('<a href="/objects/people">p</a>');
    const step: EscTourStep = {
      id: 'sidebar',
      title: 'T',
      body: 'B',
      anchor: 'a[href="/objects/people"]',
      anchorAncestor: 'nav',
    };

    const resolved = resolveEscTourAnchor(step, container);

    expect(resolved.element?.tagName).toBe('A');
  });
});

describe('selectShowableEscTourSteps', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  // This is the guard the whole tour rests on. Remove the `continue` in
  // selectShowableEscTourSteps and this test fails: a step whose route upstream has renamed
  // would otherwise be shown with nothing to point at.
  it('drops a step whose anchor is absent and names it', () => {
    const container = buildDocument('<a href="/objects/people">p</a>');
    const steps: EscTourStep[] = [
      { id: 'welcome', title: 'T', body: 'B' },
      { id: 'people', title: 'T', body: 'B', anchor: 'a[href="/objects/people"]' },
      { id: 'gone', title: 'T', body: 'B', anchor: 'a[href="/objects/unicorns"]' },
    ];

    const { showableSteps, missingStepIds } = selectShowableEscTourSteps(
      steps,
      container,
    );

    expect(showableSteps.map((step) => step.id)).toEqual(['welcome', 'people']);
    expect(missingStepIds).toEqual(['gone']);
  });
});
