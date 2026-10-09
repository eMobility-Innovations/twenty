import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';

import { useEscTourServerProgress } from '@/esc-tour/progress/useEscTourServerProgress';
import { startEscTourServerProgress } from '@/esc-tour/progress/startEscTourServerProgress';
import { ApolloCoreClientContext } from '@/object-metadata/contexts/ApolloCoreClientContext';

// The hook is glue: it reads the Apollo client and the signed-in member and hands both to
// `startEscTourServerProgress`, whose behaviour has its own suite. What matters HERE is
// that it never starts without both, names the person sensibly, and stops on unmount.

jest.mock('@/object-metadata/contexts/ApolloCoreClientContext', () => {
  const { createContext } = jest.requireActual('react');

  return { ApolloCoreClientContext: createContext(null) };
});

jest.mock('@/auth/states/currentWorkspaceMemberState', () => ({
  currentWorkspaceMemberState: { key: 'currentWorkspaceMemberState' },
}));

let mockWorkspaceMember: unknown = null;

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => mockWorkspaceMember,
}));

jest.mock('@/esc-tour/progress/startEscTourServerProgress', () => ({
  startEscTourServerProgress: jest.fn(),
}));

const startMock = startEscTourServerProgress as jest.MockedFunction<
  typeof startEscTourServerProgress
>;

const fakeApollo = () => ({
  query: jest.fn().mockResolvedValue({ data: 'q' }),
  mutate: jest.fn().mockResolvedValue({ data: 'm' }),
});

const renderWith = (client: unknown) =>
  renderHook(() => useEscTourServerProgress(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <ApolloCoreClientContext.Provider value={client as never}>
        {children}
      </ApolloCoreClientContext.Provider>
    ),
  });

describe('useEscTourServerProgress', () => {
  let stop: jest.Mock;

  beforeEach(() => {
    stop = jest.fn();
    startMock.mockReset();
    startMock.mockReturnValue(stop);
    mockWorkspaceMember = {
      id: 'member-1',
      name: { firstName: 'Sam', lastName: 'Agent' },
      userEmail: 'sam@example.com',
    };
  });

  it('does not start without an Apollo client — the sidebar must not break', () => {
    renderWith(null);

    expect(startMock).not.toHaveBeenCalled();
  });

  it('does not start before anybody is signed in', () => {
    mockWorkspaceMember = null;

    renderWith(fakeApollo());

    expect(startMock).not.toHaveBeenCalled();
  });

  it('starts once with the member id and full name', () => {
    renderWith(fakeApollo());

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        workspaceMemberId: 'member-1',
        displayName: 'Sam Agent',
      }),
    );
  });

  it.each([
    [
      'first name only',
      { id: 'm', name: { firstName: 'Sam', lastName: '' }, userEmail: 'e@x' },
      'Sam',
    ],
    [
      'no name — the email',
      { id: 'm', name: { firstName: '', lastName: '' }, userEmail: 'e@x' },
      'e@x',
    ],
    ['no name and no email — the id', { id: 'm', name: null }, 'm'],
  ])('names the person by %s', (_label, member, expected) => {
    mockWorkspaceMember = member;

    renderWith(fakeApollo());

    expect(startMock.mock.calls[0][0].displayName).toBe(expected);
  });

  it('passes query and mutate straight through to Apollo', async () => {
    const apollo = fakeApollo();

    renderWith(apollo);

    const { client } = startMock.mock.calls[0][0];
    const queryOptions = {
      query: 'Q' as never,
      variables: { a: 1 },
      fetchPolicy: 'network-only' as const,
    };
    const mutateOptions = { mutation: 'M' as never, variables: { b: 2 } };

    await expect(client.query(queryOptions)).resolves.toEqual({ data: 'q' });
    await expect(client.mutate(mutateOptions)).resolves.toEqual({ data: 'm' });
    expect(apollo.query).toHaveBeenCalledWith(queryOptions);
    expect(apollo.mutate).toHaveBeenCalledWith(mutateOptions);
  });

  it('stops the writer on unmount', () => {
    const { unmount } = renderWith(fakeApollo());

    unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does not restart on a re-render with the same person', () => {
    const { rerender } = renderWith(fakeApollo());

    rerender();

    expect(startMock).toHaveBeenCalledTimes(1);
  });
});
