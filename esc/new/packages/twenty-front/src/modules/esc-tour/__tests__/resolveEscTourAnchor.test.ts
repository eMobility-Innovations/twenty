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

    const resolved = resolveEscTourAnchor(
      step,
      buildDocument('<a href="/objects/companies">c</a>'),
    );

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
      {
        id: 'people',
        title: 'T',
        body: 'B',
        anchor: 'a[href="/objects/people"]',
      },
      {
        id: 'gone',
        title: 'T',
        body: 'B',
        anchor: 'a[href="/objects/unicorns"]',
      },
    ];

    const { showableSteps, missingStepIds } = selectShowableEscTourSteps(
      steps,
      container,
    );

    expect(showableSteps.map((step) => step.id)).toEqual(['welcome', 'people']);
    expect(missingStepIds).toEqual(['gone']);
  });

  it('keeps the script order of the steps it does show', () => {
    const container = buildDocument(
      '<a href="/objects/b">b</a><a href="/objects/a">a</a>',
    );
    const steps: EscTourStep[] = [
      { id: 'a', title: 'T', body: 'B', anchor: 'a[href="/objects/a"]' },
      { id: 'b', title: 'T', body: 'B', anchor: 'a[href="/objects/b"]' },
    ];

    const { showableSteps } = selectShowableEscTourSteps(steps, container);

    // Script order, not the order the anchors happen to sit in the DOM.
    expect(showableSteps.map((step) => step.id)).toEqual(['a', 'b']);
  });

  it('reports nothing missing for a script of unanchored steps', () => {
    const { showableSteps, missingStepIds } = selectShowableEscTourSteps(
      [
        { id: 'welcome', title: 'T', body: 'B' },
        { id: 'done', title: 'T', body: 'B' },
      ],
      buildDocument(''),
    );

    expect(showableSteps).toHaveLength(2);
    expect(missingStepIds).toEqual([]);
  });

  it('survives an empty script', () => {
    const { showableSteps, missingStepIds } = selectShowableEscTourSteps(
      [],
      buildDocument(''),
    );

    expect(showableSteps).toEqual([]);
    expect(missingStepIds).toEqual([]);
  });

  it('takes the first match when a selector matches more than one element', () => {
    const container = buildDocument(
      '<a href="/objects/people" id="first">p</a><a href="/objects/people" id="second">p</a>',
    );

    const resolved = resolveEscTourAnchor(
      {
        id: 'people',
        title: 'T',
        body: 'B',
        anchor: 'a[href="/objects/people"]',
      },
      container,
    );

    expect(resolved.element?.id).toBe('first');
  });

  it('resolves to the anchor itself when it is its own nearest matching ancestor', () => {
    const container = buildDocument(
      '<nav><a href="/objects/people">p</a></nav>',
    );

    const resolved = resolveEscTourAnchor(
      {
        id: 'sidebar',
        title: 'T',
        body: 'B',
        anchor: 'nav',
        anchorAncestor: 'nav',
      },
      container,
    );

    // `closest` matches the element itself, which is the behaviour a step relies on when it
    // names a container directly.
    expect(resolved.element?.tagName).toBe('NAV');
  });
});
