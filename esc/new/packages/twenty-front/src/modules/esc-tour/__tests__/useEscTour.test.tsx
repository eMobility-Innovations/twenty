import { act, renderHook } from '@testing-library/react';

import { useEscTour } from '@/esc-tour/hooks/useEscTour';
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

describe('useEscTour', () => {
  beforeEach(() => {
    putPeopleLinkOnThePage();
  });

  afterEach(() => {
    document.body.innerHTML = '';
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

    // The listener is on `document`, so leaving it attached would swallow Escape and the
    // arrow keys for the whole application after the tour had closed.
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
