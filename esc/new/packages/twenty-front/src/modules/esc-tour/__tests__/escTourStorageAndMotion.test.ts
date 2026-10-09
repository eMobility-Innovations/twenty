import { prefersReducedMotion } from '@/esc-tour/hooks/useEscTour';
import {
  ESC_TOUR_TEAM_KEY,
  chooseEscTourTeam,
  getEscTourTeam,
  resetEscTourTeam,
} from '@/esc-tour/team/escTourTeam';

// Two browser facilities the tour reads and must survive being absent or hostile:
// localStorage (the remembered team) and matchMedia (the reduced-motion preference).

describe('remembered team when localStorage throws', () => {
  const deny = () => {
    throw new Error('SecurityError: storage is disabled');
  };

  beforeEach(() => {
    window.localStorage.clear();
    resetEscTourTeam();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads as no team rather than throwing', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(deny);

    expect(getEscTourTeam()).toBeNull();
  });

  it('still records a choice for this page when the write throws', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(deny);

    expect(() => chooseEscTourTeam('sales')).not.toThrow();
    expect(getEscTourTeam()).toBe('sales');
  });

  it('ignores a stored value that is not a team', () => {
    window.localStorage.setItem(ESC_TOUR_TEAM_KEY, 'marketing');

    expect(getEscTourTeam()).toBeNull();
  });
});

describe('prefersReducedMotion', () => {
  const original = window.matchMedia;

  afterEach(() => {
    window.matchMedia = original;
  });

  it('is false where matchMedia does not exist', () => {
    // jsdom does not implement it; the tour must not crash there.
    (window as { matchMedia?: unknown }).matchMedia = undefined;

    expect(prefersReducedMotion()).toBe(false);
  });

  it.each([true, false])(
    'reports the system preference when matchMedia exists (%s)',
    (matches) => {
      const matchMedia = jest.fn().mockReturnValue({ matches });

      window.matchMedia = matchMedia as unknown as typeof window.matchMedia;

      expect(prefersReducedMotion()).toBe(matches);
      expect(matchMedia).toHaveBeenCalledWith(
        '(prefers-reduced-motion: reduce)',
      );
    },
  );
});
