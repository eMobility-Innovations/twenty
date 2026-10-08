import { useContext, useEffect } from 'react';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { type EscTourProgressGqlClient } from '@/esc-tour/progress/escTourProgressClient';
import { startEscTourServerProgress } from '@/esc-tour/progress/startEscTourServerProgress';
import { ApolloCoreClientContext } from '@/object-metadata/contexts/ApolloCoreClientContext';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

/**
 * Mounts saved progress for the signed-in person. See `startEscTourServerProgress`.
 *
 * The client is read straight from `ApolloCoreClientContext`, NOT through upstream's
 * `useApolloCoreClient`: that hook THROWS when the context is absent
 * (packages/twenty-front/src/modules/object-metadata/hooks/useApolloCoreClient.ts:14), and
 * this runs inside the navigation drawer — a throw here would take the sidebar down. An
 * absent client or member simply means no saved progress.
 */
export const useEscTourServerProgress = () => {
  const client = useContext(ApolloCoreClientContext);
  const workspaceMember = useAtomStateValue(currentWorkspaceMemberState);

  const workspaceMemberId = workspaceMember?.id;
  const displayName =
    [workspaceMember?.name?.firstName, workspaceMember?.name?.lastName]
      .filter(Boolean)
      .join(' ') ||
    workspaceMember?.userEmail ||
    workspaceMemberId ||
    '';

  useEffect(() => {
    if (client === null || workspaceMemberId === undefined) {
      return;
    }

    // Narrowed to the two calls the writer makes, so its tests need no Apollo at all.
    const progressClient: EscTourProgressGqlClient = {
      query: (options) =>
        client.query(options as Parameters<typeof client.query>[0]),
      mutate: (options) =>
        client.mutate(options as Parameters<typeof client.mutate>[0]),
    };

    return startEscTourServerProgress({
      client: progressClient,
      workspaceMemberId,
      displayName,
    });
  }, [client, workspaceMemberId, displayName]);
};
