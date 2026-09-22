/**
 * One step of the ESC guided tour.
 *
 * `anchor` is a CSS selector resolved against the live document at the moment the step is
 * shown. Selectors name ROUTES (`a[href="/objects/people"]`), never generated class names:
 * a route is part of the product, a linaria hash is an artefact of the build and changes
 * without anyone deciding it should.
 *
 * A step whose anchor resolves to nothing is SKIPPED, never fatal, and is reported by
 * `useEscTour` so drift is visible instead of silently shortening the tour.
 */
export type EscTourStep = {
  /** Stable id. Used in reporting and in tests; never shown to the user. */
  id: string;
  /** Heading shown in the popover. */
  title: string;
  /** Body copy. One or two short sentences — this is read standing up, mid-shift. */
  body: string;
  /**
   * CSS selector for the element to spotlight. Omitted for steps that address the whole
   * screen (the welcome and the closing step), which render centred with no cut-out.
   */
  anchor?: string;
  /**
   * When set, the spotlight covers the nearest ancestor of the anchor matching this
   * selector instead of the anchor itself — so a step can highlight the whole sidebar by
   * naming one link inside it, without the sidebar needing an attribute of its own.
   */
  anchorAncestor?: string;
  /** Extra room, in px, between the spotlight edge and the highlighted element. */
  padding?: number;
};
