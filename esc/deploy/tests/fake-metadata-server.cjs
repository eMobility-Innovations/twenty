'use strict';
// A stand-in for Twenty's /metadata GraphQL endpoint, holding just enough state for
// provision-esc-tour-progress.cjs: objects with fieldsList, and navigation menu items.
// Like the real server, creating an object ADDS a workspace-level sidebar entry for it.
//
//   FAKE_STATE=<json file> FAKE_LOG=<file> FAKE_PORT_FILE=<file> node fake-metadata-server.cjs
//
// FAKE_REFUSE=1 answers every mutation with a GraphQL permission error.
const fs = require('fs');
const http = require('http');

const state = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'));
let nextId = 1;
const id = () => `00000000-0000-0000-0000-${String(nextId++).padStart(12, '0')}`;
const log = (line) => fs.appendFileSync(process.env.FAKE_LOG, `${line}\n`);

const answer = ({ query, variables }, headers) => {
  if (headers.authorization !== 'Bearer test-key') {
    return { errors: [{ message: 'Unauthenticated' }] };
  }
  if (query.includes('mutation') && process.env.FAKE_REFUSE === '1') {
    log('REFUSED');
    return { errors: [{ message: 'Forbidden: missing DATA_MODEL permission' }] };
  }
  if (query.includes('createOneObject')) {
    const o = { id: id(), nameSingular: variables.input.object.nameSingular, fieldsList: [{ name: 'name' }] };
    state.objects.push(o);
    state.navItems.push({ id: id(), targetObjectMetadataId: o.id, userWorkspaceId: null });
    log(`createObject ${o.nameSingular}`);
    return { data: { createOneObject: o } };
  }
  if (query.includes('createOneField')) {
    const f = variables.input.field;
    state.objects.find((o) => o.id === f.objectMetadataId).fieldsList.push({ name: f.name });
    log(`createField ${f.name} ${f.type} nullable=${f.isNullable}`);
    return { data: { createOneField: { id: id(), name: f.name } } };
  }
  if (query.includes('deleteManyNavigationMenuItems')) {
    state.navItems = state.navItems.filter((n) => !variables.ids.includes(n.id));
    log(`deleteNav ${variables.ids.join(',')}`);
    return { data: { deleteManyNavigationMenuItems: variables.ids.map((i) => ({ id: i })) } };
  }
  if (query.includes('navigationMenuItems')) {
    return { data: { navigationMenuItems: state.navItems } };
  }
  if (query.includes('objects(')) {
    return { data: { objects: { edges: state.objects.map((node) => ({ node })) } } };
  }
  return { errors: [{ message: `fake: unhandled query ${query.slice(0, 60)}` }] };
};

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const reply = req.url === '/metadata' ? answer(JSON.parse(body), req.headers) : { errors: [{ message: 'wrong path' }] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply));
  });
});

server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(process.env.FAKE_PORT_FILE, String(server.address().port));
});
