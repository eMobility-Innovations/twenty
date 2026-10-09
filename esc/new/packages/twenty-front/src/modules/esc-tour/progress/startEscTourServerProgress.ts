import { buildEscTourSteps } from '@/esc-tour/constants/escTourSteps';
import {
  ESC_TOUR_SCRIPT_VERSION,
  type EscTourProgressEvent,
  getEscTourSnapshot,
  openEscTour,
  seedEscTourResumeStepId,
  subscribeToEscTourProgress,
} from '@/esc-tour/hooks/useEscTourStore';
import {
  buildEscTourProgressUpdate,
  createEscTourProgress,
  escTourResumeStepIdFrom,
  type EscTourProgressGqlClient,
  type EscTourProgressRecord,
  loadEscTourProgress,
  updateEscTourProgress,
} from '@/esc-tour/progress/escTourProgressClient';
import {
  decideEscTourReplay,
  type EscTourSeenChapters,
  escTourSeenChaptersFrom,
  markEscTourChaptersSeen,
} from '@/esc-tour/replay/escTourReplay';
import {
  getEscTourTeam,
  seedEscTourTeam,
  subscribeToEscTourTeamChoice,
} from '@/esc-tour/team/escTourTeam';

/**
 * How long after the person's row is read the tour opens itself for a replay (RM #22315).
 * The row usually arrives while the CRM is still drawing its first page; a step that is
 * judged against a half-drawn page is dropped as unreachable. This is a wait for the first
 * paint, not a cadence.
 */
export const ESC_TOUR_REPLAY_OPEN_DELAY_MS = 2000;

export type EscTourServerProgressOptions = {
  client: EscTourProgressGqlClient;
  workspaceMemberId: string;
  displayName: string;
  now?: () => Date;
  warn?: (message: string) => void;
  /** Runs the replay's open later. Injected so a test need not wait out the delay. */
  schedule?: (open: () => void, delayMs: number) => void;
};

/**
 * What a closing run adds to the seen map. A finished run, and any replay — even one the
 * person skipped — has been put in front of them in full: asking again on every page load
 * is what would make the tour a nuisance. A run abandoned part-way counts only the chapters
 * it reached.
 */
const chaptersSeenBy = (event: EscTourProgressEvent): string[] =>
  event.kind === 'completed' || event.isReplay
    ? event.chapters
    : event.reachedChapters;

/**
 * Connect the tour to the person's saved progress, for as long as the returned function
 * has not been called.
 *
 * 1. Load this person's row; create it (`notStarted`) if there is none — so the report can
 *    name people who have never opened the tour, not only those who have.
 * 2. Seed the store with where an unfinished run of the same script stopped, and the team
 *    picker with the team chosen on another device (RM #22317).
 * 3. Write every progress event, and every team choice, in order, through one promise chain — two quick clicks
 *    must not land out of order and leave the row pointing at the earlier step.
 * 4. Open the tour by itself when an admin asked for a replay or a chapter the person has
 *    already been through has changed (RM #22315) — once: the request is cleared as the
 *    tour opens, and the replayed chapters are marked seen as it closes.
 *
 * FAILS SOFT, ALWAYS. The object not being provisioned yet, a permission refusal, the
 * network — any of them turns saved progress OFF for this page load with ONE named warning,
 * and the tour carries on exactly as it did before progress existed (this tab still resumes
 * from sessionStorage). A help feature must never be the reason the CRM misbehaves.
 */
export const startEscTourServerProgress = ({
  client,
  workspaceMemberId,
  displayName,
  now = () => new Date(),
  // eslint-disable-next-line no-console
  warn = (message) => console.warn(message),
  schedule = (open, delayMs) => {
    setTimeout(open, delayMs);
  },
}: EscTourServerProgressOptions): (() => void) => {
  let isStopped = false;
  let isDisabled = false;
  let record: EscTourProgressRecord | null = null;
  let furthestStepIndex = 0;
  let seenChapters: EscTourSeenChapters = {};

  const disable = (error: unknown) => {
    if (isDisabled) {
      return;
    }

    isDisabled = true;
    warn(
      `[esc-tour] saved progress is off for this page load: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  };

  let chain: Promise<void> = (async () => {
    const loaded =
      (await loadEscTourProgress(client, workspaceMemberId)) ??
      (await createEscTourProgress(client, workspaceMemberId, displayName));

    record = loaded;
    furthestStepIndex = loaded.furthestStepIndex ?? 0;
    seenChapters = escTourSeenChaptersFrom(loaded);

    if (!isStopped) {
      seedEscTourResumeStepId(
        escTourResumeStepIdFrom(loaded, ESC_TOUR_SCRIPT_VERSION),
      );
      seedEscTourTeam(loaded.team);
      scheduleReplay(loaded);
    }
  })().catch(disable);

  // Queued behind the load, so a write never races the row it writes to into existence.
  const enqueue = (buildInput: () => Record<string, unknown>) => {
    chain = chain
      .then(async () => {
        if (isDisabled || record === null) {
          return;
        }

        await updateEscTourProgress(client, record.id, buildInput());
      })
      .catch(disable);
  };

  // Declared as a function so the load above can call it; it only runs after the load.
  function scheduleReplay(loaded: EscTourProgressRecord) {
    const decision = decideEscTourReplay(
      loaded,
      buildEscTourSteps(getEscTourTeam()),
    );

    if (decision.kind === 'none') {
      return;
    }

    schedule(() => {
      // The person may have pressed Tour, or left, in the meantime. Their own run wins, and
      // the request stays for the next load.
      if (isStopped || isDisabled || getEscTourSnapshot().isOpen) {
        return;
      }

      openEscTour(decision.steps, { isReplay: true });

      if (decision.kind === 'reset') {
        enqueue(() => ({ replayRequested: false }));
      }
    }, ESC_TOUR_REPLAY_OPEN_DELAY_MS);
  }

  const unsubscribeProgress = subscribeToEscTourProgress((event) =>
    enqueue(() => {
      const isClosing = event.endReason !== undefined;

      if (isClosing) {
        seenChapters = markEscTourChaptersSeen(
          seenChapters,
          chaptersSeenBy(event),
        );
      }

      const input = buildEscTourProgressUpdate(
        event,
        furthestStepIndex,
        now(),
        isClosing ? seenChapters : undefined,
      );

      furthestStepIndex = input.furthestStepIndex as number;

      return input;
    }),
  );

  const unsubscribeTeam = subscribeToEscTourTeamChoice((team) =>
    enqueue(() => ({ team })),
  );

  return () => {
    isStopped = true;
    unsubscribeProgress();
    unsubscribeTeam();
  };
};
