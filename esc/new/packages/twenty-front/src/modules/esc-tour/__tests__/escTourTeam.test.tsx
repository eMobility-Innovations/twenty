import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';

import { EscTourOverlay } from '@/esc-tour/components/EscTourOverlay';
import {
  buildEscTourSteps,
  ESC_TOUR_OBJECT_ROUTES,
  ESC_TOUR_STEPS,
} from '@/esc-tour/constants/escTourSteps';
import {
  ESC_TOUR_TEAM_CHAPTERS,
  ESC_TOUR_TEAM_STEPS,
} from '@/esc-tour/constants/escTourTeamSteps';
import {
  type EscTourController,
  useEscTour,
} from '@/esc-tour/hooks/useEscTour';
import {
  continueEscTourWithSteps,
  type EscTourProgressEvent,
  getEscTourSnapshot,
  goToNextEscTourStep,
  openEscTour,
  resetEscTourStore,
  subscribeToEscTourProgress,
} from '@/esc-tour/hooks/useEscTourStore';
import {
  chooseEscTourTeam,
  ESC_TOUR_TEAM_KEY,
  ESC_TOUR_TEAMS,
  type EscTourTeam,
  getEscTourTeam,
  resetEscTourTeam,
  seedEscTourTeam,
  subscribeToEscTourTeamChoice,
} from '@/esc-tour/team/escTourTeam';
import { type EscTourStep } from '@/esc-tour/types/EscTourStep';
import { escTourPersonRecordRoute } from '@/esc-tour/utils/escTourPersonRecordRoute';

const TEAMS: EscTourTeam[] = ['sales', 'cs'];
const PERSON_ID = '6f1f4d2a-9b3e-4f7a-8c21-0d9e5b7a3c14';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetEscTourTeam();
  resetEscTourStore();
  document.body.innerHTML = '';
});

describe('escTourTeam — remembering the choice', () => {
  it('knows no team until one is chosen', () => {
    expect(getEscTourTeam()).toBeNull();
  });

  it('remembers a choice in this browser, across a reload of the module state', () => {
    chooseEscTourTeam('cs');
    resetEscTourTeam();

    expect(window.localStorage.getItem(ESC_TOUR_TEAM_KEY)).toBe('cs');
    expect(getEscTourTeam()).toBe('cs');
  });

  it('ignores a stored value that is not a team', () => {
    window.localStorage.setItem(ESC_TOUR_TEAM_KEY, 'marketing');

    expect(getEscTourTeam()).toBeNull();
  });

  it('tells the recorder about a choice, and never about a seed', () => {
    const heard: EscTourTeam[] = [];

    subscribeToEscTourTeamChoice((team) => heard.push(team));
    seedEscTourTeam('sales');
    chooseEscTourTeam('cs');

    expect(heard).toEqual(['cs']);
  });

  it('takes the team another device chose', () => {
    seedEscTourTeam('sales');

    expect(getEscTourTeam()).toBe('sales');
  });

  it('never lets the server copy overwrite a choice made on this page', () => {
    chooseEscTourTeam('cs');
    seedEscTourTeam('sales');

    expect(getEscTourTeam()).toBe('cs');
  });

  it('ignores a server value that is not a team', () => {
    seedEscTourTeam('marketing');
    seedEscTourTeam(null);

    expect(getEscTourTeam()).toBeNull();
  });
});

describe('escTourPersonRecordRoute — a customer page read off the page', () => {
  const peopleList = (rowIds: string[]) => {
    const root = document.createElement('div');

    root.innerHTML = rowIds
      .map((id) => `<div data-testid="row-id-${id}"></div>`)
      .join('');

    return root;
  };

  it('opens the first customer on the People list', () => {
    expect(
      escTourPersonRecordRoute(
        peopleList([PERSON_ID, '00000000-0000-4000-8000-000000000000']),
        '/objects/people',
      ),
    ).toBe(`/object/person/${PERSON_ID}`);
  });

  it('stays on the customer it is already showing', () => {
    expect(
      escTourPersonRecordRoute(peopleList([]), `/object/person/${PERSON_ID}`),
    ).toBe(`/object/person/${PERSON_ID}`);
  });

  it('opens nobody from an empty list', () => {
    expect(
      escTourPersonRecordRoute(peopleList([]), '/objects/people'),
    ).toBeNull();
  });

  it('never sends a row of another list to the person page', () => {
    expect(
      escTourPersonRecordRoute(peopleList([PERSON_ID]), '/objects/orders'),
    ).toBeNull();
  });

  it('refuses a row id that is not a uuid', () => {
    expect(
      escTourPersonRecordRoute(peopleList(['not-a-uuid']), '/objects/people'),
    ).toBeNull();
  });
});

