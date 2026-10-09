import {
  ESC_TOUR_PERSON_RECORD_PREFIX,
  escTourPersonRecordRoute,
} from '@/esc-tour/utils/escTourPersonRecordRoute';

const UUID = '0b6c1f2e-3a4d-4e5f-8a9b-0c1d2e3f4a5b';

const listWithRow = (testId: string) => {
  const root = document.createElement('div');
  const row = document.createElement('tr');

  row.setAttribute('data-testid', testId);
  root.appendChild(row);

  return root;
};

describe('escTourPersonRecordRoute', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
  });

  it('stays on the person page the tour is already standing on', () => {
    const path = `${ESC_TOUR_PERSON_RECORD_PREFIX}${UUID}`;

    expect(escTourPersonRecordRoute(document.createElement('div'), path)).toBe(
      path,
    );
  });

  it('reads the first row of the People list', () => {
    expect(
      escTourPersonRecordRoute(
        listWithRow(`row-id-${UUID}`),
        '/objects/people',
      ),
    ).toBe(`${ESC_TOUR_PERSON_RECORD_PREFIX}${UUID}`);
  });

  it('reads the People list with a query string too', () => {
    expect(
      escTourPersonRecordRoute(
        listWithRow(`row-id-${UUID}`),
        '/objects/people?viewId=abc',
      ),
    ).toBe(`${ESC_TOUR_PERSON_RECORD_PREFIX}${UUID}`);
  });

  it.each([
    ['another object list', '/objects/companies'],
    ['a path that only starts like People', '/objects/peoplex'],
    ['the home page', '/'],
  ])('is null on %s, even with a row on the page', (_label, path) => {
    expect(escTourPersonRecordRoute(listWithRow(`row-id-${UUID}`), path)).toBe(
      null,
    );
  });

  it('is null on an empty People list', () => {
    expect(
      escTourPersonRecordRoute(
        document.createElement('div'),
        '/objects/people',
      ),
    ).toBeNull();
  });

  it('is null when the row id is not a uuid', () => {
    expect(
      escTourPersonRecordRoute(
        listWithRow('row-id-not-a-uuid'),
        '/objects/people',
      ),
    ).toBeNull();
  });

  it('defaults to the live document and the current location', () => {
    document.body.appendChild(listWithRow(`row-id-${UUID}`));
    window.history.pushState({}, '', '/objects/people');

    expect(escTourPersonRecordRoute()).toBe(
      `${ESC_TOUR_PERSON_RECORD_PREFIX}${UUID}`,
    );
  });
});
