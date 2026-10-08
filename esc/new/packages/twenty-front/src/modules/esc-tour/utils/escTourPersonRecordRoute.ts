import { ESC_TOUR_TABLE_ROW_ANCHOR } from '@/esc-tour/constants/escTourAnchors';

/**
 * AppPath.RecordShowPage is '/object/:objectNameSingular/:objectRecordId'
 * (twenty-shared/src/types/AppPath.ts:25).
 */
export const ESC_TOUR_PERSON_RECORD_PREFIX = '/object/person/';

const ESC_TOUR_PEOPLE_LIST_PATH = '/objects/people';

const ROW_TEST_ID_PREFIX = 'row-id-';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where "one customer's page" is, read off the page the tour is standing on (RM #22317).
 *
 * Chapter 4 used to be reachable only by pressing Tour while already on a customer: a
 * record page needs a uuid, and no uuid can be written into shipped source. The People list
 * the tour has just walked (chapter 3) holds one — every row is
 * `data-testid="row-id-<uuid>"` (see ESC_TOUR_TABLE_ROW_ANCHOR) — so the route is read
 * from the first row, at the moment the tour reaches the chapter.
 *
 *   - Already on a person's page: stay there. Every later step of the chapter calls this
 *     again, and by then the list is gone; this is what keeps them on the same customer.
 *   - On the People list: the first row's person.
 *   - Anywhere else, or an empty list: `null`, and the steps are skipped. Rows on another
 *     list are not people, and a uuid sent to the wrong object lands on not-found.
 */
export const escTourPersonRecordRoute = (
  root: ParentNode = document,
  pathname: string = window.location.pathname,
): string | null => {
  if (pathname.startsWith(ESC_TOUR_PERSON_RECORD_PREFIX)) {
    return pathname;
  }

  if (
    pathname !== ESC_TOUR_PEOPLE_LIST_PATH &&
    !pathname.startsWith(`${ESC_TOUR_PEOPLE_LIST_PATH}?`)
  ) {
    return null;
  }

  const recordId = root
    .querySelector(ESC_TOUR_TABLE_ROW_ANCHOR)
    ?.getAttribute('data-testid')
    ?.slice(ROW_TEST_ID_PREFIX.length);

  return recordId !== undefined && UUID_PATTERN.test(recordId)
    ? `${ESC_TOUR_PERSON_RECORD_PREFIX}${recordId}`
    : null;
};
