import { type EscTourStep } from '@/esc-tour/types/EscTourStep';
import {
  escTourRouteMatchesPath,
  escTourStepNeedsNavigation,
} from '@/esc-tour/utils/escTourRouteMatchesPath';

// A real view id off the production workspace's shape. The sidebar and the list page both
// carry one the moment an index view exists, which is always, in practice.
const VIEW_ID = '6f1f4d2a-9b3e-4f7a-8c21-0d9e5b7a3c14';
const RECORD_ID = 'c0a3d1e7-2b44-4a6f-9c8d-51e2f7b60a93';

describe('escTourRouteMatchesPath', () => {
  it('matches the route exactly', () => {
    expect(escTourRouteMatchesPath('/objects/people', '/objects/people')).toBe(
      true,
    );
  });

  // The three paths one list is served at. A step that says "this is the People list" is
  // at home on all of them, and navigating away from one of them would be a re-render of
  // the whole page for nothing, mid-step.
  it('matches the same list with a view and with a record under it', () => {
    expect(
      escTourRouteMatchesPath(
        '/objects/people',
        `/objects/people/${RECORD_ID}`,
      ),
    ).toBe(true);
    expect(
      escTourRouteMatchesPath(
        '/objects/people',
        `/objects/people?viewId=${VIEW_ID}`,
      ),
    ).toBe(true);
    expect(
      escTourRouteMatchesPath('/objects/people', '/objects/people#top'),
    ).toBe(true);
  });

  // The failure a bare startsWith would ship. A tour that spotlights the wrong list is
  // worse than one that spotlights nothing — the same trap as the `^="…?"` half of
  // escTourObjectAnchor.
  it('does not match a different route that merely starts with the same letters', () => {
    expect(
      escTourRouteMatchesPath('/objects/people', '/objects/peoplefoo'),
    ).toBe(false);
    expect(
      escTourRouteMatchesPath('/objects/people', '/objects/peopleSoftware'),
    ).toBe(false);
  });

  it('does not match a shorter path, or an unrelated one', () => {
    expect(escTourRouteMatchesPath('/objects/people', '/objects')).toBe(false);
    expect(
      escTourRouteMatchesPath('/objects/people', '/settings/profile'),
    ).toBe(false);
  });

  it('treats a trailing slash on the route as the same route', () => {
    expect(escTourRouteMatchesPath('/objects/people/', '/objects/people')).toBe(
      true,
    );
    expect(
      escTourRouteMatchesPath(
        '/objects/people/',
        `/objects/people/${RECORD_ID}`,
      ),
    ).toBe(true);
  });

  // The index page is a page like any other. If `/` matched everything, a step that wanted
  // the home screen would consider every page in the product to be it.
  it('does not let a route of / swallow every other path', () => {
    expect(escTourRouteMatchesPath('/', '/')).toBe(true);
    expect(escTourRouteMatchesPath('/', '/objects/people')).toBe(false);
  });
});

describe('escTourStepNeedsNavigation', () => {
  const buildStep = (overrides: Partial<EscTourStep> = {}): EscTourStep => ({
    id: 'people-list',
    title: 'The People list',
    body: 'Everyone we have dealt with.',
    ...overrides,
  });

  // The navigation drawer is on screen on every page in the product, so a step anchored on
  // it must never move the reader — being sent to another page to be shown something
  // already in front of you is the sort of thing that makes a tour feel out of control.
  it('never navigates for a step with no route', () => {
    expect(escTourStepNeedsNavigation(buildStep(), '/objects/companies')).toBe(
      false,
    );
  });

  it('navigates when the browser is somewhere else', () => {
    expect(
      escTourStepNeedsNavigation(
        buildStep({ route: '/objects/people' }),
        '/objects/companies',
      ),
    ).toBe(true);
  });

  it('stays put when the browser is already on the step’s page', () => {
    expect(
      escTourStepNeedsNavigation(
        buildStep({ route: '/objects/people' }),
        `/objects/people/${RECORD_ID}`,
      ),
    ).toBe(false);
  });
});
