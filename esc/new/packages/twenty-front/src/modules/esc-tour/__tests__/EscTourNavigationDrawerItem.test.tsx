import { fireEvent, render, screen } from '@testing-library/react';

import { EscTourNavigationDrawerItem } from '@/esc-tour/components/EscTourNavigationDrawerItem';

// The upstream drawer item is mocked on purpose. Rendering the real one drags in lingui,
// the theme, the router and the jotai store, none of which this component's wiring depends
// on — and a test that needs five providers to prove one onClick is a test that breaks every
// time upstream moves a provider. What is under test here is OUR wiring: that the sidebar
// entry exists, that pressing it opens the tour, and that skipped steps get named.
jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem',
  () => ({
    NavigationDrawerItem: ({
      label,
      onClick,
    }: {
      label: string;
      onClick?: () => void;
    }) => (
      <button type="button" onClick={onClick}>
        {label}
      </button>
    ),
  }),
  { virtual: true },
);

jest.mock('twenty-ui/display', () => ({ IconMap: () => null }), {
  virtual: true,
});

describe('EscTourNavigationDrawerItem', () => {
  // Deliberately NOT `document.body.innerHTML = ''`. React Testing Library removes its own
  // container on cleanup, and wiping the body first takes that node away from under it —
  // every test then fails on unmount with "The node to be removed is not a child of this
  // node", which says nothing about the component.
  const addedNodes: HTMLElement[] = [];

  const putRouteLinksOnThePage = (routes: string[]) => {
    for (const route of routes) {
      const link = document.createElement('a');

      link.setAttribute('href', `/objects/${route}`);
      document.body.appendChild(link);
      addedNodes.push(link);
    }
  };

  afterEach(() => {
    while (addedNodes.length > 0) {
      addedNodes.pop()?.remove();
    }

    document.getElementById('esc-tour-stylesheet')?.remove();
    jest.restoreAllMocks();
  });

  it('puts an entry called Tour in the sidebar', () => {
    render(<EscTourNavigationDrawerItem />);

    expect(screen.getByText('Tour')).toBeInTheDocument();
  });

  it('shows nothing until the entry is pressed', () => {
    render(<EscTourNavigationDrawerItem />);

    expect(document.querySelector('[data-esc-tour="popover"]')).toBeNull();
  });

  it('opens the tour when the entry is pressed', () => {
    render(<EscTourNavigationDrawerItem />);

    fireEvent.click(screen.getByText('Tour'));

    expect(document.querySelector('[data-esc-tour="popover"]')).not.toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('starts on the welcome step, which needs no anchor to be on the page', () => {
    render(<EscTourNavigationDrawerItem />);

    fireEvent.click(screen.getByText('Tour'));

    expect(
      document.querySelector('[data-esc-tour-step="welcome"]'),
    ).not.toBeNull();
  });

  // A tour that silently gets shorter looks exactly like a tour that works. On a page with
  // none of the object routes present, every anchored step is skipped — and the person
  // looking at a support ticket needs to be able to see that happened.
  it('names the steps it skipped, where a support person can read it', () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    render(<EscTourNavigationDrawerItem />);
    fireEvent.click(screen.getByText('Tour'));

    expect(warn).toHaveBeenCalledTimes(1);

    const message = warn.mock.calls[0][0] as string;

    expect(message).toContain('[esc-tour]');
    expect(message).toContain('people');
    expect(message).toContain('orders');
  });

  it('says nothing when every anchor resolves', () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    putRouteLinksOnThePage([
      'people',
      'companies',
      'orders',
      'repairs',
      'interactions',
      'tasks',
    ]);

    render(<EscTourNavigationDrawerItem />);
    fireEvent.click(screen.getByText('Tour'));

    expect(warn).not.toHaveBeenCalled();
  });
});
