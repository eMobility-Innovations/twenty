import { act, renderHook } from '@testing-library/react';

import { useEscTour } from '@/esc-tour/hooks/useEscTour';
import {
  ESC_TOUR_RESUME_KEY,
  resetEscTourStore,
} from '@/esc-tour/hooks/useEscTourStore';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';

const STEPS: EscTourStep[] = [
  { id: 'welcome', title: 'Welcome', body: 'W' },
  {
    id: 'people',
    title: 'People',
    body: 'P',
    anchor: 'a[href="/objects/people"]',
  },
  {
    id: 'gone',
    title: 'Gone',
    body: 'G',
    anchor: 'a[href="/objects/unicorns"]',
  },
  { id: 'done', title: 'Done', body: 'D' },
];

const renderTour = (steps: EscTourStep[] = STEPS) =>
  renderHook(() => useEscTour(steps));

const putPeopleLinkOnThePage = () => {
  document.body.innerHTML = '<nav><a href="/objects/people">People</a></nav>';
};

const pressKey = (key: string) => {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    );
  });
};

const addButtonToPage = (): HTMLButtonElement => {
  const button = document.createElement('button');

  document.body.appendChild(button);

  return button;
};

// jsdom does not implement scrollIntoView at all, so there is nothing to spy on — it
// has to be supplied. The tour guards on `typeof`, and one test below removes it again
// to prove it.
const scrollIntoViewMock = jest.fn();

