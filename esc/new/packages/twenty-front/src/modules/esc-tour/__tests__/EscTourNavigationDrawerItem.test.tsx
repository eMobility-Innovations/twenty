import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { EscTourMount } from '@/esc-tour/components/EscTourMount';
import { EscTourNavigationDrawerItem } from '@/esc-tour/components/EscTourNavigationDrawerItem';
import { resetEscTourStore } from '@/esc-tour/hooks/useEscTourStore';

/**
 * The upstream drawer item is mocked, but NOT `{ virtual: true }`.
 *
 * `virtual` tells jest the module need not exist. With it, upstream renaming or moving
 * `NavigationDrawerItem` left this suite perfectly green while the real build failed to
 * resolve the import — the mock stood in for a module that was no longer there. Mocking
 * the REAL path means jest resolves it, so a rename fails here first.
 *
 * The factory is not a stub either: it reproduces the part of upstream's
 * `useMouseDownNavigation` this component depends on (see
 * packages/twenty-ui/src/utilities/navigation/hooks/useMouseDownNavigation.ts) —
 * onClick is called from the CLICK event only when triggerEvent is 'CLICK', and from
 * MOUSE DOWN otherwise. That is what makes the keyboard test below a real test: drop
 * triggerEvent and it fails, exactly as the product did.
 */
jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem',
  () => ({
    NavigationDrawerItem: ({
      label,
      onClick,
      triggerEvent = 'MOUSE_DOWN',
      preventCollapseOnMobile = false,
    }: {
      label: string;
      onClick?: () => void;
      triggerEvent?: 'MOUSE_DOWN' | 'CLICK';
      preventCollapseOnMobile?: boolean;
    }) => (
      <button
        type="button"
        data-trigger-event={triggerEvent}
        data-prevent-collapse-on-mobile={String(preventCollapseOnMobile)}
        onClick={(event) => {
          if (triggerEvent === 'CLICK') {
            onClick?.();

            return;
          }

          event.preventDefault();
        }}
        onMouseDown={() => {
          if (triggerEvent !== 'CLICK') {
            onClick?.();
          }
        }}
      >
        {label}
      </button>
    ),
  }),
);

jest.mock('twenty-ui/display', () => ({ IconMap: () => null }));

/**
 * The button and the overlay, as the overlaid `NavigationDrawerOtherSection` arranges
 * them: the button inside the collapsible section, the mount outside it.
 * `isButtonMounted` stands in for collapsing "Other", which unmounts everything inside
 * that container.
 */
// EscTourMount calls useNavigate(), which throws outside a Router — the tour navigates
// between pages now, and in the real app the mount sits inside the app's RouterProvider.
// A MemoryRouter is the smallest thing that makes this harness the same shape as
// production; without it every test here fails on the same invariant and none of them
// is about routing.
const TourHarness = ({
  isButtonMounted = true,
}: {
  isButtonMounted?: boolean;
}) => (
  <MemoryRouter>
    {isButtonMounted && <EscTourNavigationDrawerItem />}
    <EscTourMount />
  </MemoryRouter>
);

