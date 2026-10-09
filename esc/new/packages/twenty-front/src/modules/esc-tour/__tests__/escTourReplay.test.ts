import {
  ESC_TOUR_STEPS,
  buildEscTourSteps,
} from '@/esc-tour/constants/escTourSteps';
import {
  ESC_TOUR_CHAPTER_VERSIONS,
  ESC_TOUR_LEGACY_SEEN_CHAPTERS,
  decideEscTourReplay,
  escTourSeenChaptersFrom,
  markEscTourChaptersSeen,
  parseEscTourSeenChapters,
} from '@/esc-tour/replay/escTourReplay';
import { escTourChaptersOf } from '@/esc-tour/utils/escTourChaptersOf';

const ORIGINAL_VERSIONS = { ...ESC_TOUR_CHAPTER_VERSIONS };

const bump = (chapter: string) => {
  ESC_TOUR_CHAPTER_VERSIONS[chapter] =
    (ESC_TOUR_CHAPTER_VERSIONS[chapter] ?? 0) + 1;
};

const chaptersOfDecision = (
  decision: ReturnType<typeof decideEscTourReplay>,
) => (decision.kind === 'none' ? [] : escTourChaptersOf(decision.steps));

describe('escTourReplay (RM #22315)', () => {
  afterEach(() => {
    for (const key of Object.keys(ESC_TOUR_CHAPTER_VERSIONS)) {
      delete ESC_TOUR_CHAPTER_VERSIONS[key];
    }
    Object.assign(ESC_TOUR_CHAPTER_VERSIONS, ORIGINAL_VERSIONS);
  });

  it('versions every chapter a reader can be shown, shared and per team', () => {
    const everyChapter = escTourChaptersOf([
      ...buildEscTourSteps('sales'),
      ...buildEscTourSteps('cs'),
    ]);

    for (const chapter of everyChapter) {
      expect(ESC_TOUR_CHAPTER_VERSIONS[chapter]).toBeGreaterThanOrEqual(1);
    }
  });

  it('the legacy baseline covers what shipped, so nobody who finished is replayed on release', () => {
    expect(
      decideEscTourReplay({ outcome: 'completed' }, buildEscTourSteps('sales')),
    ).toEqual({ kind: 'none' });
    expect(
      decideEscTourReplay({ outcome: 'completed' }, buildEscTourSteps('cs')),
    ).toEqual({ kind: 'none' });
  });

  it('replays only the chapter that changed for somebody who finished', () => {
    bump('The left panel');

    const decision = decideEscTourReplay(
      { outcome: 'completed' },
      ESC_TOUR_STEPS,
    );

    expect(decision.kind).toBe('changed');
    expect(chaptersOfDecision(decision)).toEqual(['The left panel']);
  });

  it('replays a changed chapter for somebody who skipped part-way, if they had seen it', () => {
    bump('Where you are');

    const decision = decideEscTourReplay(
      {
        outcome: 'dismissed',
        seenChapterVersions: JSON.stringify({ 'Where you are': 1 }),
      },
      ESC_TOUR_STEPS,
    );

    expect(chaptersOfDecision(decision)).toEqual(['Where you are']);
  });

  it('never forces a chapter on somebody who skipped before reaching it', () => {
    bump('Getting around');

    expect(
      decideEscTourReplay(
        {
          outcome: 'dismissed',
          seenChapterVersions: JSON.stringify({ 'Where you are': 1 }),
        },
        ESC_TOUR_STEPS,
      ),
    ).toEqual({ kind: 'none' });
  });

  it('treats a chapter that did not exist as new for somebody who finished', () => {
    const decision = decideEscTourReplay(
      {
        outcome: 'completed',
        seenChapterVersions: JSON.stringify({
          ...ESC_TOUR_LEGACY_SEEN_CHAPTERS,
          'Your day in Sales': undefined,
        }),
      },
      buildEscTourSteps('sales'),
    );

    expect(chaptersOfDecision(decision)).toEqual(['Your day in Sales']);
  });

  it('walks the list before a changed customer page, which reads its customer off the list', () => {
    bump('One customer page');

    const decision = decideEscTourReplay(
      { outcome: 'completed' },
      ESC_TOUR_STEPS,
    );

    expect(decision.kind === 'changed' && decision.chapters).toEqual([
      'One customer page',
    ]);
    expect(chaptersOfDecision(decision)).toEqual([
      'A list of records',
      'One customer page',
    ]);
  });

  it('forces nothing on somebody who never opened the tour or is part-way through it', () => {
    bump('Where you are');

    expect(
      decideEscTourReplay({ outcome: 'notStarted' }, ESC_TOUR_STEPS),
    ).toEqual({ kind: 'none' });
    expect(
      decideEscTourReplay({ outcome: 'inProgress' }, ESC_TOUR_STEPS),
    ).toEqual({ kind: 'none' });
  });

  it('an admin request replays the whole script for anybody, from any outcome', () => {
    for (const outcome of [
      'notStarted',
      'inProgress',
      'completed',
      'dismissed',
    ]) {
      expect(
        decideEscTourReplay({ outcome, replayRequested: true }, ESC_TOUR_STEPS),
      ).toEqual({ kind: 'reset', steps: ESC_TOUR_STEPS });
    }
  });

  it('only a literal true is a request', () => {
    expect(
      decideEscTourReplay(
        { outcome: 'completed', replayRequested: null },
        ESC_TOUR_STEPS,
      ),
    ).toEqual({ kind: 'none' });
  });

  it.each([
    ['nothing', null],
    ['blank', '  '],
    ['not JSON', '{oops'],
    ['an array', '[1]'],
    ['a non-number', '{"Where you are":"1"}'],
    ['JSON null', 'null'],
  ])('reads %s as no seen map', (_label, raw) => {
    expect(parseEscTourSeenChapters(raw)).toBeNull();
  });

  it('a row that has been through the tour with no map gets the legacy baseline; others start empty', () => {
    expect(escTourSeenChaptersFrom({ outcome: 'dismissed' })).toEqual(
      ESC_TOUR_LEGACY_SEEN_CHAPTERS,
    );
    expect(escTourSeenChaptersFrom({ outcome: 'inProgress' })).toEqual({});
    expect(
      escTourSeenChaptersFrom({
        outcome: 'completed',
        seenChapterVersions: '{"Where you are":3}',
      }),
    ).toEqual({ 'Where you are': 3 });
  });

  it('stamps seen chapters at their current version and ignores names it does not know', () => {
    bump('Getting around');

    expect(
      markEscTourChaptersSeen({ 'Where you are': 1 }, [
        'Getting around',
        'Not a chapter',
      ]),
    ).toEqual({ 'Where you are': 1, 'Getting around': 2 });
  });
});