describe('buildEscTourSteps — one script per team', () => {
  it('is the shared tour when nobody has picked a team', () => {
    expect(buildEscTourSteps(null)).toBe(ESC_TOUR_STEPS);
  });

  it('asks for the team in every script, straight after the welcome', () => {
    for (const team of [null, ...TEAMS]) {
      const steps = buildEscTourSteps(team);

      expect(steps[0].id).toBe('welcome');
      expect(steps[1].id).toBe('team-picker');
      expect(steps[1].isTeamPicker).toBe(true);
      expect(steps[1].anchor).toBeUndefined();
    }
  });

  it.each(TEAMS)(
    'puts the %s chapter in one block just before Getting around',
    (team) => {
      const steps = buildEscTourSteps(team);
      const chapters = steps.map((step) => step.chapter);
      const first = chapters.indexOf(ESC_TOUR_TEAM_CHAPTERS[team]);
      const last = chapters.lastIndexOf(ESC_TOUR_TEAM_CHAPTERS[team]);

      expect(last - first + 1).toBe(ESC_TOUR_TEAM_STEPS[team].length);
      expect(chapters[last + 1]).toBe('Getting around');
      expect(steps[steps.length - 1].id).toBe('done');
      expect(steps).toHaveLength(
        ESC_TOUR_STEPS.length + ESC_TOUR_TEAM_STEPS[team].length,
      );
    },
  );

  it('never shows one team the other team’s chapter', () => {
    const salesIds = buildEscTourSteps('sales').map((step) => step.id);

    for (const step of ESC_TOUR_TEAM_STEPS.cs) {
      expect(salesIds).not.toContain(step.id);
    }
  });
});