describe('useEscTour', () => {
  beforeEach(() => {
    putPeopleLinkOnThePage();
    // The tour's state is a module-level store. Resetting it is what a page load does;
    // the resume position lives in sessionStorage and is cleared separately, on
    // purpose, so a test can reset one without the other.
    resetEscTourStore();
    window.sessionStorage.clear();
    scrollIntoViewMock.mockClear();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('starts closed, with no step and nothing reported missing', () => {
    const { result } = renderTour();

    expect(result.current.isOpen).toBe(false);
    expect(result.current.step).toBeNull();
    expect(result.current.missingStepIds).toEqual([]);
  });

  it('opens on the first showable step and drops the one whose anchor is absent', () => {
    const { result } = renderTour();

    act(() => result.current.open());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.step?.id).toBe('welcome');
    expect(result.current.stepCount).toBe(3);
    expect(result.current.missingStepIds).toEqual(['gone']);
  });

  it('walks forward through the showable steps only', () => {
    const { result } = renderTour();

    act(() => result.current.open());
    act(() => result.current.next());

    expect(result.current.step?.id).toBe('people');

    act(() => result.current.next());

    // 'gone' is skipped entirely — the tour goes straight to the closing step.
    expect(result.current.step?.id).toBe('done');
  });

  it('closes when Next is pressed on the last step', () => {
    const { result } = renderTour();

    act(() => result.current.open());
    act(() => result.current.next());
    act(() => result.current.next());

    expect(result.current.stepIndex).toBe(result.current.stepCount - 1);

    act(() => result.current.next());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.anchorRect).toBeNull();
  });

  it('goes back, and will not go back past the first step', () => {
    const { result } = renderTour();

    act(() => result.current.open());
    act(() => result.current.next());

    expect(result.current.stepIndex).toBe(1);

    act(() => result.current.previous());
    act(() => result.current.previous());

    expect(result.current.stepIndex).toBe(0);
    expect(result.current.isOpen).toBe(true);
  });

  it('re-resolves the script on every open, so a route that appeared is picked up', () => {
    const { result } = renderTour();

    act(() => result.current.open());
    expect(result.current.stepCount).toBe(3);

    act(() => result.current.close());

    document.body.innerHTML =
      '<nav><a href="/objects/people">People</a><a href="/objects/unicorns">U</a></nav>';

    act(() => result.current.open());

    expect(result.current.stepCount).toBe(4);
    expect(result.current.missingStepIds).toEqual([]);
  });

  // The tour state outlives the component that renders it: that is the whole reason it
  // is a module store. Collapsing the sidebar's "Other" section unmounts the button,
  // and that used to take a running tour with it.
  it('keeps a running tour when the component that opened it unmounts', () => {
    const first = renderTour();

    act(() => first.result.current.open());
    act(() => first.result.current.next());
    first.unmount();

    const second = renderTour();

    expect(second.result.current.isOpen).toBe(true);
    expect(second.result.current.step?.id).toBe('people');
  });

  describe('keyboard', () => {
    it('closes on Escape', () => {
      const { result } = renderTour();

      act(() => result.current.open());
      pressKey('Escape');

      expect(result.current.isOpen).toBe(false);
    });

    it('advances on ArrowRight and retreats on ArrowLeft', () => {
      const { result } = renderTour();

      act(() => result.current.open());
      pressKey('ArrowRight');

      expect(result.current.step?.id).toBe('people');

      pressKey('ArrowLeft');

      expect(result.current.step?.id).toBe('welcome');
    });

    it('ignores the keyboard while the tour is closed', () => {
      const { result } = renderTour();

      pressKey('ArrowRight');
      pressKey('Escape');

      expect(result.current.isOpen).toBe(false);
      expect(result.current.step).toBeNull();
    });

    // The listener is on `document`, so leaving it attached would swallow Escape and
    // the arrow keys for the whole application after the tour had closed.
    it('detaches its key listener when the hook unmounts', () => {
      const removeEventListener = jest.spyOn(document, 'removeEventListener');
      const { result, unmount } = renderTour();

      act(() => result.current.open());
      unmount();

      expect(removeEventListener).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
      );

      removeEventListener.mockRestore();
    });
  });

  describe('focus', () => {
    // A tour that drops the person's place in the page is a tour that costs a keyboard
    // user a walk back through the whole sidebar.
    it('puts focus back on whatever opened the tour', () => {
      const opener = addButtonToPage();

      opener.focus();

      const { result } = renderTour();

      act(() => result.current.open());

      const somethingElse = addButtonToPage();

      somethingElse.focus();

      expect(document.activeElement).toBe(somethingElse);

      act(() => result.current.close());

      expect(document.activeElement).toBe(opener);
    });

    it('does not reach for an opener that has been taken off the page', () => {
      const opener = addButtonToPage();

      opener.focus();

      const { result } = renderTour();

      act(() => result.current.open());
      opener.remove();

      expect(() => act(() => result.current.close())).not.toThrow();
      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('resuming', () => {
    it('picks a run up where it was left when the page is reloaded', () => {
      const first = renderTour();

      act(() => first.result.current.open());
      act(() => first.result.current.next());

      expect(first.result.current.step?.id).toBe('people');

      // A refresh: the tree and the module store are gone, sessionStorage is not.
      first.unmount();
      resetEscTourStore();

      const second = renderTour();

      act(() => second.result.current.open());

      expect(second.result.current.step?.id).toBe('people');
      expect(second.result.current.isResumed).toBe(true);
    });

    it('forgets the position once the tour is finished', () => {
      const { result } = renderTour();

      act(() => result.current.open());
      act(() => result.current.next());
      act(() => result.current.next());
      act(() => result.current.next());

      expect(result.current.isOpen).toBe(false);
      expect(window.sessionStorage.getItem(ESC_TOUR_RESUME_KEY)).toBeNull();
    });

    it('forgets the position when the tour is deliberately skipped', () => {
      const { result } = renderTour();

      act(() => result.current.open());
      act(() => result.current.next());
      act(() => result.current.close());

      expect(window.sessionStorage.getItem(ESC_TOUR_RESUME_KEY)).toBeNull();
    });

    it('forgets the position when the tour is dismissed with Escape', () => {
      const { result } = renderTour();

      act(() => result.current.open());
      act(() => result.current.next());
      pressKey('Escape');

      expect(window.sessionStorage.getItem(ESC_TOUR_RESUME_KEY)).toBeNull();
    });

    // The position is stored as a step ID, not an index: the showable set is resolved
    // fresh on every open, so an index would quietly resume onto a different step.
    it('starts from the beginning when the stored step no longer exists', () => {
      window.sessionStorage.setItem(ESC_TOUR_RESUME_KEY, 'unicorns');

      const { result } = renderTour();

      act(() => result.current.open());

      expect(result.current.step?.id).toBe('welcome');
      expect(result.current.isResumed).toBe(false);
    });

    it('does not call a run that was only ever on step one a resumed run', () => {
      window.sessionStorage.setItem(ESC_TOUR_RESUME_KEY, 'welcome');

      const { result } = renderTour();

      act(() => result.current.open());

      expect(result.current.step?.id).toBe('welcome');
      expect(result.current.isResumed).toBe(false);
    });

    it('lets a resumed run start again from the top', () => {
      window.sessionStorage.setItem(ESC_TOUR_RESUME_KEY, 'people');

      const { result } = renderTour();

      act(() => result.current.open());

      expect(result.current.isResumed).toBe(true);

      act(() => result.current.startOver());

      expect(result.current.stepIndex).toBe(0);
      expect(result.current.step?.id).toBe('welcome');
      expect(result.current.isResumed).toBe(false);
      expect(window.sessionStorage.getItem(ESC_TOUR_RESUME_KEY)).toBe(
        'welcome',
      );
    });

    // Storage throws outright in some privacy modes. A tour that cannot remember its
    // place is a small loss; a tour that will not start is the feature not existing.
    it('still runs where sessionStorage throws on every call', () => {
      const deny = () => {
        throw new Error('The operation is insecure.');
      };

      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(deny);
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(deny);
      jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(deny);

      const { result } = renderTour();

      act(() => result.current.open());
      act(() => result.current.next());

      expect(result.current.isOpen).toBe(true);
      expect(result.current.step?.id).toBe('people');
      expect(result.current.isResumed).toBe(false);

      act(() => result.current.close());

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('bringing the target on screen', () => {
    it('scrolls the step anchor into view, smoothly by default', () => {
      const { result } = renderTour();

      act(() => result.current.open());
      act(() => result.current.next());

      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
    });

    it('scrolls nothing for a step that addresses the whole screen', () => {
      const { result } = renderTour();

      act(() => result.current.open());

      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    });

    it('does not fall over where scrollIntoView is not implemented', () => {
      delete (Element.prototype as Partial<Element>).scrollIntoView;

      const { result } = renderTour();

      act(() => result.current.open());

      expect(() => act(() => result.current.next())).not.toThrow();
      expect(result.current.step?.id).toBe('people');
    });
  });

  describe('the spotlight rectangle', () => {
    it('is null for a step that addresses the whole screen', async () => {
      const { result } = renderTour();

      act(() => result.current.open());
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.step?.id).toBe('welcome');
      expect(result.current.anchorRect).toBeNull();
    });

    it('is read from the anchor, padded, for an anchored step', async () => {
      const anchor = document.querySelector('a') as HTMLElement;

      anchor.getBoundingClientRect = () =>
        ({ top: 100, left: 20, width: 200, height: 32 }) as DOMRect;

      const { result } = renderTour([
        {
          id: 'people',
          title: 'P',
          body: 'P',
          anchor: 'a[href="/objects/people"]',
          padding: 6,
        },
      ]);

      act(() => result.current.open());
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.anchorRect).toEqual({
        top: 94,
        left: 14,
        width: 212,
        height: 44,
      });
    });

    // getBoundingClientRect forces a layout flush. Doing it on every frame cost one 60
    // times a second for as long as the tour was open, to catch a target that moves for
    // a few hundred milliseconds. The read is now on a frame interval — and still
    // immediate on the step change, which is the move somebody actually asked for.
    it('re-reads the anchor on an interval of frames, not on every frame', () => {
      const anchor = document.querySelector('a') as HTMLElement;
      const readRect = jest.fn(
        () => ({ top: 0, left: 0, width: 10, height: 10 }) as DOMRect,
      );

      anchor.getBoundingClientRect = readRect;

      const pendingFrames: FrameRequestCallback[] = [];

      jest
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          pendingFrames.push(callback);

          return pendingFrames.length;
        });

      const { result } = renderTour([
        {
          id: 'people',
          title: 'P',
          body: 'P',
          anchor: 'a[href="/objects/people"]',
        },
      ]);

      const runOneFrame = () => {
        const frame = pendingFrames.pop();

        act(() => {
          frame?.(0);
        });
      };

      act(() => result.current.open());

      // Read once, at once: the step change does not wait for the interval.
      expect(readRect).toHaveBeenCalledTimes(1);

      for (let frame = 0; frame < 5; frame++) {
        runOneFrame();
      }

      expect(readRect).toHaveBeenCalledTimes(1);

      runOneFrame();

      expect(readRect).toHaveBeenCalledTimes(2);
    });

    // A scroll moves the target on purpose, so it is read straight away rather than up
    // to an interval later — the property the throttle must not cost.
    it('re-reads the anchor at once when the page is scrolled', () => {
      const anchor = document.querySelector('a') as HTMLElement;
      const readRect = jest.fn(
        () => ({ top: 0, left: 0, width: 10, height: 10 }) as DOMRect,
      );

      anchor.getBoundingClientRect = readRect;

      jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

      const { result } = renderTour([
        {
          id: 'people',
          title: 'P',
          body: 'P',
          anchor: 'a[href="/objects/people"]',
        },
      ]);

      act(() => result.current.open());

      expect(readRect).toHaveBeenCalledTimes(1);

      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      expect(readRect).toHaveBeenCalledTimes(2);
    });

    it('stops tracking once the hook unmounts', () => {
      const cancelAnimationFrame = jest.spyOn(window, 'cancelAnimationFrame');
      const { result, unmount } = renderTour();

      act(() => result.current.open());
      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();

      cancelAnimationFrame.mockRestore();
    });
  });
});
