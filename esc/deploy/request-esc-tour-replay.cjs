#!/usr/bin/env node
/**
 * Make the CRM tour open by itself, from the top, on somebody's next page load (RM #22315).
 * The admin reset — for one person, several, or everyone.
 *
 *   TWENTY_URL=… TWENTY_API_KEY=… node request-esc-tour-replay.cjs --member <workspaceMemberId>          # dry run
 *   TWENTY_URL=… TWENTY_API_KEY=… node request-esc-tour-replay.cjs --member <id> --member <id> --apply
 *   TWENTY_URL=… TWENTY_API_KEY=… node request-esc-tour-replay.cjs --everyone --apply
 *
 * It sets `replayRequested` on the person's progress row. The tour reads it on the next load,
 * opens the whole script from the first step, and clears it as it opens — so the request is
 * answered once, and stays in place for anybody who does not load the CRM until later. For
 * one person, ticking "Replay requested" on their row in the CRM does the same thing.
 *
 * Nothing is deleted and no progress is lost: the row keeps its history and the person's
 * team. Undo before they load the CRM: re-run with `--clear` (same selection).
 *
 * Dry run is the default and lists exactly who would change. A member id that matches no row
 * is an ERROR, not a skip — "reset Sam" that silently reset nobody is the failure to avoid.
 * People who have never loaded the CRM since saved progress shipped have no row yet; they
 * get the tour fresh anyway.
 */
'use strict';

const {
  dataClient,
  listRows,
  requireEnv,
  updateRow,
} = require('./lib/esc-tour-progress-rows.cjs');

const parseArgs = (argv) => {
  const members = [];

  argv.forEach((arg, index) => {
    if (arg === '--member') {
      members.push(argv[index + 1]);
    }
  });

  const everyone = argv.includes('--everyone');

  if (everyone === members.length > 0) {
    throw new Error('name people with --member <workspaceMemberId>, or pass --everyone — exactly one');
  }

  if (members.some((member) => !member || member.startsWith('--'))) {
    throw new Error('--member needs a workspace member id after it');
  }

  return {
    everyone,
    members,
    apply: argv.includes('--apply'),
    value: !argv.includes('--clear'),
  };
};

/** Pure: which rows change, or an error naming the ids that matched nobody. */
const select = (rows, { everyone, members, value }) => {
  if (!everyone) {
    const known = new Set(rows.map((row) => row.workspaceMemberId));
    const unknown = members.filter((member) => !known.has(member));

    if (unknown.length > 0) {
      throw new Error(`no progress row for: ${unknown.join(', ')}`);
    }
  }

  return rows.filter(
    (row) =>
      (everyone || members.includes(row.workspaceMemberId)) &&
      (row.replayRequested === true) !== value,
  );
};

const run = async ({ baseUrl, apiKey, argv, log }) => {
  const options = parseArgs(argv);
  const gql = dataClient(baseUrl, apiKey);
  const targets = select(await listRows(gql), options);
  const verb = options.value ? 'request a replay for' : 'clear the replay request of';

  log(`plan: ${verb} ${targets.length} ${targets.length === 1 ? 'person' : 'people'}`);

  for (const row of targets) {
    log(`  ${row.name || '(no name)'}  ${row.workspaceMemberId}`);
  }

  if (!options.apply) {
    log('dry run — nothing written. Re-run with --apply.');
    return targets.length;
  }

  for (const row of targets) {
    await updateRow(gql, row.id, { replayRequested: options.value });
  }

  // Read back: done means the rows now say so, not that every call returned.
  const wrong = (await listRows(gql)).filter(
    (row) =>
      targets.some((target) => target.id === row.id) &&
      (row.replayRequested === true) !== options.value,
  );

  if (wrong.length > 0) {
    throw new Error(`read-back: ${wrong.length} row(s) did not change`);
  }

  log(`ESC_TOUR_REPLAY: ${targets.length} row(s) updated and verified`);
  return targets.length;
};

module.exports = { parseArgs, select, run };

if (require.main === module || module.id === '[stdin]') {
  run({ ...requireEnv(), argv: process.argv.slice(2), log: (m) => console.log(m) }).catch(
    (error) => {
      console.error(`ESC_TOUR_REPLAY: FAILED — ${error.message}`);
      process.exit(1);
    },
  );
}
