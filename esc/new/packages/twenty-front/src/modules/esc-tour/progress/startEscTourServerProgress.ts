import {
  ESC_TOUR_SCRIPT_VERSION,
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
  seedEscTourTeam,
  subscribeToEscTourTeamChoice,
} from '@/esc-tour/team/escTourTeam';

export type EscTourServerProgressOptions = {
  client: EscTourProgressGqlClient;
  workspaceMemberId: string;
  displayName: string;
  now?: () => Date;
  warn?: (message: string) => void;
};

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
}: EscTourServerProgressOptions): (() => void) => {
  let isStopped = false;
  let isDisabled = false;
  let record: EscTourProgressRecord | null = null;
  let furthestStepIndex = 0;

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

    if (!isStopped) {
      seedEscTourResumeStepId(
        escTourResumeStepIdFrom(loaded, ESC_TOUR_SCRIPT_VERSION),
      );
      seedEscTourTeam(loaded.team);
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

  const unsubscribeProgress = subscribeToEscTourProgress((event) =>
    enqueue(() => {
      const input = buildEscTourProgressUpdate(event, furthestStepIndex, now());

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
