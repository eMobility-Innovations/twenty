import { type EscTourStep } from '@/esc-tour/types/EscTourStep';

/**
 * Resolve a step's anchor to a live element.
 *
 * Returns `null` for a step that has no anchor (a centred step) AND for a step whose
 * selector matches nothing. The two cases are told apart by `isAnchored`, because they are
 * different facts: one is a step that was written to be centred, the other is a step whose
 * target has moved and which the tour is about to skip.
 */
export const resolveEscTourAnchor = (
  step: EscTourStep,
  root: ParentNode = document,
): { element: HTMLElement | null; isAnchored: boolean; isMissing: boolean } => {
  if (step.anchor === undefined) {
    return { element: null, isAnchored: false, isMissing: false };
  }

  const anchorElement = root.querySelector<HTMLElement>(step.anchor);

  if (anchorElement === null) {
    return { element: null, isAnchored: true, isMissing: true };
  }

  if (step.anchorAncestor === undefined) {
    return { element: anchorElement, isAnchored: true, isMissing: false };
  }

  // A step may want the CONTAINER of a thing it can name. `closest` walks up from an
  // element we already found, so the container needs no identifying attribute of its own.
  const ancestorElement = anchorElement.closest<HTMLElement>(step.anchorAncestor);

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
