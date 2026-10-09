import { type EscTourChapter } from '@/esc-tour/constants/escTourSteps';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';
import { escTourChaptersOf } from '@/esc-tour/utils/escTourChaptersOf';

/**
 * Forced replay of CHANGED chapters, and the admin reset (RM #22315).
 *
 * HOW A CHANGE IS DECLARED
 *
 * Every chapter carries a content version here. Rewriting a chapter means bumping its number
 * in the same commit; nothing else. On the next page load, everybody who has been through
 * the tour and saw an OLDER version of that chapter is walked through it once, on its own —
 * not the whole tour again.
 *
 * Why per chapter and not `ESC_TOUR_SCRIPT_VERSION`: that number guards a stored POSITION
 * (an old step id must not resume into a different tour). Bumping it says nothing about what
 * a person has already read, and replaying a thirty-step tour because one sentence in one
 * chapter changed is how a tour trains people to press Skip.
 *
 * A NEW chapter has no entry in anybody's seen map. It counts as changed for somebody who
 * FINISHED the tour (they have seen everything that existed), and not for somebody who
 * skipped it — they never read the tour at all, and forcing it on them is the opposite of
 * the choice they made. They still get it the next time they press Tour.
 */
// Written out by name, not derived from the step constants: this module is imported by the
// progress writer at load, and computing it from `ESC_TOUR_CHAPTERS` there read the constants
// before they existed (an import cycle through the store). `escTourReplay.test.ts` fails if a
// chapter a reader can be shown is missing from this map.
export const ESC_TOUR_CHAPTER_VERSIONS: Record<string, number> = {
  'Where you are': 1,
  'The left panel': 1,
  'A list of records': 1,
  'One customer page': 1,
  'Getting around': 1,
  'Your day in Sales': 1,
  'Your day in Customer service': 1,
};

/**
 * What a row written before this shipped is taken to have seen: every chapter that existed
 * then, at version 1. FROZEN — it describes the past, so it is never edited when a chapter
 * is bumped or added. Without it, every row already marked `completed` would read as having
 * seen nothing and the whole tour would be forced on everybody who had finished it.
 */
export const ESC_TOUR_LEGACY_SEEN_CHAPTERS: Readonly<Record<string, number>> =
  Object.freeze({
    'Where you are': 1,
    'The left panel': 1,
    'A list of records': 1,
    'One customer page': 1,
    'Getting around': 1,
    'Your day in Sales': 1,
    'Your day in Customer service': 1,
  });

/**
 * A chapter that cannot be walked on its own. "One customer page" reads the customer to open
 * off the People list that "A list of records" stands on (`escTourPersonRecordRoute`);
 * replayed alone it has no list, every step resolves to nowhere, and the replay strands.
 */
const ESC_TOUR_CHAPTER_PREREQUISITES: Partial<Record<EscTourChapter, string>> =
  {
    'One customer page': 'A list of records',
  };

export type EscTourSeenChapters = Record<string, number>;

/** The stored map, or `null` when there is none or it is not a map of numbers. */
export const parseEscTourSeenChapters = (
  raw: unknown,
): EscTourSeenChapters | null => {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Object.values(parsed).every((value) => typeof value === 'number')
    ) {
      return null;
    }

    return parsed as EscTourSeenChapters;
  } catch {
    return null;
  }
};

/** `seen`, with every chapter named stamped at its CURRENT version. */
export const markEscTourChaptersSeen = (
  seen: EscTourSeenChapters,
  chapters: string[],
): EscTourSeenChapters => ({
  ...seen,
  ...Object.fromEntries(
    chapters
      .filter((chapter) => ESC_TOUR_CHAPTER_VERSIONS[chapter] !== undefined)
      .map((chapter) => [chapter, ESC_TOUR_CHAPTER_VERSIONS[chapter]]),
  ),
});

export type EscTourReplayRecord = {
  outcome: string;
  seenChapterVersions?: string | null;
  replayRequested?: boolean | null;
};

/**
 * What the person has seen, as far as the writer should merge into. A row that has been
 * through the tour but predates the seen map gets the legacy baseline; anybody else starts
 * from nothing.
 */
export const escTourSeenChaptersFrom = (
  record: EscTourReplayRecord,
): EscTourSeenChapters =>
  parseEscTourSeenChapters(record.seenChapterVersions) ??
  (record.outcome === 'completed' || record.outcome === 'dismissed'
    ? { ...ESC_TOUR_LEGACY_SEEN_CHAPTERS }
    : {});

export type EscTourReplayDecision =
  | { kind: 'none' }
  | { kind: 'reset'; steps: EscTourStep[] }
  | { kind: 'changed'; chapters: string[]; steps: EscTourStep[] };

/**
 * Whether this page load opens the tour by itself, and with which steps.
 *
 *   - An admin asked for a replay (`replayRequested`): the whole script, from the top,
 *     whatever the person did before. That is the reset — for one person or for everyone,
 *     see `esc/deploy/request-esc-tour-replay.cjs`.
 *   - The person has been through the tour (`completed` or `dismissed`) and a chapter of
 *     THEIR script is newer than what they saw: those chapters, and nothing else.
 *   - Otherwise nothing. Somebody who has never opened the tour, or is part-way through it,
 *     gets the current script the next time they press Tour; nothing is forced on them.
 */
export const decideEscTourReplay = (
  record: EscTourReplayRecord,
  steps: EscTourStep[],
): EscTourReplayDecision => {
  if (record.replayRequested === true) {
    return { kind: 'reset', steps };
  }

  if (record.outcome !== 'completed' && record.outcome !== 'dismissed') {
    return { kind: 'none' };
  }

  const seen = escTourSeenChaptersFrom(record);
  const unseenVersion = record.outcome === 'completed' ? 0 : Infinity;
  const changed = escTourChaptersOf(steps).filter(
    (chapter) =>
      (ESC_TOUR_CHAPTER_VERSIONS[chapter] ?? 0) >
      (seen[chapter] ?? unseenVersion),
  );

  if (changed.length === 0) {
    return { kind: 'none' };
  }

  const walked = new Set(changed);

  for (const chapter of changed) {
    const prerequisite =
      ESC_TOUR_CHAPTER_PREREQUISITES[chapter as EscTourChapter];

    if (prerequisite !== undefined) {
      walked.add(prerequisite);
    }
  }

  return {
    kind: 'changed',
    chapters: changed,
    steps: steps.filter(
      (step) => step.chapter !== undefined && walked.has(step.chapter),
    ),
  };
};
