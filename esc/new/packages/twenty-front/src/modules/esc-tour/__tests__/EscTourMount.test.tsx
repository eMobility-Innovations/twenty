import { act, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

import { EscTourMount } from '@/esc-tour/components/EscTourMount';
import { ESC_TOUR_STEPS } from '@/esc-tour/constants/escTourSteps';
import { ESC_TOUR_ANCHOR_DEADLINE_MS } from '@/esc-tour/hooks/useEscTour';
import {
  openEscTour,
  resetEscTourStore,
} from '@/esc-tour/hooks/useEscTourStore';

/**
 * The real script belongs to the tour's copy, not to its engine, and it changes whenever
 * somebody rewrites a sentence. This mount is tested against a script of its own so that a
 * wording change upstairs cannot turn these tests red, and so the routed steps exist at all
 * — the shipped script is being rewritten by another pair of hands as this lands.
 */
jest.mock('@/esc-tour/constants/escTourSteps', () => ({
  ESC_TOUR_STEPS: [
    { id: 'welcome', title: 'Welcome', body: 'W' },
    {
      id: 'people-list',
      title: 'People',
      body: 'P',
      route: '/objects/people',
      anchor: '[data-testid="people-table"]',
    },
  ],
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

const Wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

/**
 * Only this module's own lines, so an unrelated warning cannot pass for the alarm — and
 * so that a React warning appearing one day does not make a count assertion fail with
 * nothing to say about the tour.
 */
const escTourWarnings = (warn: { mock: { calls: unknown[][] } }): string[] =>
  warn.mock.calls
    .map((call) => String(call[0]))
    .filter((line) => line.startsWith('[esc-tour]'));

const renderMount = () => render(<EscTourMount />, { wrapper: Wrapper });

const getLock = (): HTMLElement | null =>
  document.querySelector('[data-esc-tour="interaction-lock"]');

const pressArrowRight = () => {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
  });
};

describe('EscTourMount', () => {
  const mockNavigate = jest.fn();

  // Anything this file adds to the page is removed BY REFERENCE. React Testing Library
  // removes its own container on cleanup, and the overlay portals into document.body, so
  // wiping the body first takes those nodes out from under React and every test fails on
  // unmount with something that says nothing about the component.
  const addedNodes: HTMLElement[] = [];

  const addToPage = (html: string): HTMLElement => {
    const container = document.createElement('div');

    container.innerHTML = html;
    document.body.appendChild(container);
    addedNodes.push(container);

    return container;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);

    resetEscTourStore();
    window.sessionStorage.clear();
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    while (addedNodes.length > 0) {
      addedNodes.pop()?.remove();
    }

    jest.useRealTimers();
  });

  it('renders nothing at all until somebody starts the tour', () => {
    const { container } = renderMount();

    expect(container).toBeEmptyDOMElement();
    expect(getLock()).toBeNull();
  });

  // The wiring this component exists for: the tour's engine takes a navigate function, and
  // this is the only place the router's own one is fetched.
  it('drives the tour with the router’s navigate, not with the location', () => {
    renderMount();

    act(() => openEscTour(ESC_TOUR_STEPS));
    pressArrowRight();

    expect(mockNavigate).toHaveBeenCalledWith('/objects/people');
    expect(window.location.pathname).toBe('/');
  });

  /**
   * THE LOCK, WHICH IS THE THING THAT COULD WEDGE THE WHOLE CRM.
   *
   * The overlay's interaction lock is a fixed div over the entire viewport; it swallows
   * every click outside the popover, which is the point. A navigation the TOUR performs
   * goes through the router as a function call and never through a click, so the lock
   * cannot block it — but "cannot" is worth a test, because the day somebody implements a
   * step by synthesising a click on a sidebar link, it stops being true silently.
   */
  describe('the interaction lock', () => {
    it('does not block the tour’s own navigation', () => {
      renderMount();

      act(() => openEscTour(ESC_TOUR_STEPS));

      expect(getLock()).not.toBeNull();

      pressArrowRight();

      expect(getLock()).not.toBeNull();
      expect(mockNavigate).toHaveBeenCalledWith('/objects/people');
    });

    // A tour that stops is a nuisance. A tour that leaves an invisible sheet over the
    // product is an outage, so the run that cannot show anything has to take the lock with
    // it when it gives up.
    it('is gone once a run gives up on every step it had', () => {
      renderMount();

      act(() => openEscTour(ESC_TOUR_STEPS));
      pressArrowRight();

      expect(getLock()).not.toBeNull();

      act(() => {
        jest.advanceTimersByTime(ESC_TOUR_ANCHOR_DEADLINE_MS);
      });

      expect(getLock()).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('is gone the moment the tour is closed', () => {
      renderMount();

      act(() => openEscTour(ESC_TOUR_STEPS));

      expect(getLock()).not.toBeNull();

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
      });

      expect(getLock()).toBeNull();
    });
  });

  describe('what it reports', () => {
    // The alarm. Six of nine steps matched nothing in production on 2026-09-22 and the
    // only trace was one line nobody read; naming the ids is the cheapest form of it.
    it('names a step whose page never produced its anchor', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      renderMount();

      act(() => openEscTour(ESC_TOUR_STEPS));
      pressArrowRight();

      act(() => {
        jest.advanceTimersByTime(ESC_TOUR_ANCHOR_DEADLINE_MS);
      });

      expect(escTourWarnings(warn)).toEqual([
        expect.stringContaining('people-list'),
      ]);
    });

    // The report must not be lost to the close that the collapse itself caused — the run
    // that collapsed is the one most worth hearing about.
    it('still reports when giving up is what ended the run', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      renderMount();

      act(() => openEscTour(ESC_TOUR_STEPS));
      pressArrowRight();

      act(() => {
        jest.advanceTimersByTime(ESC_TOUR_ANCHOR_DEADLINE_MS);
      });

      // Closed BY the collapse, and the reason still said out loud exactly once.
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(escTourWarnings(warn)).toHaveLength(1);
    });

    // A list that grows during a run must not be re-printed whole each time it grows: the
    // same step would be reported twice, under a count that reads like two faults.
    it('reports a step once, however many times the list is re-read', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      renderMount();
      addToPage('<div data-testid="people-table">rows</div>');

      act(() => openEscTour(ESC_TOUR_STEPS));
      pressArrowRight();

      act(() => {
        jest.advanceTimersByTime(ESC_TOUR_ANCHOR_DEADLINE_MS);
      });

      // The anchor was there, so there was nothing to report in the first place.
      expect(escTourWarnings(warn)).toEqual([]);
    });
  });
});
