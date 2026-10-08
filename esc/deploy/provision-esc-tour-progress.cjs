#!/usr/bin/env node
/**
 * Provision the `escTourProgress` custom object the tour saves progress into (RM #22314).
 *
 *   TWENTY_URL=http://localhost:3000 TWENTY_API_KEY=… node provision-esc-tour-progress.cjs          # dry run
 *   TWENTY_URL=http://localhost:3000 TWENTY_API_KEY=… node provision-esc-tour-progress.cjs --apply  # writes
 *
 * WHY THIS IS DATA AND NOT A MIGRATION
 *
 * A fork TypeORM migration never runs on an existing instance (the entrypoint migrates only
 * when the `core` schema is absent — RM #19873 journal 36187). A custom object is created
 * through Twenty's own metadata API, into the workspace schema Twenty manages, exactly as an
 * admin clicking "New object" in Settings would. No server rebuild, no migration.
 *
 * WHAT IT DOES, IDEMPOTENTLY
 *
 * 1. Creates the object if absent. Every field below is created if absent. A field that
 *    exists is left alone — this script never alters or deletes a field.
 * 2. Removes the SIDEBAR ENTRY Twenty adds for every new object, for everyone
 *    (packages/twenty-server/src/engine/metadata-modules/object-metadata/
 *    object-metadata.service.ts:515, `computeFlatNavigationMenuItemToCreate`). Progress rows
 *    are an admin report, not something every agent should find in their left panel.
 *    Only WORKSPACE-level entries that target THIS object are removed — matched on the
 *    object's id, never on a label.
 *
 * Dry run is the default. The key needs data-model rights (an admin key); a refusal is
 * printed with the API's own message and the script exits non-zero.
 */
'use strict';

const OBJECT = {
  nameSingular: 'escTourProgress',
  namePlural: 'escTourProgresses',
  labelSingular: 'Tour progress',
  labelPlural: 'Tour progress',
  description:
    'Where each person is in the CRM tour. Written by the tour itself (RM #22314).',
  icon: 'IconMap',
};

// `name` is the object's own label field, created with the object; it holds the person's
// display name so the list reads as a report without a join.
const FIELDS = [
  { name: 'workspaceMemberId', type: 'TEXT', label: 'Workspace member id' },
  { name: 'outcome', type: 'TEXT', label: 'Outcome' },
  { name: 'lastStepId', type: 'TEXT', label: 'Last step' },
  { name: 'lastStepIndex', type: 'NUMBER', label: 'Last step number' },
  { name: 'furthestStepIndex', type: 'NUMBER', label: 'Furthest step number' },
  { name: 'totalSteps', type: 'NUMBER', label: 'Steps in the run' },
  { name: 'scriptVersion', type: 'NUMBER', label: 'Tour script version' },
  { name: 'completedAt', type: 'DATE_TIME', label: 'Completed at' },
  // RM #22317. Added after the first live provisioning (2026-10-08): the script is
  // idempotent, so re-running --apply on an instance that has the eight fields above
  // creates this one and nothing else. The tour's lookup ASKS for it, so it must exist
  // before the image that reads it is swapped in, or saved progress turns itself off.
  { name: 'team', type: 'TEXT', label: 'Team' },
];

/**
 * Pure: what has to happen, given what the workspace has. `objects` is the metadata API's
 * `objects.edges[].node` list with `fieldsList`; `navItems` is `navigationMenuItems`.
 */
const plan = (objects, navItems) => {
  const existing = objects.find((o) => o.nameSingular === OBJECT.nameSingular);
  const haveFields = new Set(
    ((existing && existing.fieldsList) || []).map((f) => f.name),
  );

  return {
    createObject: existing === undefined,
    objectId: existing ? existing.id : null,
    createFields: FIELDS.filter((f) => !haveFields.has(f.name)),
    removeNavItemIds: existing
      ? navItems
          .filter(
            (item) =>
              item.targetObjectMetadataId === existing.id &&
              (item.userWorkspaceId === null ||
                item.userWorkspaceId === undefined),
          )
          .map((item) => item.id)
      : [],
  };
};

