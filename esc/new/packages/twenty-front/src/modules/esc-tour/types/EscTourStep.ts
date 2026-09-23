/**
 * One step of the ESC guided tour.
 *
 * `anchor` is a CSS selector resolved against the live document at the moment the step is
 * shown. Selectors name ROUTES (`a[href="/objects/people"]`) or STABLE ATTRIBUTES
 * (`[data-click-outside-id="navigation-drawer"]`), never generated class names: a route and
 * a data attribute are part of the product, a linaria hash is an artefact of the build and
 * changes without anyone deciding it should.
 *
 * A step whose anchor resolves to nothing is SKIPPED, never fatal, and is reported by
 * `useEscTour` so drift is visible instead of silently shortening the tour.
 */
export type EscTourStep = {
  /** Stable id. Used in reporting and in tests; never shown to the user. */
  id: string;
  /** Heading shown in the popover. */
  title: string;
  /**
   * Body copy. One or two short sentences — this is read standing up, mid-shift.
   *
   * It DESCRIBES, it never instructs. The tour holds an interaction lock that swallows
   * every click outside the popover, so a line telling the reader to click the thing being
   * spotlighted asks for something the product will refuse while the tour is open.
   */
  body: string;
  /**
   * CSS selector for the element to spotlight. Omitted for steps that address the whole
   * screen (the welcome and the closing step), which render centred with no cut-out.
   *
   * A selector LIST is allowed, and is how object routes are anchored: the sidebar renders
   * `/objects/people` bare only until an index view exists, and `/objects/people?viewId=…`
   * from then on, so both forms have to match. Build it with `escTourObjectAnchor` rather
   * than by hand — a loose `^=` prefix would also match `/objects/peoplefoo`.
   */
  anchor?: string;
  /**
   * When set, the spotlight covers the nearest ancestor of the anchor matching this
   * selector instead of the anchor itself — so a step can highlight a container by naming
   * one element inside it, without the container needing an attribute of its own.
   *
   * No shipped step uses this today: the navigation drawer turned out to carry a stable
   * attribute of its own, and anchoring it directly means drift SHOWS UP (the step is
   * dropped and its id reported) instead of quietly falling back to the wrong element.
   * Kept because `resolveEscTourAnchor` supports it and a later step may need to name a
   * container that genuinely has no attribute.
   */
  anchorAncestor?: string;
  /**
   * The object route this step is about, e.g. `people`. Present on object steps only.
   *
   * This is the single source of truth for the route: `anchor` is DERIVED from it by
   * `escTourObjectAnchor`, and the deploy-time check reads `ESC_TOUR_OBJECT_ROUTES` off it
   * rather than regex-mining the selector string.
   */
  objectNamePlural?: string;
  /** Extra room, in px, between the spotlight edge and the highlighted element. */
  padding?: number;
};
