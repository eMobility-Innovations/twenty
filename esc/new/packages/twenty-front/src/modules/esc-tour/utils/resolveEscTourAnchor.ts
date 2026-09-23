import { type EscTourStep } from '@/esc-tour/types/EscTourStep';

/**
 * `querySelector` and `closest` THROW on a selector the browser cannot parse — they do not
 * return null. An unparseable selector in the script would therefore take the whole CRM
 * down at the moment somebody pressed Tour, rather than costing one step.
 *
 * A selector that cannot be parsed matches nothing by definition, so treating it as "no
 * match" is the honest answer as well as the safe one. A typo is still caught long before
 * this: `escTourSteps.test.ts` parses every selector in the shipped script.
 */
const querySelectorOrNull = (
  root: ParentNode,
  selector: string,
): HTMLElement | null => {
  try {
    return root.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
};

const closestOrNull = (
  element: HTMLElement,
  selector: string,
): HTMLElement | null => {
  try {
    return element.closest<HTMLElement>(selector);
  } catch {
    return null;
  }
};

/**
 * Resolve a step's anchor to a live element.
 *
 * Returns `null` for a step that has no anchor (a centred step) AND for a step whose
 * selector matches nothing. The two cases are told apart by `isAnchored`, because they are
 * different facts: one is a step that was written to be centred, the other is a step whose
 * target has moved and which the tour is about to skip.
 *
 * The selector may be a selector LIST (`a[href="/x"], a[href^="/x?"]`), which is how an
 * object route is anchored — the sidebar renders the same link with and without a
 * `?viewId=` query string depending on whether an index view exists.
 */
export const resolveEscTourAnchor = (
  step: EscTourStep,
  root: ParentNode = document,
): { element: HTMLElement | null; isAnchored: boolean; isMissing: boolean } => {
  if (step.anchor === undefined) {
    return { element: null, isAnchored: false, isMissing: false };
  }

  const anchorElement = querySelectorOrNull(root, step.anchor);

  if (anchorElement === null) {
    return { element: null, isAnchored: true, isMissing: true };
  }

  if (step.anchorAncestor === undefined) {
    return { element: anchorElement, isAnchored: true, isMissing: false };
  }

  // A step may want the CONTAINER of a thing it can name. `closest` walks up from an
  // element we already found, so the container needs no identifying attribute of its own.
  const ancestorElement = closestOrNull(anchorElement, step.anchorAncestor);

  return {
    element: ancestorElement ?? anchorElement,
    isAnchored: true,
    isMissing: false,
  };
};

/**
 * The steps a tour can actually show right now, plus the ids of the ones it cannot.
 *
 * The second half is the point. A tour that quietly drops a step when upstream moves a
 * route looks like it is working; this makes the gap a value a caller can read, log, or
 * assert on in a test.
 */
export const selectShowableEscTourSteps = (
  steps: EscTourStep[],
  root: ParentNode = document,
): { showableSteps: EscTourStep[]; missingStepIds: string[] } => {
  const showableSteps: EscTourStep[] = [];
  const missingStepIds: string[] = [];

  for (const step of steps) {
    const { isMissing } = resolveEscTourAnchor(step, root);

    if (isMissing) {
      missingStepIds.push(step.id);
      continue;
    }

    showableSteps.push(step);
  }

  return { showableSteps, missingStepIds };
};
