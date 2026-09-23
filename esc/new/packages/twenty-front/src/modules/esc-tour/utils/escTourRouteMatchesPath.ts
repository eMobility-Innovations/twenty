import { type EscTourStep } from '@/esc-tour/types/EscTourStep';

/**
 * What is allowed to follow a step's route in the path for the two to still be the same
 * place.
 *
 * `/` — the record page under a list: `/objects/people/<uuid>`.
 * `?` — the view the list is showing: `/objects/people?viewId=<uuid>`.
 * `#`  — a fragment; nothing in the product uses one today, and a step is not going to
 *        stop matching the day something does.
 *
 * `window.location.pathname` carries neither the query string nor the fragment, so in the
 * browser only `/` is ever reached. The other two are here because the same function is
 * given whole hrefs in tests and, one day, will be given one by a caller who has a `to`
 * rather than a pathname — and a prefix test that quietly fails on `?` would look like a
 * missing anchor, which is the most expensive thing in this module to debug.
 */
const ESC_TOUR_ROUTE_BOUNDARIES = ['/', '?', '#'];

/**
 * Is the browser already on the page a step's `route` names?
 *
 * PREFIX, NOT EQUALITY, AND WHY IT IS NOT `startsWith` ON ITS OWN
 *
 * One list is served at three paths: `/objects/people`, `/objects/people?viewId=<uuid>`
 * once the browser has opened that list once (`lastVisitedViewPerObjectMetadataItemState`
 * is localStorage-backed, so permanently thereafter), and `/objects/people/<uuid>` for one
 * record in it. A step that says "this is the People list" is legitimately at home on all
 * three, so equality would navigate away from a page the reader was already on — a full
 * re-render, for nothing, in the middle of a step.
 *
 * A bare `startsWith` is the other failure: `/objects/peoplefoo` starts with
 * `/objects/people`, and a tour that spotlights the wrong list is worse than one that
 * spotlights nothing. The remainder therefore has to begin at a path boundary. This is the
 * same reasoning, and the same trap, as the `^="…?"` half of `escTourObjectAnchor`.
 *
 * A route of `/` matches `/` alone, not everything: the remainder `objects/people` starts
 * at no boundary. That is deliberate — the index page is a page like any other.
 */
export const escTourRouteMatchesPath = (
  route: string,
  pathname: string,
): boolean => {
  // `/objects/people/` and `/objects/people` are one route written two ways. Normalising
  // here rather than asking the script to be careful keeps the trap out of the step file.
  const normalisedRoute =
    route.length > 1 && route.endsWith('/') ? route.slice(0, -1) : route;

  if (!pathname.startsWith(normalisedRoute)) {
    return false;
  }

  const remainder = pathname.slice(normalisedRoute.length);

  return (
    remainder === '' ||
    ESC_TOUR_ROUTE_BOUNDARIES.some((boundary) => remainder.startsWith(boundary))
  );
};

/**
 * Does reaching this step mean going somewhere?
 *
 * False for every step with no `route` — those are the steps whose target is on screen
 * everywhere (the navigation drawer is, on every page), and moving the reader to a page
 * they did not ask for to show them something already in front of them would be a bug.
 */
export const escTourStepNeedsNavigation = (
  step: EscTourStep,
  pathname: string,
): boolean =>
  step.route !== undefined && !escTourRouteMatchesPath(step.route, pathname);
