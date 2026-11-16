// ESC Twenty — dependency floor probe. Runs INSIDE the running container:
//
//   docker exec -i twenty-esc-server-1 node - < esc/deploy/dependency-floor-probe.cjs
//
// Why: Dependabot reads the LOCKFILE and labels scopes from it; the image is what runs.
// deps1 (2026-11-16) trusted a `development` label and shipped proxy-addr 2.0.7 to
// production; deps2 still carried tar 6.2.1 nested under node-gyp/cacache/node-pre-gyp.
// This walks every node_modules tree in the container and reports any copy of a package
// below the floor this fork has already paid to reach. An upstream merge or a lockfile
// regeneration that brings one back fails the running-image watchdog on container start.
//
// Prints one line per offender and ONE verdict line, always:
//   ESC_DEP_FLOOR_VERDICT: ok scanned=<n>
//   ESC_DEP_FLOOR_VERDICT: below=<count> scanned=<n>
// No verdict line (crash, empty read) means CANNOT MEASURE, never ok.
'use strict';
const fs = require('fs');
const path = require('path');

// name -> lowest version allowed anywhere in the image (first patched of the critical).
const FLOORS = {
  'proxy-addr': '2.0.8', // GHSA-jqcg-44mw-7w3h
  handlebars: '4.7.10', // GHSA-8r5x-fm3f-whwj, GHSA-p8wg-vrv2-v86f
  protobufjs: '7.5.5', // GHSA-xq3m-2v4x-88gg
  tar: '7.5.19', // GHSA-23hp-3jrh-7fpw (also catches every 6.x)
  'form-data': '4.0.4', // GHSA-fjxv-7rqg-78g4
  '@nyariv/sandboxjs': '0.9.6', // GHSA-g8f2-4f4f-5jqw and nine earlier escapes
  'shell-quote': '1.8.4', // GHSA-w7jw-789q-3m8p
  'websocket-driver': '0.7.5', // GHSA-xv26-6w52-cph6
};

const ROOTS = (process.env.ESC_FLOOR_ROOTS || '/app/node_modules,/usr/local/lib/node_modules')
  .split(',')
  .filter(Boolean);

const parse = (v) => String(v).split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);

const below = (version, floor) => {
  const a = parse(version);
  const b = parse(floor);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0);
  }
  return false;
};

const listDir = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

const packageDirs = (nodeModules) => {
  const out = [];
  for (const entry of listDir(nodeModules)) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const full = path.join(nodeModules, entry.name);
    if (!entry.name.startsWith('@')) {
      out.push([entry.name, full]);
      continue;
    }
    for (const scoped of listDir(full)) {
      if (scoped.isDirectory()) out.push([`${entry.name}/${scoped.name}`, path.join(full, scoped.name)]);
    }
  }
  return out;
};

const findings = [];
let scanned = 0;
const walk = (nodeModules) => {
  for (const [name, dir] of packageDirs(nodeModules)) {
    scanned++;
    if (FLOORS[name]) {
      let version = null;
      try {
        version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
      } catch {}
      if (version && below(version, FLOORS[name])) findings.push(`${name}@${version} ${dir} (floor ${FLOORS[name]})`);
    }
    walk(path.join(dir, 'node_modules'));
  }
};

for (const root of ROOTS) walk(root);
for (const f of findings) console.log(`ESC_DEP_FLOOR_BELOW: ${f}`);
console.log(findings.length ? `ESC_DEP_FLOOR_VERDICT: below=${findings.length} scanned=${scanned}` : `ESC_DEP_FLOOR_VERDICT: ok scanned=${scanned}`);
