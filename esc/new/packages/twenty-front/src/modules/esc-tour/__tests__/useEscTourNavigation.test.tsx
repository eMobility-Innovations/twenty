import { act, renderHook } from '@testing-library/react';

import {
  ESC_TOUR_ANCHOR_DEADLINE_MS,
  useEscTour,
  type EscTourNavigate,
} from '@/esc-tour/hooks/useEscTour';
import {
  ESC_TOUR_RESUME_KEY,
  resetEscTourStore,
} from '@/esc-tour/hooks/useEscTourStore';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';

/**
 * The tour that NAVIGATES: the sidebar steps are on every page, the last two are not.
 *
 * `people-list` and `companies-list` are the shape the deep script is being written to —
 * a route, and an anchor that only exists once that route has loaded. Neither can be
 * resolved from the page the tour is opened on, which is the whole reason
 * `selectShowableEscTourSteps` stopped resolving them there.
 */
const PEOPLE_TABLE = '[data-testid="people-table"]';
const COMPANIES_TABLE = '[data-testid="companies-table"]';

const STEPS: EscTourStep[] = [
  { id: 'welcome', title: 'Welcome', body: 'W' },
  {
    id: 'sidebar',
    title: 'Sidebar',
    body: 'S',
    anchor: '[data-click-outside-id="navigation-drawer"]',
  },
  {
    id: 'people-list',
    title: 'People',
    body: 'P',
    chapter: 'A list page',
    route: '/objects/people',
    anchor: PEOPLE_TABLE,
  },
  {
    id: 'companies-list',
    title: 'Companies',
    body: 'C',
    chapter: 'A list page',
    route: '/objects/companies',
    anchor: COMPANIES_TABLE,
  },
];

const RECORD_ID = 'c0a3d1e7-2b44-4a6f-9c8d-51e2f7b60a93';

