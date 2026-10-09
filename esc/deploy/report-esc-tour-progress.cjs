#!/usr/bin/env node
/**
 * Where people drop out of the CRM tour (RM #22316). Read-only.
 *
 *   TWENTY_URL=http://localhost:3000 TWENTY_API_KEY=… node report-esc-tour-progress.cjs
 *   … node report-esc-tour-progress.cjs --names     # list the people in each group
 *   … node report-esc-tour-progress.cjs --json      # the same, as JSON
 *
 * Reads every `escTourProgress` row (one per person, written by the tour itself) and sorts
 * people into what happened to their LAST run:
 *
 *   never opened  — the row exists (created on their first page load) but Tour was never pressed
 *   finished      — Next on the last step
 *   closed early  — Skip tour / Escape part-way. Rows from before #22316 carry no reason;
 *                   they are counted here, which is what a dismissal was then.
 *   stranded      — the tour shut itself because its steps could not be found. A broken
 *                   tour, not a bored reader: kept apart so one is never read as the other.
 *   left mid-run  — still `inProgress` and untouched for longer than --stale-hours (24):
 *                   the tab was closed or reloaded and Tour never pressed again.
 *   on it now     — `inProgress` and recent.
 *
 * Then, for "closed early" and "left mid-run" together, WHERE: the chapter and step each
 * person was on, most common first. That table is the answer to "where do people quit".
 */
'use strict';

const {
  dataClient,
  listRows,
  requireEnv,
} = require('./lib/esc-tour-progress-rows.cjs');

const GROUPS = [
  'never opened',
  'finished',
  'closed early',
  'stranded',
  'left mid-run',
  'on it now',
];

const groupOf = (row, now, staleMs) => {
  switch (row.outcome) {
    case 'completed':
      return 'finished';
    case 'dismissed':
      return row.endReason === 'stranded' ? 'stranded' : 'closed early';
    case 'inProgress': {
      const touched = Date.parse(row.updatedAt);

      return Number.isFinite(touched) && now - touched < staleMs
        ? 'on it now'
        : 'left mid-run';
    }
    default:
      return 'never opened';
  }
};

/** Pure: the report, from the rows. */
const summarise = (rows, now, staleHours = 24) => {
  const staleMs = staleHours * 3600 * 1000;
  const groups = Object.fromEntries(GROUPS.map((group) => [group, []]));
  const dropOuts = new Map();

  for (const row of rows) {
    const group = groupOf(row, now, staleMs);

    groups[group].push(row.name || row.workspaceMemberId || row.id);

    if (group === 'closed early' || group === 'left mid-run') {
      const where = `${row.lastChapter || '(chapter not recorded)'} › ${
        row.lastStepId || '(no step)'
      }`;

      dropOuts.set(where, (dropOuts.get(where) || 0) + 1);
    }
  }

  return {
    people: rows.length,
    counts: Object.fromEntries(GROUPS.map((g) => [g, groups[g].length])),
    names: groups,
    dropOutAt: [...dropOuts.entries()]
      .map(([where, people]) => ({ where, people }))
      .sort((a, b) => b.people - a.people || a.where.localeCompare(b.where)),
  };
};

const render = (report, withNames) => {
  const lines = [`Tour progress — ${report.people} people`, ''];

  for (const group of GROUPS) {
    lines.push(`  ${group.padEnd(14)} ${String(report.counts[group]).padStart(4)}`);

    if (withNames && report.names[group].length > 0) {
      lines.push(`      ${report.names[group].join(', ')}`);
    }
  }

  lines.push('', 'Where people stopped (closed early + left mid-run):');

  if (report.dropOutAt.length === 0) {
    lines.push('  nobody has stopped part-way');
  }

  for (const { where, people } of report.dropOutAt) {
    lines.push(`  ${String(people).padStart(4)}  ${where}`);
  }

  return lines.join('\n');
};

const run = async ({ baseUrl, apiKey, argv, now = Date.now() }) => {
  const staleIndex = argv.indexOf('--stale-hours');
  const staleHours = staleIndex === -1 ? 24 : Number(argv[staleIndex + 1]);

  if (!Number.isFinite(staleHours) || staleHours <= 0) {
    throw new Error('--stale-hours needs a positive number');
  }

  const rows = await listRows(dataClient(baseUrl, apiKey));
  const report = summarise(rows, now, staleHours);

  return argv.includes('--json')
    ? JSON.stringify(report, null, 2)
    : render(report, argv.includes('--names'));
};

module.exports = { summarise, render, run, GROUPS };

if (require.main === module || module.id === '[stdin]') {
  run({ ...requireEnv(), argv: process.argv.slice(2) })
    .then((out) => console.log(out))
    .catch((error) => {
      console.error(`ESC_TOUR_REPORT: FAILED — ${error.message}`);
      process.exit(1);
    });
}
