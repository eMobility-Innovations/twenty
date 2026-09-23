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
 *
 * WHEN that resolution happens depends on `route`. A step with no route has to be on the
 * page the tour was opened from, so it is resolved at open(). A step WITH a route is about
 * a page nobody has visited yet — it is carried into the run regardless, the tour navigates
 * to its route when it reaches it, and the anchor is resolved there, with a deadline. See
 * `selectShowableEscTourSteps` and `ESC_TOUR_ANCHOR_DEADLINE_MS`.
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
  /**
   * Human-readable grouping, e.g. `The left panel`. Shown in the popover above the step
   * counter.
   *
   * It exists because the tour stopped being nine steps. A thirty-step run that only ever
   * says "step 17 of 30" tells the reader how much is left and nothing about what they are
   * being shown; a chapter name turns the same run into a handful of things with names.
   * Steps in one chapter simply repeat the same string — there is no chapter object,
   * because a chapter has no behaviour, only a label.
   */
  chapter?: string;
  /**
   * The path this step needs the browser to be on, e.g. `/objects/people`.
   *
   * Set it and the tour NAVIGATES there when it reaches the step, through the router —
   * see `useEscTour`. Leave it out for a step whose target is on screen everywhere (the
   * navigation drawer is, on every page of the product) and the tour shows the step
   * wherever the reader happens to be standing.
   *
   * Matched by PREFIX, not equality: one list is served at `/objects/people`,
   * `/objects/people?viewId=…` and `/objects/people/<uuid>`, and a step that names the
   * list is happy on any of them. The prefix respects path boundaries, so
   * `/objects/people` does not match `/objects/peoplefoo` — see `escTourRouteMatchesPath`.
   *
   * A step with a route is NOT resolved when the tour opens. It cannot be: its anchor is
   * on a page nobody has visited yet. See `selectShowableEscTourSteps`.
   */
  route?: string;
  /**
   * What happens when this step's anchor never appears.
   *
   * `true` — skip it QUIETLY. For a step describing something a workspace may or may not
   * have: an empty list has no first row to point at, and a workspace nobody has saved a
   * view in has no saved view. That absence is a fact about the data, not drift, and
   * reporting it would train whoever reads the report to skim it.
   *
   * Absent or `false` — skip it and NAME it, in `missingStepIds`. That is the alarm the
   * 2026-09-22 failure needed: six of nine steps matched nothing in production, the tour
   * silently got shorter, and the only trace was a `console.warn` nobody was reading.
   */
  optional?: boolean;
};