describe('EscTourNavigationDrawerItem', () => {
  // Deliberately NOT `document.body.innerHTML = ''`. React Testing Library removes its
  // own container on cleanup, and wiping the body first takes that node away from under
  // it — every test then fails on unmount with "The node to be removed is not a child
  // of this node", which says nothing about the component.
  const addedNodes: HTMLElement[] = [];

  // The 'sidebar' step anchors on the drawer's own stable attribute, not on a route.
  const putNavigationDrawerOnThePage = () => {
    const drawer = document.createElement('div');

    drawer.setAttribute('data-click-outside-id', 'navigation-drawer');
    document.body.appendChild(drawer);
    addedNodes.push(drawer);
  };

  // The workspace-name step anchors on the workspace switcher's own test id
  // (MultiWorkspaceDropdownClickableComponent.tsx:31). It is route-less, so it is judged at
  // open() like the sidebar step beside it — a fixture that leaves it out makes the
  // every-anchor-resolves test fail for a reason that has nothing to do with the tour.
  const putWorkspaceSwitcherOnThePage = () => {
    const switcher = document.createElement('div');

    switcher.setAttribute('data-testid', 'workspace-dropdown');
    document.body.appendChild(switcher);
    addedNodes.push(switcher);
  };

  const putRouteLinksOnThePage = (routes: string[]) => {
    for (const route of routes) {
      const link = document.createElement('a');

      link.setAttribute('href', `/objects/${route}`);
      document.body.appendChild(link);
      addedNodes.push(link);
    }
  };

  beforeEach(() => {
    // The tour's state is a module-level store, so it outlives a test as deliberately
    // as it outlives a component. Each test starts from a freshly loaded page.
    resetEscTourStore();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    while (addedNodes.length > 0) {
      addedNodes.pop()?.remove();
    }

    document.getElementById('esc-tour-stylesheet')?.remove();
    jest.restoreAllMocks();
  });

  it('puts an entry called Tour in the sidebar', () => {
    render(<TourHarness />);

    expect(screen.getByText('Tour')).toBeInTheDocument();
  });

  it('shows nothing until the entry is pressed', () => {
    render(<TourHarness />);

    expect(document.querySelector('[data-esc-tour="popover"]')).toBeNull();
  });

  it('opens the tour when the entry is pressed with the mouse', () => {
    render(<TourHarness />);

    const tourButton = screen.getByText('Tour');

    fireEvent.mouseDown(tourButton);
    fireEvent.click(tourButton);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  // THE BUG THIS TEST EXISTS FOR: a native <button> activated with Enter or Space fires
  // 'click' and NOT 'mousedown'. Upstream's hook defaults to opening on MOUSE DOWN and
  // its click handler does nothing but preventDefault, so Tour was unreachable from the
  // keyboard — the one input device a person learning the product is most likely to be
  // using.
  it('opens the tour when the entry is activated from the keyboard', () => {
    render(<TourHarness />);

    // Enter and Space on a button produce a click with no mousedown before it.
    fireEvent.click(screen.getByText('Tour'));

    expect(document.querySelector('[data-esc-tour="popover"]')).not.toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('asks upstream to open on click rather than on mouse down', () => {
    render(<TourHarness />);

    expect(screen.getByText('Tour')).toHaveAttribute(
      'data-trigger-event',
      'CLICK',
    );
  });

  // At 768px and below the drawer collapses on navigation. Its links stay in the DOM,
  // so every anchored step still resolves and nothing warns — the tour spotlights a
  // clipped, zero-width region and looks, to the person, like it is pointing at
  // nothing.
  it('does not let the sidebar collapse out from under the tour on a phone', () => {
    render(<TourHarness />);

    expect(screen.getByText('Tour')).toHaveAttribute(
      'data-prevent-collapse-on-mobile',
      'true',
    );
  });

  it('starts on the welcome step, which needs no anchor to be on the page', () => {
    render(<TourHarness />);

    fireEvent.click(screen.getByText('Tour'));

    expect(
      document.querySelector('[data-esc-tour-step="welcome"]'),
    ).not.toBeNull();
  });

  // Collapsing the "Other" section unmounts the button. While the overlay was mounted
  // from the button, that took the whole tour with it, portal and all, mid-flight.
  it('survives the button being unmounted under it', () => {
    const { rerender } = render(<TourHarness />);

    fireEvent.click(screen.getByText('Tour'));

    expect(document.querySelector('[data-esc-tour="popover"]')).not.toBeNull();

    rerender(<TourHarness isButtonMounted={false} />);

    expect(screen.queryByText('Tour')).toBeNull();
    expect(
      document.body.querySelector('[data-esc-tour="popover"]'),
    ).not.toBeNull();
  });

  // A tour that silently gets shorter looks exactly like a tour that works. On a page
  // with none of the object routes present, every anchored step is skipped — and the
  // person looking at a support ticket needs to be able to see that happened.
  it('names the steps it skipped, where a support person can read it', () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    render(<TourHarness />);
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

    putNavigationDrawerOnThePage();
    putWorkspaceSwitcherOnThePage();
    putRouteLinksOnThePage([
      'people',
      'companies',
      'orders',
      'repairs',
      'interactions',
      'tasks',
    ]);

    render(<TourHarness />);
    fireEvent.click(screen.getByText('Tour'));

    expect(warn).not.toHaveBeenCalled();
  });
});
