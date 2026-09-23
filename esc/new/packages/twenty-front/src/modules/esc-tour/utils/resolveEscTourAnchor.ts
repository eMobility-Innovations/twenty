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
 * The steps a tour can actually show, plus the ids of the ones it cannot.
 *
 * The second half is the point. A tour that quietly drops a step when upstream moves a
 * route looks like it is working; this makes the gap a value a caller can read, log, or
 * assert on in a test.
 *
 * ONLY ROUTE-LESS STEPS ARE JUDGED HERE, AND THAT IS THE WHOLE CHANGE OF 2026-09-23
 *
 * This used to resolve EVERY step once, against the page the person was standing on when
 * they pressed Tour, and drop every one that did not match. For the sidebar-only tour that
 * was right: every anchor was inside the navigation drawer, which is on screen on every
 * page, so "not here now" genuinely meant "gone".
 *
 * It is fatal for a tour that navigates. A step anchored on a row of the People list is, at
 * open() time, on a page nobody has visited — it matches nothing, it would be dropped, and
 * the deep tour would collapse back to the sidebar-only tour leaving no more trace than the
 * `console.warn` that let six of nine steps vanish in production on 2026-09-22.
 *
 * So: a step that names a `route` is ALWAYS kept in the run. Its anchor is a claim about a
 * page that has not loaded, and this function has no evidence to rule on it with. The
 * ruling happens where the evidence is — once the tour has navigated there and given the
 * anchor until `ESC_TOUR_ANCHOR_DEADLINE_MS` to appear (`useEscTour`), which then drops it
 * through `skipUnreachableEscTourStep` and names it in this same `missingStepIds` list.
 * Nothing ends up quieter than before; it is decided later, against the right page.
 *
 * An `optional` step is the one thing dropped without being named — see
 * `EscTourStep.optional` for why an empty list is not drift.
 */
export const selectShowableEscTourSteps = (
  steps: EscTourStep[],
  root: ParentNode = document,
): { showableSteps: EscTourStep[]; missingStepIds: string[] } => {
  const showableSteps: EscTourStep[] = [];
  const missingStepIds: string[] = [];

  for (const step of steps) {
    if (step.route !== undefined) {
      showableSteps.push(step);
      continue;
    }

    const { isMissing } = resolveEscTourAnchor(step, root);

    if (isMissing) {
      if (step.optional !== true) {
        missingStepIds.push(step.id);
      }

      continue;
    }

    showableSteps.push(step);
  }

  return { showableSteps, missingStepIds };
};