const gqlClient = (baseUrl, apiKey) => async (query, variables = {}) => {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/metadata`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await response.text();
  let body;

  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${response.status}, not JSON: ${text.slice(0, 200)}`);
  }

  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error(body.errors.map((e) => e.message).join('; '));
  }

  if (!response.ok || body.data === undefined || body.data === null) {
    throw new Error(`HTTP ${response.status} with no data`);
  }

  return body.data;
};

const READ_OBJECTS = `query { objects(paging: { first: 1000 }) { edges { node {
  id nameSingular fieldsList { name } } } } }`;
const READ_NAV = `query { navigationMenuItems { id targetObjectMetadataId userWorkspaceId } }`;
const CREATE_OBJECT = `mutation($input: CreateOneObjectInput!) {
  createOneObject(input: $input) { id nameSingular } }`;
const CREATE_FIELD = `mutation($input: CreateOneFieldMetadataInput!) {
  createOneField(input: $input) { id name } }`;
const DELETE_NAV = `mutation($ids: [UUID!]!) {
  deleteManyNavigationMenuItems(ids: $ids) { id } }`;

const readState = async (gql) => {
  const objects = (await gql(READ_OBJECTS)).objects.edges.map((e) => e.node);
  const navItems = (await gql(READ_NAV)).navigationMenuItems;

  return { objects, navItems };
};

const run = async ({ baseUrl, apiKey, apply, log }) => {
  const gql = gqlClient(baseUrl, apiKey);
  let state = await readState(gql);
  let steps = plan(state.objects, state.navItems);

  log(
    `plan: createObject=${steps.createObject} createFields=[${steps.createFields
      .map((f) => f.name)
      .join(',')}] removeNavItems=${steps.removeNavItemIds.length}`,
  );

  if (!apply) {
    log('dry run — nothing written. Re-run with --apply.');
    return steps;
  }

  if (steps.createObject) {
    await gql(CREATE_OBJECT, { input: { object: OBJECT } });
    log(`created object ${OBJECT.nameSingular}`);
    // Re-read: the new object's id, and the sidebar entry Twenty just added for it.
    state = await readState(gql);
    steps = plan(state.objects, state.navItems);
  }

  for (const field of steps.createFields) {
    await gql(CREATE_FIELD, {
      input: {
        field: {
          ...field,
          objectMetadataId: steps.objectId,
          isNullable: true,
        },
      },
    });
    log(`created field ${field.name}`);
  }

  if (steps.removeNavItemIds.length > 0) {
    await gql(DELETE_NAV, { ids: steps.removeNavItemIds });
    log(`removed ${steps.removeNavItemIds.length} sidebar entr(y/ies)`);
  }

  // Read back: done means the workspace now says so, not that every call returned.
  const final = await readState(gql);
  const after = plan(final.objects, final.navItems);

  if (after.createObject || after.createFields.length > 0 || after.removeNavItemIds.length > 0) {
    throw new Error(`read-back still shows work to do: ${JSON.stringify(after)}`);
  }

  log('ESC_TOUR_PROGRESS: provisioned and verified');
  return after;
};

module.exports = { plan, run, OBJECT, FIELDS };

// `[stdin]` too: DEPLOY.md runs this as `docker exec -i … node - < file`, and piped on stdin
// `require.main === module` is FALSE — without this the script exited 0 having done nothing,
// which reads exactly like success. Measured 2026-10-07.
if (require.main === module || module.id === '[stdin]') {
  const baseUrl = process.env.TWENTY_URL;
  const apiKey = process.env.TWENTY_API_KEY;

  if (!baseUrl || !apiKey) {
    console.error('TWENTY_URL and TWENTY_API_KEY are required');
    process.exit(2);
  }

  run({
    baseUrl,
    apiKey,
    apply: process.argv.includes('--apply'),
    log: (m) => console.log(m),
  }).catch((error) => {
    console.error(`ESC_TOUR_PROGRESS: FAILED — ${error.message}`);
    process.exit(1);
  });
}
