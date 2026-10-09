'use strict';
/**
 * Reading and writing `escTourProgress` rows through the workspace's DATA API (`/graphql`),
 * for the two admin scripts beside this directory: the drop-out report (RM #22316) and the
 * replay request (RM #22315). The metadata API (`/metadata`, the provisioner) creates the
 * object; this reads and writes its rows.
 *
 * Operation shapes are the ones the tour itself sends (escTourProgressClient.ts), which are
 * upstream's own generated names: plural query with `edges { node }`, `update<X>(id:, data:)`.
 */

const ROW_FIELDS = `id name workspaceMemberId outcome team lastStepId lastStepIndex
  lastChapter furthestStepIndex totalSteps endReason endedAt completedAt replayRequested
  updatedAt`;

const LIST_ROWS = `query($after: String) {
  escTourProgresses(first: 200, after: $after) {
    edges { node { ${ROW_FIELDS} } }
    pageInfo { hasNextPage endCursor }
  } }`;

const UPDATE_ROW = `mutation($id: UUID!, $data: EscTourProgressUpdateInput!) {
  updateEscTourProgress(id: $id, data: $data) { id replayRequested } }`;

const dataClient = (baseUrl, apiKey) => async (query, variables = {}) => {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/graphql`, {
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

/**
 * Every row, page by page. A page that claims more and hands back no cursor is an error,
 * not the end: a report or a reset built on a silently short read is wrong about the
 * people it left out.
 */
const listRows = async (gql) => {
  const rows = [];
  let after = null;

  for (;;) {
    const page = (await gql(LIST_ROWS, { after })).escTourProgresses;

    rows.push(...page.edges.map((edge) => edge.node));

    if (!page.pageInfo.hasNextPage) {
      return rows;
    }

    if (!page.pageInfo.endCursor) {
      throw new Error('hasNextPage with no endCursor — refusing a short read');
    }

    after = page.pageInfo.endCursor;
  }
};

const updateRow = (gql, id, data) => gql(UPDATE_ROW, { id, data });

/** Reads TWENTY_URL / TWENTY_API_KEY, or exits 2 naming what is missing. */
const requireEnv = () => {
  const baseUrl = process.env.TWENTY_URL;
  const apiKey = process.env.TWENTY_API_KEY;

  if (!baseUrl || !apiKey) {
    console.error('TWENTY_URL and TWENTY_API_KEY are required');
    process.exit(2);
  }

  return { baseUrl, apiKey };
};

module.exports = { dataClient, listRows, updateRow, requireEnv };
