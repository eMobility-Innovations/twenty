'use strict';
// A stand-in for Twenty's /graphql DATA endpoint, holding `escTourProgress` rows, for
// report-esc-tour-progress.cjs and request-esc-tour-replay.cjs.
//
//   FAKE_STATE=<json file: {"rows":[...]}> FAKE_LOG=<file> FAKE_PORT_FILE=<file> node fake-data-server.cjs
//
// FAKE_PAGE_SIZE=n   pages the list n rows at a time (default: everything in one page)
// FAKE_NO_CURSOR=1   claims a next page but hands back no cursor
// FAKE_IGNORE_UPDATES=1  answers every update as if it worked and changes nothing
const fs = require('fs');
const http = require('http');

const state = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'));
const pageSize = Number(process.env.FAKE_PAGE_SIZE || state.rows.length || 1);
const log = (line) => fs.appendFileSync(process.env.FAKE_LOG, `${line}\n`);

const answer = ({ query, variables }, headers) => {
  if (headers.authorization !== 'Bearer test-key') {
    return { errors: [{ message: 'Unauthenticated' }] };
  }
  if (query.includes('updateEscTourProgress')) {
    const row = state.rows.find((r) => r.id === variables.id);
    log(`update ${variables.id} ${JSON.stringify(variables.data)}`);
    if (row && process.env.FAKE_IGNORE_UPDATES !== '1') Object.assign(row, variables.data);
    fs.writeFileSync(process.env.FAKE_STATE, JSON.stringify(state));
    return { data: { updateEscTourProgress: { id: variables.id } } };
  }
  if (query.includes('escTourProgresses')) {
    const start = variables.after ? Number(variables.after) : 0;
    const edges = state.rows.slice(start, start + pageSize).map((node) => ({ node }));
    const hasNextPage = start + pageSize < state.rows.length;
    log(`list after=${variables.after}`);
    return {
      data: {
        escTourProgresses: {
          edges,
          pageInfo: {
            hasNextPage,
            endCursor: hasNextPage && process.env.FAKE_NO_CURSOR !== '1' ? String(start + pageSize) : null,
          },
        },
      },
    };
  }
  return { errors: [{ message: `fake: unhandled query ${query.slice(0, 60)}` }] };
};

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const reply = req.url === '/graphql' ? answer(JSON.parse(body), req.headers) : { errors: [{ message: 'wrong path' }] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply));
  });
});

server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(process.env.FAKE_PORT_FILE, String(server.address().port));
});
