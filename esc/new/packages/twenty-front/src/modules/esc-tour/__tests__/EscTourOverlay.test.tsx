import { fireEvent, render, screen } from '@testing-library/react';

import { EscTourOverlay } from '@/esc-tour/components/EscTourOverlay';
import { type EscTourController } from '@/esc-tour/hooks/useEscTour';

const buildController = (
  overrides: Partial<EscTourController> = {},
): EscTourController => ({
  isOpen: true,
  step: { id: 'people', title: 'People', body: 'Every customer.' },
  stepIndex: 0,
  stepCount: 3,
  anchorRect: { top: 100, left: 20, width: 200, height: 32 },
  missingStepIds: [],
  open: jest.fn(),
  close: jest.fn(),
  next: jest.fn(),
  previous: jest.fn(),
  ...overrides,
});

describe('EscTourOverlay', () => {
  // Deliberately NOT `document.body.innerHTML = ''`. React Testing Library removes its own
  // container on cleanup, and wiping the body first takes that node away from under it —
  // every test then fails on unmount with "The node to be removed is not a child of this
  // node", which says nothing about the component. Anything a test adds itself is removed
  // by reference instead.
  const addedNodes: HTMLElement[] = [];

  const addToPage = (element: HTMLElement) => {
    document.body.appendChild(element);
    addedNodes.push(element);

    return element;
  };

  afterEach(() => {
    while (addedNodes.length > 0) {
      addedNodes.pop()?.remove();
    }
  });

  it('renders nothing while the tour is closed', () => {
    const { container } = render(
      <EscTourOverlay tour={buildController({ isOpen: false })} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(document.querySelector('[data-esc-tour="popover"]')).toBeNull();
  });

  it('renders nothing when there is no step, even if it is open', () => {
    render(<EscTourOverlay tour={buildController({ step: null })} />);

    expect(document.querySelector('[data-esc-tour="popover"]')).toBeNull();
  });

  it('shows the step copy and where the person is in the tour', () => {
    render(<EscTourOverlay tour={buildController()} />);

    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Every customer.')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  // The overlay has to escape the navigation drawer's stacking context, or the spotlight
  // paints underneath the very thing it is pointing at.
  it('renders into document.body rather than in place', () => {
    const { container } = render(<EscTourOverlay tour={buildController()} />);

    expect(container).toBeEmptyDOMElement();
    expect(
      document.body.querySelector('[data-esc-tour="popover"]'),
    ).not.toBeNull();
  });

  it('is announced as a modal dialog labelled with the step title', () => {
    render(<EscTourOverlay tour={buildController()} />);

    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'People');
  });

  it('moves focus into the popover so the keyboard lands there', () => {
    render(<EscTourOverlay tour={buildController()} />);

    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  // Blocking the mouse and leaving Tab free is the same hole by a different input device.
  it('pulls focus back when something behind the overlay takes it', () => {
    const outsideButton = addToPage(document.createElement('button'));

    render(<EscTourOverlay tour={buildController()} />);

    fireEvent.focusIn(outsideButton);

    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('paints a spotlight over the anchor when the step has one', () => {
    render(<EscTourOverlay tour={buildController()} />);

    const spotlight = document.querySelector(
      '[data-esc-tour="spotlight"]',
    ) as HTMLElement;

    expect(spotlight).not.toBeNull();
    expect(spotlight.style.getPropertyValue('--esc-tour-top')).toBe('100px');
    expect(spotlight.style.getPropertyValue('--esc-tour-left')).toBe('20px');
    expect(spotlight.style.getPropertyValue('--esc-tour-width')).toBe('200px');
    expect(spotlight.style.getPropertyValue('--esc-tour-height')).toBe('32px');
  });

  it('collapses the spotlight for a step that addresses the whole screen', () => {
    render(<EscTourOverlay tour={buildController({ anchorRect: null })} />);

    const spotlight = document.querySelector(
      '[data-esc-tour="spotlight-none"]',
    ) as HTMLElement;

    expect(spotlight).not.toBeNull();
    expect(spotlight.style.getPropertyValue('--esc-tour-width')).toBe('0px');
  });

  it('covers the page with an interaction lock', () => {
    render(<EscTourOverlay tour={buildController()} />);

    expect(
      document.querySelector('[data-esc-tour="interaction-lock"]'),
    ).not.toBeNull();
  });

  describe('its stylesheet', () => {
    afterEach(() => {
      document.getElementById('esc-tour-stylesheet')?.remove();
    });

    it('is put in the document head', () => {
      render(<EscTourOverlay tour={buildController()} />);

      const style = document.getElementById('esc-tour-stylesheet');

      expect(style).not.toBeNull();
      expect(style?.textContent).toContain('.esc-tour-popover');
    });

    // Idempotent by id, not by a module-level flag — a second mount or a hot reload must
    // not leave two copies of the rules behind.
    it('is not added twice when the overlay mounts again', () => {
      const first = render(<EscTourOverlay tour={buildController()} />);

      first.unmount();
      render(<EscTourOverlay tour={buildController()} />);

      expect(document.querySelectorAll('#esc-tour-stylesheet')).toHaveLength(1);
    });

    // It is added on mount, not on open, so the first frame of the first tour is already
    // styled rather than flashing unstyled markup.
    it('is added even while the tour is closed', () => {
      render(<EscTourOverlay tour={buildController({ isOpen: false })} />);

      expect(document.getElementById('esc-tour-stylesheet')).not.toBeNull();
    });
  });

  describe('the controls', () => {
    it('advances on Next', () => {
      const tour = buildController();

      render(<EscTourOverlay tour={tour} />);
      fireEvent.click(screen.getByText('Next'));

      expect(tour.next).toHaveBeenCalledTimes(1);
    });

    it('closes on Close', () => {
      const tour = buildController();

      render(<EscTourOverlay tour={tour} />);
      fireEvent.click(screen.getByText('Close'));

      expect(tour.close).toHaveBeenCalledTimes(1);
    });

    it('offers no Back on the first step', () => {
      render(<EscTourOverlay tour={buildController({ stepIndex: 0 })} />);

      expect(screen.queryByText('Back')).toBeNull();
    });

    it('offers Back once the tour has moved on', () => {
      const tour = buildController({ stepIndex: 1 });

      render(<EscTourOverlay tour={tour} />);
      fireEvent.click(screen.getByText('Back'));

      expect(tour.previous).toHaveBeenCalledTimes(1);
    });

    it('says Finish rather than Next on the last step', () => {
      render(
        <EscTourOverlay
          tour={buildController({ stepIndex: 2, stepCount: 3 })}
        />,
      );

      expect(screen.getByText('Finish')).toBeInTheDocument();
      expect(screen.queryByText('Next')).toBeNull();
    });
  });
});
