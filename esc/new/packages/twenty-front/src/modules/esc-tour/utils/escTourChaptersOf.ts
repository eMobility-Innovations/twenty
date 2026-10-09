import { type EscTourStep } from '@/esc-tour/types/EscTourStep';

/**
 * Chapters of a run, each once, in the order the run walks them.
 *
 * Its own file, importing nothing but a type: the store needs it for every progress event,
 * and reaching it through `escTourReplay` made the store import the step constants, whose
 * module graph leads back to the store — at load, a half-evaluated cycle.
 */
export const escTourChaptersOf = (steps: EscTourStep[]): string[] => [
  ...new Set(
    steps
      .map((step) => step.chapter)
      .filter((chapter): chapter is string => chapter !== undefined),
  ),
];