describe('useEscTour, navigating', () => {
  /**
   * The router, as the tour actually gets it: a function that changes the path. Changing
   * it with `history.pushState` rather than by redefining `window.location` — jsdom makes
   * `location` non-configurable, so redefining it throws, and pushState is what a real
   * router does anyway.
   */
  let navigate: jest.Mock;

  /**
   * Frames are driven by hand rather than by a clock. The tracker re-reads the anchor
   * every sixth frame (TRACKER_FRAME_INTERVAL), so "the list finished loading" is a
   * specific number of frames, and a test that waits on a real rAF would be a test that
   * waits on the machine it runs on.
   */
  let pendingFrames: FrameRequestCallback[];

  /**
   * LAST scheduled, not first. Every step change tears the tracker down and starts a new
   * one, and the callbacks the old one had already queued are still sitting in this array
   * — running those would run a closure holding the PREVIOUS step and would quietly test
   * the wrong thing. The newest entry is always the live tracker's next frame, and running
   * it queues the one after it.
   */
  const runFrames = (frameCount: number) => {
    for (let frame = 0; frame < frameCount; frame++) {
      const nextFrame = pendingFrames.pop();

      act(() => {
        nextFrame?.(0);
      });
    }
  };

  /** One tracker read: the interval is six frames, and the first is used up at open. */
  const runOneTrackerRead = () => runFrames(6);

  const putOnPage = (html: string) => {
    const container = document.createElement('div');

    container.innerHTML = html;
    document.body.appendChild(container);

    return container;
  };

  const renderTour = (
    steps: EscTourStep[] = STEPS,
    navigateFunction: EscTourNavigate = navigate,
  ) => renderHook(() => useEscTour(steps, navigateFunction));

  /**
   * A tour with NO router at all — `useEscTour(steps)`, the shape every other test file
   * renders. It has a helper of its own rather than `renderTour(STEPS, undefined)`,
   * because passing `undefined` for a parameter that has a default takes the DEFAULT: that
   * call would have handed the tour a working router and quietly proved nothing.
   */
  const renderTourWithoutRouter = (steps: EscTourStep[] = STEPS) =>
    renderHook(() => useEscTour(steps));

  /** Walk from the opening step to the first step that needs a page of its own. */
  const walkToPeopleList = (result: {
    current: ReturnType<typeof useEscTour>;
  }) => {
    act(() => result.current.open());
    act(() => result.current.next());
    act(() => result.current.next());
  };

  beforeEach(() => {
    jest.useFakeTimers();

    navigate = jest.fn((path: string) => {
      window.history.pushState({}, '', path);
    });

    pendingFrames = [];
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => pendingFrames.push(callback));

    window.history.pushState({}, '', '/');
    putOnPage('<div data-click-outside-id="navigation-drawer">drawer</div>');

    resetEscTourStore();
    window.sessionStorage.clear();
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    // Mocks first, timers second: `useFakeTimers` installs its own
    // `requestAnimationFrame`, and restoring the spy after the clock has gone back to
    // real would put the faked one back as the "original".
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('getting to the page a step is about', () => {
    it('navigates when it reaches a step that names a route', () => {
      const { result } = renderTour();

      walkToPeopleList(result);

      expect(navigate).toHaveBeenCalledWith('/objects/people');
      expect(result.current.step?.id).toBe('people-list');
    });

    // The sidebar is on screen on every page. Moving somebody to another page to show
    // them something already in front of them would be the tour taking the wheel for no
    // reason.
    it('navigates nowhere for the steps that have no route', () => {
      const { result } = renderTour();

      act(() => result.current.open());
      act(() => result.current.next());

      expect(result.current.step?.id).toBe('sidebar');
      expect(navigate).not.toHaveBeenCalled();
    });

    // The route is a PREFIX. A reader already looking at one person's record is already
    // on the People list's page, and re-navigating would throw away the page they are on
    // to land somewhere they already were.
    it('stays put when the reader is already under the step’s route', () => {
      window.history.pushState({}, '', `/objects/people/${RECORD_ID}`);

      const { result } = renderTour();

      walkToPeopleList(result);

      expect(navigate).not.toHaveBeenCalled();
      expect(result.current.step?.id).toBe('people-list');
    });

    // The one thing this must never do. A full page load tears down the React tree, the
    // portal and the module store, so the tour would vanish at the first routed step.
    // Tested by taking the router away: if anything here fell back to `window.location`,
    // the path would move anyway.
    it('changes the page only through the function it was given', () => {
      const { result } = renderTourWithoutRouter();

      walkToPeopleList(result);

      expect(window.location.pathname).toBe('/');
    });
  });

  describe('waiting for the page to produce the anchor', () => {
    // The stale spotlight. The tracker's rect lives in React state and its
    // "did it move?" guard starts from null on every step, so before the `hasReadRect`
    // fix the PREVIOUS step's cut-out stayed painted over the new page.
    it('drops the previous step’s spotlight the moment it arrives', () => {
      const { result } = renderTour();

      act(() => result.current.open());
      act(() => result.current.next());

      expect(result.current.anchorRect).not.toBeNull();

      act(() => result.current.next());

      expect(result.current.step?.id).toBe('people-list');
      expect(result.current.anchorRect).toBeNull();
      expect(result.current.isWaitingForAnchor).toBe(true);
    });

    // This is the property the existing per-frame tracker already had — it re-resolves
    // the selector on every read rather than capturing an element — and the reason the
    // deadline was built on top of it instead of beside it.
    it('stops waiting when the page produces the anchor late', () => {
      const { result } = renderTour();

      walkToPeopleList(result);

      expect(result.current.isWaitingForAnchor).toBe(true);

      putOnPage('<div data-testid="people-table">rows</div>');
      runOneTrackerRead();

      expect(result.current.isWaitingForAnchor).toBe(false);
      expect(result.current.anchorRect).not.toBeNull();
      expect(result.current.step?.id).toBe('people-list');
    });

    // An anchor that arrived is an anchor the deadline has no business dropping.
    it('disarms the deadline once the anchor has appeared', () => {
      const { result } = renderTour();

      walkToPeopleList(result);
      putOnPage('<div data-testid="people-table">rows</div>');
      runOneTrackerRead();

      act(() => {
        jest.advanceTimersByTime(ESC_TOUR_ANCHOR_DEADLINE_MS * 2);
      });

      expect(result.current.step?.id).toBe('people-list');
      expect(result.current.missingStepIds).toEqual([]);
    });

    // A late anchor is scrolled to WHEN IT APPEARS. Looking for it once, at the moment
    // the step opened, is looking at a page that had not rendered it yet.
    it('brings a late anchor on screen when it turns up', () => {
      const scrollIntoView = jest.fn();

      Element.prototype.scrollIntoView = scrollIntoView;

      const { result } = renderTour();

      walkToPeopleList(result);
      scrollIntoView.mockClear();

      putOnPage('<div data-testid="people-table">rows</div>');
      runOneTrackerRead();

      expect(scrollIntoView).toHaveBeenCalledWith({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
      expect(result.current.isWaitingForAnchor).toBe(false);
    });
  });

  describe('when the anchor never appears', () => {
    it('gives up after the deadline, names the step, and moves on', () => {
      const { result } = renderTour();

      walkToPeopleList(result);

      expect(result.current.stepCount).toBe(4);

      act(() => {
        jest.advanceTimersByTime(ESC_TOUR_ANCHOR_DEADLINE_MS);
      });

      expect(result.current.missingStepIds).toEqual(['people-list']);
      expect(result.current.step?.id).toBe('companies-list');
      // Taken out of the run, not stepped over: the counter must not keep counting a step
      // nobody will ever be shown, and Back must not walk into it again.
      expect(result.current.stepCount).toBe(3);
      expect(navigate).toHaveBeenCalledWith('/objects/companies');
    });

    // An empty list has no first row. That is the workspace's data, not upstream drift.
    it('gives up quietly on an optional step', () => {
      const { result } = renderTour([
        { id: 'welcome', title: 'W', body: 'W' },
        {
          id: 'first-row',
          title: 'R',
          body: 'R',
          route: '/objects/people',
          anchor: '[data-testid="first-row"]',
          optional: true,
        },
        { id: 'done', title: 'D', body: 'D' },
      ]);

      act(() => result.current.open());
      act(() => result.current.next());

      act(() => {
        jest.advanceTimersByTime(ESC_TOUR_ANCHOR_DEADLINE_MS);
      });

      expect(result.current.step?.id).toBe('done');
      expect(result.current.missingStepIds).toEqual([]);
    });

    // A deadline armed one step ago must not drop the step the reader is on now.
    it('cancels the deadline when the reader moves on before it fires', () => {
      const { result } = renderTour();

      walkToPeopleList(result);

      act(() => {
        jest.advanceTimersByTime(ESC_TOUR_ANCHOR_DEADLINE_MS / 2);
      });

      act(() => result.current.previous());

      expect(result.current.step?.id).toBe('sidebar');

      act(() => {
        jest.advanceTimersByTime(ESC_TOUR_ANCHOR_DEADLINE_MS * 2);
      });

      expect(result.current.isOpen).toBe(true);
      expect(result.current.step?.id).toBe('sidebar');
      expect(result.current.missingStepIds).toEqual([]);
    });

    // The wedge this change most had to avoid: a tour left open with its interaction lock
    // over the whole CRM and no step it can show.
    it('closes the run rather than sitting on nothing it can show', () => {
      const { result } = renderTour([
        {
          id: 'people-list',
          title: 'P',
          body: 'P',
          route: '/objects/people',
          anchor: PEOPLE_TABLE,
        },
      ]);

      act(() => result.current.open());

      act(() => {
        jest.advanceTimersByTime(ESC_TOUR_ANCHOR_DEADLINE_MS);
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.step).toBeNull();
    });

    // And it closes CARRYING the report. A run that collapsed because its steps could not
    // be found is the one that most needs saying out loud — closing to the shared closed
    // state would erase the reason in the same tick it was written.
    it('keeps the report when the collapse is what ended the run', () => {
      const { result } = renderTour([
        {
          id: 'people-list',
          title: 'P',
          body: 'P',
          route: '/objects/people',
          anchor: PEOPLE_TABLE,
        },
      ]);

      act(() => result.current.open());

      act(() => {
        jest.advanceTimersByTime(ESC_TOUR_ANCHOR_DEADLINE_MS);
      });

      expect(result.current.missingStepIds).toEqual(['people-list']);
    });

    // Not a wait — a step whose page cannot be reached at all. Waiting eight seconds for
    // a navigation that is never going to start is eight seconds of lying to the reader.
    it('skips a routed step at once when it was given no router', () => {
      const { result } = renderTourWithoutRouter();

      walkToPeopleList(result);

      expect(result.current.isOpen).toBe(false);
      expect(result.current.missingStepIds).toEqual([
        'people-list',
        'companies-list',
      ]);
    });
  });

  describe('going back', () => {
    it('navigates back across a route boundary', () => {
      const { result } = renderTour();

      walkToPeopleList(result);
      putOnPage('<div data-testid="people-table">rows</div>');
      runOneTrackerRead();

      act(() => result.current.next());

      expect(navigate).toHaveBeenLastCalledWith('/objects/companies');

      act(() => result.current.previous());

      expect(result.current.step?.id).toBe('people-list');
      expect(navigate).toHaveBeenLastCalledWith('/objects/people');
    });

    // Landing on the step AFTER a dropped one would bounce somebody who pressed Back
    // straight forward again — a wall in the tour with no way past it.
    it('lands on the step before a dropped one when travelling backwards', () => {
      const { result } = renderTour();
      const peopleTable = putOnPage(
        '<div data-testid="people-table">rows</div>',
      );

      walkToPeopleList(result);
      runOneTrackerRead();

      expect(result.current.isWaitingForAnchor).toBe(false);

      act(() => result.current.next());

      expect(result.current.step?.id).toBe('companies-list');

      // The list page has gone away behind the tour — which is exactly what navigating
      // back to a route that no longer renders that anchor looks like.
      peopleTable.remove();

      act(() => result.current.previous());

      expect(result.current.step?.id).toBe('people-list');

      act(() => {
        jest.advanceTimersByTime(ESC_TOUR_ANCHOR_DEADLINE_MS);
      });

      expect(result.current.step?.id).toBe('sidebar');
      expect(result.current.missingStepIds).toEqual(['people-list']);
    });
  });

  describe('resuming', () => {
    // The position is stored as a step id and resolved against a fresh run. A run that
    // resumes into a step on another page has to be taken to that page, or it resumes
    // pointing at nothing.
    it('navigates to the page of the step it resumes into', () => {
      window.sessionStorage.setItem(ESC_TOUR_RESUME_KEY, 'people-list');

      const { result } = renderTour();

      act(() => result.current.open());

      expect(result.current.step?.id).toBe('people-list');
      expect(result.current.isResumed).toBe(true);
      expect(navigate).toHaveBeenCalledWith('/objects/people');
    });

    // Routed steps are carried into every run, so a stored position that names one is
    // still found — which it would not be if they were dropped at open, and the reader
    // would silently be sent back to the beginning.
    it('still finds a routed step in the run it resumes into', () => {
      window.sessionStorage.setItem(ESC_TOUR_RESUME_KEY, 'companies-list');

      const { result } = renderTour();

      act(() => result.current.open());

      expect(result.current.step?.id).toBe('companies-list');
      expect(result.current.stepCount).toBe(4);
    });
  });
});
