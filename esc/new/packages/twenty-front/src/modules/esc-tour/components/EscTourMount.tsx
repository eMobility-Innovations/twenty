import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { EscTourOverlay } from '@/esc-tour/components/EscTourOverlay';
import { ESC_TOUR_STEPS } from '@/esc-tour/constants/escTourSteps';
import { useEscTour } from '@/esc-tour/hooks/useEscTour';

/**
 * Where the tour is RENDERED, as opposed to where it is started.
 *
 * WHY THIS IS NOT THE BUTTON
 *
 * The Tour button lives inside the navigation drawer's "Other" section, and that
 * section's `AnimatedExpandableContainer` renders `{isExpanded && children}` —
 * collapsing "Other" unmounts everything inside it. While the overlay was mounted from
 * the button, collapsing the section mid-tour destroyed the tour, portal and all, in
 * the middle of somebody's first five minutes in the product. This component is mounted
 * as a SIBLING of that container so the tour outlives it; the state itself lives in the
 * module store, not in either component.
 *
 * KNOWN, AND ACCEPTED: the section itself is still unmounted by layout-customization
 * mode and by the AI-chat drawer tab, which swap the whole drawer out. A tour running
 * through either of those is lost. The collapsible section is the common case — it is
 * one click, next to the button, and it is the one that is fixed.
 *
 * WHY THE ROUTER HOOK IS CALLED HERE
 *
 * A tour that walks somebody through a list page and a record page has to change the page,
 * and `useNavigate` from react-router is how this codebase does it — upstream's own
 * `useNavigateApp` (packages/twenty-front/src/hooks/useNavigateApp.ts:5) and
 * `useNavigateSettings` (packages/twenty-front/src/hooks/useNavigateSettings.ts:6) are
 * each a `useNavigate()` and a path builder, nothing more.
 *
 * That the router context is above this component is PROVEN rather than assumed: the file
 * that renders it, `NavigationDrawerOtherSection`, calls `useNavigateSettings()` in its
 * own body, which would throw outside a `<Router>`. This component is its sibling in the
 * same render. So navigation costs the fork no second overlaid upstream file.
 */
export const EscTourMount = () => {
  const navigate = useNavigate();
  const tour = useEscTour(ESC_TOUR_STEPS, navigate);

  /**
   * A step that silently disappears is the failure mode of every anchored tour: upstream
   * renames a route, the step stops matching, and the tour just gets shorter without
   * anybody noticing. Naming the missing ids where a support person can read them is the
   * cheapest form of that alarm; it is not a substitute for a real detector.
   *
   * Only the NEWLY missing ones are printed. Now that the tour navigates, this list grows
   * DURING a run — a routed step whose page never produced its anchor is added when its
   * deadline expires — and re-printing the whole list each time it grew would report the
   * same step two and three times, under a count that reads like separate faults.
   *
   * It reports whether the tour is open or CLOSED, and that is deliberate. A run whose
   * every step turned out to be unreachable closes itself, and it closes carrying its
   * report (`skipUnreachableEscTourStep`); ignoring a closed tour would make the worst
   * case the silent one.
   */
  const reportedStepIdsRef = useRef<string[]>([]);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    // A new run is resolved from scratch, so what was reported about the last one is not
    // this one's news. Keyed on the transition rather than on `isOpen` being false,
    // because a closed tour may still be holding a report nobody has printed yet.
    const isNewRun = tour.isOpen && !wasOpenRef.current;

    wasOpenRef.current = tour.isOpen;

    if (isNewRun) {
      reportedStepIdsRef.current = [];
    }

    const unreportedStepIds = tour.missingStepIds.filter(
      (stepId) => !reportedStepIdsRef.current.includes(stepId),
    );

    if (unreportedStepIds.length === 0) {
      return;
    }

    reportedStepIdsRef.current = [
      ...reportedStepIdsRef.current,
      ...unreportedStepIds,
    ];

    // eslint-disable-next-line no-console
    console.warn(
      `[esc-tour] ${unreportedStepIds.length} step(s) skipped, anchor not found: ${unreportedStepIds.join(', ')}`,
    );
  }, [tour.isOpen, tour.missingStepIds]);

  return <EscTourOverlay tour={tour} />;
};