describe('ESC_TOUR_TEAM_STEPS — held to the rules of the main script', () => {
  const allTeamSteps = TEAMS.flatMap((team) => ESC_TOUR_TEAM_STEPS[team]);

  it('has ids unique across every script', () => {
    const ids = [...ESC_TOUR_STEPS, ...allTeamSteps].map((step) => step.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(TEAMS)(
    'gives the %s chapter enough steps to be worth naming',
    (team) => {
      expect(ESC_TOUR_TEAM_STEPS[team].length).toBeGreaterThanOrEqual(3);
    },
  );

  it('keeps every step short enough to be read at a glance', () => {
    for (const step of allTeamSteps) {
      expect(step.title.length).toBeLessThanOrEqual(40);
      expect(step.body.length).toBeLessThanOrEqual(260);
    }
  });

  it('anchored steps never ask for a click the tour will swallow', () => {
    for (const step of allTeamSteps) {
      if (step.anchor !== undefined) {
        expect(`${step.title} ${step.body}`).not.toMatch(
          /\b(click|tap|press)\b/i,
        );
      }
    }
  });

  it('routes only to lists, each declared for the deploy-time check', () => {
    for (const step of allTeamSteps) {
      if (step.route === undefined) {
        continue;
      }

      expect(step.route).toBe(`/objects/${step.objectNamePlural}`);
      expect(ESC_TOUR_OBJECT_ROUTES).toContain(step.objectNamePlural);
    }
  });

  it('never walks into Tasks, which held no records when this was written', () => {
    for (const step of allTeamSteps) {
      expect(step.route).not.toBe('/objects/tasks');
    }
  });
});

describe('continueEscTourWithSteps — choosing a team mid-run', () => {
  const pickerRun = () => {
    openEscTour(buildEscTourSteps(null));
    goToNextEscTourStep();
  };

  it('steps from the picker into the team’s chapter', () => {
    pickerRun();
    expect(getEscTourSnapshot().showableSteps[1].id).toBe('team-picker');

    continueEscTourWithSteps(buildEscTourSteps('sales'));

    const { showableSteps, stepIndex } = getEscTourSnapshot();

    // On the step after the picker, in the NEW script — which now holds the team chapter.
    expect(showableSteps[stepIndex - 1].id).toBe('team-picker');
    expect(
      showableSteps.filter(
        (step) => step.chapter === ESC_TOUR_TEAM_CHAPTERS.sales,
      ),
    ).not.toHaveLength(0);
  });

  it('records the move like any other step', () => {
    const events: EscTourProgressEvent[] = [];

    pickerRun();
    subscribeToEscTourProgress((event) => events.push(event));
    continueEscTourWithSteps(buildEscTourSteps('cs'));

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('advanced');
    expect(events[0].stepIndex).toBe(2);
  });

  it('does nothing when no tour is open', () => {
    continueEscTourWithSteps(buildEscTourSteps('cs'));

    expect(getEscTourSnapshot().isOpen).toBe(false);
  });
});

describe('the picker in the popover', () => {
  const picker: EscTourStep = {
    id: 'team-picker',
    title: 'Which team are you in?',
    body: 'b',
    isTeamPicker: true,
  };

  const controller = (
    overrides: Partial<EscTourController> = {},
  ): EscTourController => ({
    isOpen: true,
    step: picker,
    stepIndex: 1,
    stepCount: 5,
    anchorRect: null,
    missingStepIds: [],
    isResumed: false,
    isWaitingForAnchor: false,
    open: jest.fn(),
    close: jest.fn(),
    next: jest.fn(),
    previous: jest.fn(),
    startOver: jest.fn(),
    team: null,
    chooseTeam: jest.fn(),
    ...overrides,
  });

  it('offers one button per team, and choosing one carries on with it', () => {
    const tour = controller();

    render(<EscTourOverlay tour={tour} />);

    for (const { label } of ESC_TOUR_TEAMS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Customer service' }));

    expect(tour.chooseTeam).toHaveBeenCalledWith('cs');
  });

  it('marks the remembered team as chosen', () => {
    render(<EscTourOverlay tour={controller({ team: 'sales' })} />);

    expect(screen.getByRole('button', { name: 'Sales' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Customer service' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows no team buttons on any other step', () => {
    render(
      <EscTourOverlay
        tour={controller({ step: { id: 'people', title: 'P', body: 'b' } })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Sales' })).toBeNull();
  });
});

describe('useEscTour — choosing a team and a page-read route', () => {
  it('chooseTeam remembers the team and walks into its chapter', () => {
    const { result } = renderHook(() => useEscTour(buildEscTourSteps(null)));

    act(() => result.current.open());
    act(() => result.current.next());
    act(() => result.current.chooseTeam('cs'));

    expect(getEscTourTeam()).toBe('cs');
    expect(result.current.team).toBe('cs');
    expect(
      getEscTourSnapshot().showableSteps.some(
        (step) => step.chapter === ESC_TOUR_TEAM_CHAPTERS.cs,
      ),
    ).toBe(true);
  });

  it('navigates to the route a step reads off the page', () => {
    const navigate = jest.fn();
    const steps: EscTourStep[] = [
      { id: 'start', title: 'S', body: 'b' },
      {
        id: 'customer',
        title: 'C',
        body: 'b',
        route: () => '/object/person/x',
        optional: true,
      },
    ];
    const { result } = renderHook(() => useEscTour(steps, navigate));

    act(() => result.current.open());
    act(() => result.current.next());

    expect(navigate).toHaveBeenCalledWith('/object/person/x');
  });

  it('skips a step at once, and quietly, when the page has nowhere to send it', () => {
    const navigate = jest.fn();
    const steps: EscTourStep[] = [
      { id: 'start', title: 'S', body: 'b' },
      {
        id: 'customer',
        title: 'C',
        body: 'b',
        route: () => null,
        optional: true,
      },
      { id: 'end', title: 'E', body: 'b' },
    ];
    const { result } = renderHook(() => useEscTour(steps, navigate));

    act(() => result.current.open());
    act(() => result.current.next());

    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.step?.id).toBe('end');
    expect(result.current.missingStepIds).toEqual([]);
  });
});
